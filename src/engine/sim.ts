import type { Device, Topology } from '../model/types';
import { effectivePort, getNetConfig, isBridgeRole, roleOf, type DeviceRole, type NetConfig } from './config/netConfig';
import { EventQueue } from './core/eventQueue';
import { BROADCAST_MAC, etherTypeOf, type ArpPacket, type Frame, type IcmpMessage, type Ipv4Packet } from './core/types';
import { computeStp, type StpState } from './ethernet/stp';
import { deriveL3Interfaces, portCarriesVlan, vlanExists, type L3Interface } from './ip/interfaces';
import { formatIpv4, inSubnet } from './ip/ipv4';
import { buildRoutingTable, resolve, routesPackets, type Route } from './ip/routing';
import { computePhysical, portKey, type PhysicalState } from './physical/linkState';

/**
 * RailNet Sim discrete-event network engine (Phase 2).
 *
 * Models: physical link state, 802.1Q bridging with MAC learning and
 * simplified RSTP, port security, ARP, IPv4 forwarding with connected and
 * static routes, router subinterfaces and SVIs, ICMP echo / time-exceeded /
 * unreachable, ping and traceroute. Every frame step is recorded as a trace
 * for the packet inspector.
 *
 * Time unit: milliseconds of simulated time.
 */

// ---------------------------------------------------------------------------
// Constants (typical defaults)
// ---------------------------------------------------------------------------

export const MAC_AGING_MS = 300_000; // IOS default 300 s
export const ARP_TIMEOUT_MS = 14_400_000; // IOS default 4 h
export const ARP_RETRY_MS = 1_000;
export const ARP_QUEUE_HOLD_MS = 3_000; // hosts hold packets while resolving
export const PING_TIMEOUT_MS = 2_000; // IOS ping default
export const TRACE_TIMEOUT_MS = 3_000; // IOS traceroute default
export const LINK_FIXED_DELAY_MS = 0.01;
export const PROPAGATION_MS_PER_KM = 0.005; // ~5 µs/km in fibre
const MAX_FLOWS = 300;
const MAX_EVENTS_PER_RUN = 200_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProbeOutcome = 'pending' | 'reply' | 'timeout' | 'unreachable' | 'ttl-exceeded' | 'no-route';

export interface Probe {
  seq: number;
  ttl: number;
  flowId: number;
  sentAt: number;
  outcome: ProbeOutcome;
  from?: number;
  rttMs?: number;
  /** TTL of the received echo reply (shown by Windows ping). */
  replyTtl?: number;
  code?: string;
}

export interface ProbeSession {
  id: number;
  kind: 'ping' | 'traceroute';
  srcDeviceId: string;
  dst: number;
  srcIp?: number;
  count: number;
  timeoutMs: number;
  sizeBytes: number;
  maxTtl: number;
  probesPerHop: number;
  probes: Probe[];
  done: boolean;
  /** Why the session could not start (e.g. no IP address). */
  error?: string;
}

export interface FrameView {
  srcMac: string;
  dstMac: string;
  vlanTag?: number;
  etherType: string;
  summary: string;
  arp?: { op: string; senderMac: string; senderIp: string; targetMac: string; targetIp: string };
  ip?: { src: string; dst: string; ttl: number; protocol: string; icmp: string; sizeBytes: number };
}

export type TraceAction = 'send' | 'receive' | 'forward' | 'flood' | 'drop' | 'deliver' | 'learn' | 'reply' | 'queue';

export interface TraceStep {
  seq: number;
  time: number;
  deviceId: string;
  portId?: string;
  iface?: string;
  action: TraceAction;
  /** Which table/function made the decision. */
  table?: 'Interface' | 'STP' | 'VLAN' | 'Port security' | 'MAC table' | 'ARP cache' | 'Routing table' | 'ICMP' | 'Host stack';
  detail: string;
  frame?: FrameView;
}

export interface Flow {
  id: number;
  label: string;
  parentId?: number;
  startedAt: number;
  steps: TraceStep[];
}

export interface MacEntry {
  vlan: number;
  mac: string;
  port: string;
  type: 'DYNAMIC' | 'SECURE';
  ageMs: number;
}

export interface ArpEntry {
  ip: number;
  mac: string;
  iface: string;
  ageMs: number;
}

type SimEvent =
  | { type: 'deliver'; deviceId: string; portId: string; frame: Frame; linkId: string }
  | { type: 'probe-send'; sessionId: number }
  | { type: 'probe-timeout'; sessionId: number; index: number }
  | { type: 'arp-expire'; deviceId: string; ip: number };

interface PendingArp {
  iface: string;
  requestedAt: number;
  queue: Array<{ pkt: Ipv4Packet; flowId: number }>;
}

interface Runtime {
  mac: Map<number, Map<string, { port: string; at: number; secure: boolean }>>;
  arp: Map<number, { mac: string; iface: string; at: number }>;
  pending: Map<number, PendingArp>;
  secure: Map<string, Set<string>>;
  violations: Map<string, number>;
  counters: Map<string, { rx: number; tx: number; drops: number }>;
}

const newRuntime = (): Runtime => ({
  mac: new Map(),
  arp: new Map(),
  pending: new Map(),
  secure: new Map(),
  violations: new Map(),
  counters: new Map(),
});

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class Sim {
  topology: Topology = { meta: { name: '' }, devices: [], links: [] };
  now = 0;
  readonly queue = new EventQueue<SimEvent>();

  configs = new Map<string, NetConfig>();
  phys: PhysicalState = { ports: new Map(), links: new Map() };
  stp: StpState = { bridges: new Map(), ports: new Map() };
  l3 = new Map<string, L3Interface[]>();
  routes = new Map<string, Route[]>();

  readonly cuts = new Set<string>();
  readonly errDisabled = new Map<string, Set<string>>();
  private runtime = new Map<string, Runtime>();
  private devices = new Map<string, Device>();
  readonly sessions = new Map<number, ProbeSession>();
  readonly flows = new Map<number, Flow>();
  private nextSession = 1;
  private nextFlow = 1;
  private stepSeq = 0;
  /** Last processed event, for the UI. */
  lastEvent?: { time: number; description: string; deviceId?: string; linkId?: string };
  private listeners = new Set<() => void>();
  version = 0;

  constructor(topology?: Topology) {
    if (topology) this.setTopology(topology);
  }

  // ----------------------------------------------------------- lifecycle --

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Applies a new topology/config. Dynamic tables survive where still valid. */
  setTopology(topo: Topology): void {
    const oldConfigs = this.configs;
    this.topology = topo;
    this.devices = new Map(topo.devices.map((d) => [d.id, d]));
    this.configs = new Map(topo.devices.map((d) => [d.id, getNetConfig(d)]));

    for (const id of [...this.runtime.keys()]) if (!this.devices.has(id)) this.runtime.delete(id);
    for (const id of [...this.errDisabled.keys()]) if (!this.devices.has(id)) this.errDisabled.delete(id);
    for (const id of [...this.cuts]) if (!topo.links.some((l) => l.id === id)) this.cuts.delete(id);

    // "shutdown" on an err-disabled port clears the err-disabled state and secure MACs (IOS recovery).
    for (const d of topo.devices) {
      const role = roleOf(d.kind);
      const ed = this.errDisabled.get(d.id);
      const rt = this.runtime.get(d.id);
      for (const p of d.ports) {
        const now = effectivePort(role, this.configs.get(d.id)!.interfaces[p.id]);
        const before = oldConfigs.get(d.id) ? effectivePort(role, oldConfigs.get(d.id)!.interfaces[p.id]) : undefined;
        if (now.shutdown && !before?.shutdown) {
          ed?.delete(p.id);
          rt?.secure.delete(p.id);
        }
        if (!now.portSecurity?.enabled) rt?.secure.delete(p.id);
      }
    }
    this.recompute();
    this.changed();
  }

  private recompute(): void {
    const oldStp = this.stp;
    this.phys = computePhysical(this.topology, this.configs, this.cuts, this.errDisabled);
    this.stp = computeStp(this.topology, this.configs, this.phys);
    this.l3.clear();
    this.routes.clear();
    for (const d of this.topology.devices) {
      const cfg = this.configs.get(d.id)!;
      const ifs = deriveL3Interfaces(d, cfg, this.phys, this.stp);
      this.l3.set(d.id, ifs);
      this.routes.set(d.id, buildRoutingTable(d.kind, cfg, ifs));
    }
    const stpChanged = [...this.stp.ports].some(([k, p]) => oldStp.ports.get(k)?.state !== p.state);

    // Flush MAC entries on ports that are no longer forwarding; a spanning-tree
    // topology change flushes all dynamic entries (RSTP TC behaviour).
    for (const [devId, rt] of this.runtime) {
      for (const [vlan, table] of rt.mac) {
        for (const [mac, e] of table) {
          const st = this.stp.ports.get(portKey(devId, e.port));
          const up = this.phys.ports.get(portKey(devId, e.port))?.operUp;
          if (!up || st?.state !== 'forwarding' || (stpChanged && !e.secure)) table.delete(mac);
        }
        if (!table.size) rt.mac.delete(vlan);
      }
      // ARP entries for interfaces that disappeared or went down.
      const ifs = this.l3.get(devId) ?? [];
      for (const [ip, a] of rt.arp) if (!ifs.some((i) => i.name === a.iface && i.up)) rt.arp.delete(ip);
    }
  }

  /** Clears dynamic state (MAC/ARP tables, queue, sessions, traces). Config is kept. */
  reset(): void {
    this.queue.clear();
    this.runtime.clear();
    this.sessions.clear();
    this.flows.clear();
    this.errDisabled.clear();
    this.now = 0;
    this.lastEvent = undefined;
    this.recompute();
    this.changed();
  }

  cutLink(linkId: string): void {
    this.cuts.add(linkId);
    this.recompute();
    this.changed();
  }

  restoreLink(linkId: string): void {
    this.cuts.delete(linkId);
    this.recompute();
    this.changed();
  }

  // --------------------------------------------------------------- views --

  device(id: string): Device | undefined {
    return this.devices.get(id);
  }

  deviceByName(name: string): Device | undefined {
    return this.topology.devices.find((d) => d.name === name);
  }

  config(id: string): NetConfig | undefined {
    return this.configs.get(id);
  }

  interfaces(id: string): L3Interface[] {
    return this.l3.get(id) ?? [];
  }

  routingTable(id: string): Route[] {
    return this.routes.get(id) ?? [];
  }

  macTable(id: string): MacEntry[] {
    const rt = this.runtime.get(id);
    if (!rt) return [];
    const out: MacEntry[] = [];
    for (const [vlan, t] of rt.mac)
      for (const [mac, e] of t) {
        if (!e.secure && this.now - e.at > MAC_AGING_MS) continue;
        out.push({ vlan, mac, port: e.port, type: e.secure ? 'SECURE' : 'DYNAMIC', ageMs: this.now - e.at });
      }
    return out.sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));
  }

  arpTable(id: string): ArpEntry[] {
    const rt = this.runtime.get(id);
    if (!rt) return [];
    return [...rt.arp]
      .filter(([, a]) => this.now - a.at <= ARP_TIMEOUT_MS)
      .map(([ip, a]) => ({ ip, mac: a.mac, iface: a.iface, ageMs: this.now - a.at }))
      .sort((a, b) => a.ip - b.ip);
  }

  portCounters(id: string, port: string) {
    return this.runtime.get(id)?.counters.get(port) ?? { rx: 0, tx: 0, drops: 0 };
  }

  secureMacs(id: string, port: string): string[] {
    return [...(this.runtime.get(id)?.secure.get(port) ?? [])];
  }

  violationCount(id: string, port: string): number {
    return this.runtime.get(id)?.violations.get(port) ?? 0;
  }

  isErrDisabled(id: string, port: string): boolean {
    return !!this.errDisabled.get(id)?.has(port);
  }

  clearMacTable(id: string): void {
    const rt = this.runtime.get(id);
    if (!rt) return;
    for (const t of rt.mac.values()) for (const [m, e] of t) if (!e.secure) t.delete(m);
    this.changed();
  }

  clearArp(id: string): void {
    this.runtime.get(id)?.arp.clear();
    this.changed();
  }

  pendingEvents(): number {
    return this.queue.size;
  }

  /** Human-readable list of queued events (Events tab in Simulation mode). */
  describePending(limit = 50): Array<{ time: number; text: string; linkId?: string; deviceId?: string }> {
    return this.queue.list().slice(0, limit).map((e) => {
      const d = e.data;
      switch (d.type) {
        case 'deliver':
          return { time: e.time, text: `${viewFrame(d.frame).summary} → ${this.name(d.deviceId)} ${d.portId}`, linkId: d.linkId, deviceId: d.deviceId };
        case 'probe-send': {
          const s = this.sessions.get(d.sessionId);
          return { time: e.time, text: `${s?.kind ?? 'probe'} from ${this.name(s?.srcDeviceId ?? '')}: send next probe`, deviceId: s?.srcDeviceId };
        }
        case 'probe-timeout':
          return { time: e.time, text: `timeout check for probe ${d.index + 1} of session ${d.sessionId}` };
        case 'arp-expire':
          return { time: e.time, text: `ARP hold timer at ${this.name(d.deviceId)} for ${formatIpv4(d.ip)}`, deviceId: d.deviceId };
      }
    });
  }

  /** Links that have a frame in flight (for canvas animation in Simulation mode). */
  linksInFlight(): Set<string> {
    const s = new Set<string>();
    for (const e of this.queue.list()) if (e.data.type === 'deliver') s.add(e.data.linkId);
    return s;
  }

  // ------------------------------------------------------------ running --

  /** Processes one event. Returns false if the queue is empty. */
  step(): boolean {
    const e = this.queue.pop();
    if (!e) return false;
    this.now = Math.max(this.now, e.time);
    this.handle(e.data);
    this.changed();
    return true;
  }

  /** Runs until no events remain (bounded, to stop runaway loops). Returns events processed. */
  runUntilIdle(maxEvents = MAX_EVENTS_PER_RUN): number {
    let n = 0;
    while (n < maxEvents) {
      const e = this.queue.pop();
      if (!e) break;
      this.now = Math.max(this.now, e.time);
      this.handle(e.data);
      n++;
    }
    if (n) this.changed();
    return n;
  }

  /** Starts a ping. Returns the session id (results fill in as events run). */
  ping(srcDeviceId: string, dst: number, opts: { count?: number; timeoutMs?: number; sizeBytes?: number } = {}): number {
    return this.startSession('ping', srcDeviceId, dst, {
      count: opts.count ?? 5,
      timeoutMs: opts.timeoutMs ?? PING_TIMEOUT_MS,
      sizeBytes: opts.sizeBytes ?? 100,
      maxTtl: 255,
      probesPerHop: 1,
    });
  }

  /** Starts an ICMP-echo based traceroute (3 probes per hop, like IOS output). */
  traceroute(srcDeviceId: string, dst: number, opts: { maxTtl?: number; timeoutMs?: number; probesPerHop?: number } = {}): number {
    return this.startSession('traceroute', srcDeviceId, dst, {
      count: 0,
      timeoutMs: opts.timeoutMs ?? TRACE_TIMEOUT_MS,
      sizeBytes: 60,
      maxTtl: opts.maxTtl ?? 30,
      probesPerHop: opts.probesPerHop ?? 3,
    });
  }

  session(id: number): ProbeSession | undefined {
    return this.sessions.get(id);
  }

  private startSession(
    kind: ProbeSession['kind'],
    srcDeviceId: string,
    dst: number,
    o: { count: number; timeoutMs: number; sizeBytes: number; maxTtl: number; probesPerHop: number },
  ): number {
    const id = this.nextSession++;
    const s: ProbeSession = { id, kind, srcDeviceId, dst, probes: [], done: false, ...o };
    this.sessions.set(id, s);
    const dev = this.devices.get(srcDeviceId);
    if (!dev || roleOf(dev.kind) === 'opaque') {
      s.error = 'Device cannot originate IP traffic.';
      s.done = true;
    } else if (!this.interfaces(srcDeviceId).some((i) => i.ip !== undefined)) {
      s.error = 'No IP address configured on this device.';
      s.done = true;
    } else {
      this.queue.push(this.now, { type: 'probe-send', sessionId: id });
    }
    this.changed();
    return id;
  }

  // -------------------------------------------------------------- events --

  private handle(ev: SimEvent): void {
    switch (ev.type) {
      case 'deliver':
        this.lastEvent = { time: this.now, description: `Frame arrives at ${this.name(ev.deviceId)} ${ev.portId}`, deviceId: ev.deviceId, linkId: ev.linkId };
        this.receiveFrame(ev.deviceId, ev.portId, ev.frame);
        break;
      case 'probe-send':
        this.lastEvent = { time: this.now, description: `Probe sent by ${this.name(this.sessions.get(ev.sessionId)?.srcDeviceId ?? '')}` };
        this.sendProbe(ev.sessionId);
        break;
      case 'probe-timeout': {
        const s = this.sessions.get(ev.sessionId);
        const p = s?.probes[ev.index];
        if (s && p && p.outcome === 'pending') {
          p.outcome = 'timeout';
          this.lastEvent = { time: this.now, description: `Probe ${p.seq} timed out` };
          this.afterProbe(s);
        }
        break;
      }
      case 'arp-expire': {
        const rt = this.rt(ev.deviceId);
        const pend = rt.pending.get(ev.ip);
        if (pend && this.now - pend.requestedAt >= ARP_QUEUE_HOLD_MS - 1e-9) {
          for (const q of pend.queue)
            this.trace(q.flowId, { deviceId: ev.deviceId, iface: pend.iface, action: 'drop', table: 'ARP cache', detail: `ARP for ${formatIpv4(ev.ip)} unanswered — queued packet discarded.` });
          rt.pending.delete(ev.ip);
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------- probes --

  private sendProbe(sessionId: number): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.done) return;
    const index = s.probes.length;
    let ttl = 255;
    if (s.kind === 'traceroute') ttl = Math.floor(index / s.probesPerHop) + 1;
    const flowId = this.newFlow(`${s.kind === 'ping' ? 'Ping' : 'Traceroute'} ${this.name(s.srcDeviceId)} → ${formatIpv4(s.dst)} #${index + 1}${s.kind === 'traceroute' ? ` (TTL ${ttl})` : ''}`);
    const probe: Probe = { seq: index, ttl, flowId, sentAt: this.now, outcome: 'pending' };
    s.probes.push(probe);

    const egress = this.egressFor(s.srcDeviceId, s.dst);
    if (!egress) {
      probe.outcome = 'no-route';
      this.trace(flowId, { deviceId: s.srcDeviceId, action: 'drop', table: 'Routing table', detail: `No route to ${formatIpv4(s.dst)}.` });
      this.afterProbe(s);
      return;
    }
    s.srcIp ??= egress.srcIp;
    const pkt: Ipv4Packet = {
      kind: 'ipv4',
      src: s.srcIp,
      dst: s.dst,
      ttl,
      protocol: 'icmp',
      icmp: { type: 'echo-request', id: s.id, seq: index },
      sizeBytes: s.sizeBytes,
    };
    this.queue.push(this.now + s.timeoutMs, { type: 'probe-timeout', sessionId: s.id, index });
    this.trace(flowId, { deviceId: s.srcDeviceId, action: 'send', table: 'ICMP', detail: `ICMP echo request to ${formatIpv4(s.dst)}, TTL ${ttl}.` });
    // Packets to one of our own addresses are answered locally.
    if (this.isLocalAddress(s.srcDeviceId, s.dst)) {
      probe.outcome = 'reply';
      probe.from = s.dst;
      probe.rttMs = 0;
      this.trace(flowId, { deviceId: s.srcDeviceId, action: 'deliver', table: 'Host stack', detail: 'Destination is a local address — answered internally.' });
      this.afterProbe(s);
      return;
    }
    this.routeAndSend(s.srcDeviceId, pkt, flowId, { originated: true });
  }

  private afterProbe(s: ProbeSession): void {
    if (s.done) return;
    const last = s.probes[s.probes.length - 1];
    if (s.kind === 'ping') {
      if (s.probes.length >= s.count) s.done = true;
    } else {
      const hop = Math.floor((s.probes.length - 1) / s.probesPerHop);
      const hopProbes = s.probes.slice(hop * s.probesPerHop);
      const hopDone = hopProbes.length === s.probesPerHop;
      const reached = hopProbes.some((p) => p.outcome === 'reply' || p.outcome === 'unreachable' || p.outcome === 'no-route');
      if (hopDone && (reached || last.ttl >= s.maxTtl)) s.done = true;
    }
    if (!s.done) this.queue.push(this.now + 0.001, { type: 'probe-send', sessionId: s.id });
  }

  private matchProbe(icmp: IcmpMessage): { s: ProbeSession; p: Probe } | undefined {
    const s = this.sessions.get(icmp.id);
    const p = s?.probes[icmp.seq];
    if (!s || !p || p.outcome !== 'pending') return undefined;
    return { s, p };
  }

  // ------------------------------------------------------------ helpers --

  private name(deviceId: string): string {
    return this.devices.get(deviceId)?.name ?? deviceId;
  }

  private rt(deviceId: string): Runtime {
    let r = this.runtime.get(deviceId);
    if (!r) {
      r = newRuntime();
      this.runtime.set(deviceId, r);
    }
    return r;
  }

  private count(deviceId: string, port: string, k: 'rx' | 'tx' | 'drops'): void {
    const rt = this.rt(deviceId);
    const c = rt.counters.get(port) ?? { rx: 0, tx: 0, drops: 0 };
    c[k]++;
    rt.counters.set(port, c);
  }

  private newFlow(label: string, parentId?: number): number {
    const id = this.nextFlow++;
    this.flows.set(id, { id, label, parentId, startedAt: this.now, steps: [] });
    if (this.flows.size > MAX_FLOWS) this.flows.delete(this.flows.keys().next().value!);
    return id;
  }

  private trace(flowId: number, step: Omit<TraceStep, 'seq' | 'time'>, frame?: Frame): void {
    const f = this.flows.get(flowId);
    if (!f) return;
    f.steps.push({ ...step, seq: this.stepSeq++, time: this.now, frame: frame ? viewFrame(frame) : step.frame });
  }

  private role(deviceId: string): DeviceRole {
    const d = this.devices.get(deviceId);
    return d ? roleOf(d.kind) : 'opaque';
  }

  private isLocalAddress(deviceId: string, ip: number): boolean {
    return this.interfaces(deviceId).some((i) => i.up && i.ip === ip);
  }

  private egressFor(deviceId: string, dst: number): { iface: L3Interface; nextHop: number; srcIp: number } | undefined {
    const r = resolve(this.routingTable(deviceId), dst);
    if (!r) return undefined;
    const iface = this.interfaces(deviceId).find((i) => i.name === r.iface);
    if (!iface?.up || iface.ip === undefined) return undefined;
    return { iface, nextHop: r.nextHop, srcIp: iface.ip };
  }

  // -------------------------------------------------------- L1 transmit --

  private transmit(deviceId: string, portId: string, frame: Frame): void {
    const st = this.phys.ports.get(portKey(deviceId, portId));
    if (!st?.operUp || !st.peer || !st.linkId) {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Interface', detail: `${portId} is down (${st?.reason ?? 'not connected'}).` }, frame);
      this.count(deviceId, portId, 'drops');
      return;
    }
    const link = this.topology.links.find((l) => l.id === st.linkId)!;
    const delay = LINK_FIXED_DELAY_MS + link.lengthKm * PROPAGATION_MS_PER_KM;
    this.count(deviceId, portId, 'tx');
    this.queue.push(this.now + delay, { type: 'deliver', deviceId: st.peer.deviceId, portId: st.peer.portId, frame: { ...frame }, linkId: st.linkId });
  }

  // ------------------------------------------------------------ receive --

  private receiveFrame(deviceId: string, portId: string, frame: Frame): void {
    const st = this.phys.ports.get(portKey(deviceId, portId));
    if (!st?.operUp) {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Interface', detail: 'Ingress port is down.' }, frame);
      return;
    }
    this.count(deviceId, portId, 'rx');
    const role = this.role(deviceId);
    if (role === 'opaque') {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', detail: 'Device type does not forward packets in this simulator.' }, frame);
      return;
    }
    const cfg = this.configs.get(deviceId)!;
    if (isBridgeRole(role) && effectivePort(role, cfg.interfaces[portId]).switchport) {
      this.bridgeReceive(deviceId, portId, frame);
      return;
    }
    // Routed port / host NIC: pick the logical interface by 802.1Q tag.
    const ifs = this.interfaces(deviceId);
    let iface: L3Interface | undefined;
    if (frame.vlanTag !== undefined) {
      iface = ifs.find((i) => i.kind === 'sub' && i.port === portId && i.vlan === frame.vlanTag && !i.native);
      if (!iface) {
        this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Interface', detail: `Tagged frame (VLAN ${frame.vlanTag}) but no subinterface with that encapsulation on ${portId}.` }, frame);
        this.count(deviceId, portId, 'drops');
        return;
      }
    } else {
      iface = ifs.find((i) => i.kind === 'sub' && i.port === portId && i.native) ?? ifs.find((i) => i.kind === 'port' && i.port === portId);
    }
    if (!iface || !iface.up) {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Interface', detail: `No up L3 interface for this frame on ${portId}.` }, frame);
      return;
    }
    if (frame.dstMac !== iface.mac && frame.dstMac !== BROADCAST_MAC) {
      this.trace(frame.flowId, { deviceId, portId, iface: iface.name, action: 'drop', table: 'Interface', detail: 'Destination MAC is not this interface — NIC filters the frame.' }, frame);
      return;
    }
    this.l3Input(deviceId, iface, frame, portId);
  }

  // ------------------------------------------------------------- bridge --

  private bridgeReceive(deviceId: string, portId: string, frame: Frame): void {
    const role = this.role(deviceId);
    const cfg = this.configs.get(deviceId)!;
    const p = effectivePort(role, cfg.interfaces[portId]);
    const stp = this.stp.ports.get(portKey(deviceId, portId));
    if (stp?.state !== 'forwarding') {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'STP', detail: `${portId} is ${stp?.role ?? 'disabled'}/discarding — frame discarded.` }, frame);
      this.count(deviceId, portId, 'drops');
      return;
    }

    // Ingress VLAN classification (802.1Q).
    let vlan: number;
    if (p.mode === 'access') {
      if (frame.vlanTag !== undefined) {
        this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'VLAN', detail: 'Tagged frame received on an access port — dropped.' }, frame);
        this.count(deviceId, portId, 'drops');
        return;
      }
      vlan = p.accessVlan!;
    } else {
      vlan = frame.vlanTag ?? p.nativeVlan!;
      const allowed = p.trunkAllowed === 'all' || (p.trunkAllowed ?? []).includes(vlan);
      if (!allowed) {
        this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'VLAN', detail: `VLAN ${vlan} is not allowed on trunk ${portId}.` }, frame);
        this.count(deviceId, portId, 'drops');
        return;
      }
    }
    if (!vlanExists(cfg, vlan)) {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'VLAN', detail: `VLAN ${vlan} does not exist in the VLAN database — port is inactive for it.` }, frame);
      this.count(deviceId, portId, 'drops');
      return;
    }

    // Port security.
    const rt = this.rt(deviceId);
    if (p.portSecurity?.enabled) {
      const set = rt.secure.get(portId) ?? new Set<string>();
      if (!set.has(frame.srcMac)) {
        if (set.size < p.portSecurity.maximum) {
          set.add(frame.srcMac);
          rt.secure.set(portId, set);
          this.trace(frame.flowId, { deviceId, portId, action: 'learn', table: 'Port security', detail: `Secure MAC ${frame.srcMac} learned (${set.size}/${p.portSecurity.maximum}).` }, frame);
        } else {
          rt.violations.set(portId, (rt.violations.get(portId) ?? 0) + 1);
          if (p.portSecurity.violation === 'shutdown') {
            const ed = this.errDisabled.get(deviceId) ?? new Set<string>();
            ed.add(portId);
            this.errDisabled.set(deviceId, ed);
            this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Port security', detail: `Security violation from ${frame.srcMac}: port ${portId} err-disabled.` }, frame);
            this.recompute();
          } else {
            this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Port security', detail: `Security violation from ${frame.srcMac} (${p.portSecurity.violation}) — frame dropped.` }, frame);
          }
          this.count(deviceId, portId, 'drops');
          return;
        }
      }
    }

    // MAC learning.
    let table = rt.mac.get(vlan);
    if (!table) {
      table = new Map();
      rt.mac.set(vlan, table);
    }
    const existing = table.get(frame.srcMac);
    const secure = !!p.portSecurity?.enabled;
    if (!existing || existing.port !== portId) {
      this.trace(frame.flowId, { deviceId, portId, action: 'learn', table: 'MAC table', detail: `Learned ${frame.srcMac} on ${portId} in VLAN ${vlan}.` }, frame);
    }
    table.set(frame.srcMac, { port: portId, at: this.now, secure });

    this.bridgeForward(deviceId, vlan, { ...frame, vlanTag: undefined }, portId);
  }

  /** Forwards a frame inside VLAN `vlan`. `ingress` = arrival port, or 'cpu' when sent by the switch's own SVI. */
  private bridgeForward(deviceId: string, vlan: number, frame: Frame, ingress: string): void {
    const role = this.role(deviceId);
    const cfg = this.configs.get(deviceId)!;
    const svi = this.interfaces(deviceId).find((i) => i.kind === 'svi' && i.vlan === vlan && i.up);

    if (ingress !== 'cpu' && svi && frame.dstMac === svi.mac) {
      this.trace(frame.flowId, { deviceId, iface: svi.name, action: 'deliver', table: 'MAC table', detail: `Destination is the switch's own ${svi.name} MAC — passed to the IP stack.` }, frame);
      this.l3Input(deviceId, svi, frame, ingress);
      return;
    }

    const members = (exclude: string) =>
      this.devices.get(deviceId)!.ports.filter((pt) => {
        if (pt.id === exclude) return false;
        if (!portCarriesVlan(cfg, role, pt.id, vlan)) return false;
        if (!this.phys.ports.get(portKey(deviceId, pt.id))?.operUp) return false;
        return this.stp.ports.get(portKey(deviceId, pt.id))?.state === 'forwarding';
      });

    const flood = (why: string) => {
      const out = members(ingress);
      this.trace(frame.flowId, { deviceId, portId: ingress === 'cpu' ? undefined : ingress, action: 'flood', table: 'MAC table', detail: `${why} — flooded in VLAN ${vlan} to ${out.length ? out.map((p) => p.id).join(', ') : 'no other ports'}.` }, frame);
      for (const pt of out) this.egressSwitchport(deviceId, pt.id, vlan, frame);
    };

    if (frame.dstMac === BROADCAST_MAC) {
      if (ingress !== 'cpu' && svi) this.l3Input(deviceId, svi, frame, ingress);
      flood('Broadcast');
      return;
    }
    const entry = this.rt(deviceId).mac.get(vlan)?.get(frame.dstMac);
    const fresh = entry && (entry.secure || this.now - entry.at <= MAC_AGING_MS);
    if (!entry || !fresh) {
      flood(`Unknown unicast ${frame.dstMac}`);
      return;
    }
    if (entry.port === ingress) {
      this.trace(frame.flowId, { deviceId, portId: ingress, action: 'drop', table: 'MAC table', detail: `${frame.dstMac} is on the ingress port — filtered.` }, frame);
      return;
    }
    if (!members('').some((p) => p.id === entry.port)) {
      flood(`MAC table points to ${entry.port}, which is not forwarding for VLAN ${vlan}`);
      return;
    }
    this.trace(frame.flowId, { deviceId, portId: entry.port, action: 'forward', table: 'MAC table', detail: `${frame.dstMac} found on ${entry.port} (VLAN ${vlan}) — forwarded.` }, frame);
    this.egressSwitchport(deviceId, entry.port, vlan, frame);
  }

  private egressSwitchport(deviceId: string, portId: string, vlan: number, frame: Frame): void {
    const p = effectivePort(this.role(deviceId), this.configs.get(deviceId)!.interfaces[portId]);
    const tagged = p.mode === 'trunk' && vlan !== p.nativeVlan;
    this.transmit(deviceId, portId, { ...frame, vlanTag: tagged ? vlan : undefined });
  }

  // ----------------------------------------------------------------- L3 --

  private sendOnIface(deviceId: string, iface: L3Interface, frame: Frame): void {
    if (iface.kind === 'svi') {
      this.bridgeForward(deviceId, iface.vlan!, frame, 'cpu');
      return;
    }
    const tag = iface.kind === 'sub' && !iface.native ? iface.vlan : undefined;
    this.trace(frame.flowId, { deviceId, portId: iface.port, iface: iface.name, action: 'send', table: 'Interface', detail: `Sent out ${iface.name}${tag !== undefined ? ` tagged VLAN ${tag}` : ''}.` }, { ...frame, vlanTag: tag });
    this.transmit(deviceId, iface.port!, { ...frame, vlanTag: tag });
  }

  private l3Input(deviceId: string, iface: L3Interface, frame: Frame, portId: string): void {
    const pl = frame.payload;
    const rt = this.rt(deviceId);
    if (pl.kind === 'arp') {
      if (iface.ip === undefined || pl.targetIp !== iface.ip) {
        // RFC 826: refresh an existing entry for the sender even if not the target.
        const ex = rt.arp.get(pl.senderIp);
        if (ex && ex.iface === iface.name) rt.arp.set(pl.senderIp, { mac: pl.senderMac, iface: iface.name, at: this.now });
        if (pl.op === 'request') this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'ARP cache', detail: `ARP request for ${formatIpv4(pl.targetIp)} — not my address, ignored.` }, frame);
        return;
      }
      rt.arp.set(pl.senderIp, { mac: pl.senderMac, iface: iface.name, at: this.now });
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'learn', table: 'ARP cache', detail: `ARP cache: ${formatIpv4(pl.senderIp)} is at ${pl.senderMac}.` }, frame);
      if (pl.op === 'request') {
        const reply: Frame = {
          srcMac: iface.mac,
          dstMac: pl.senderMac,
          flowId: frame.flowId,
          payload: { kind: 'arp', op: 'reply', senderMac: iface.mac, senderIp: iface.ip, targetMac: pl.senderMac, targetIp: pl.senderIp },
        };
        this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'reply', table: 'ARP cache', detail: `ARP reply: ${formatIpv4(iface.ip)} is at ${iface.mac}.` }, reply);
        this.sendOnIface(deviceId, iface, reply);
      }
      this.drainPending(deviceId, pl.senderIp);
      return;
    }

    const pkt = pl;
    const broadcast = pkt.dst === 0xffffffff || (iface.network !== undefined && pkt.dst === (iface.network | (~(0xffffffff << (32 - iface.prefixLen!)) >>> 0)) >>> 0);
    if (this.isLocalAddress(deviceId, pkt.dst) || broadcast) {
      this.trace(frame.flowId, { deviceId, portId: portId === 'cpu' ? undefined : portId, iface: iface.name, action: 'deliver', table: 'Host stack', detail: `Packet for ${formatIpv4(pkt.dst)} is for this device.` }, frame);
      this.localIcmp(deviceId, pkt, frame.flowId);
      return;
    }
    const d = this.devices.get(deviceId)!;
    if (!routesPackets(d.kind, this.configs.get(deviceId)!)) {
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Host stack', detail: `Not for me and IP routing is disabled — dropped.` }, frame);
      return;
    }
    if (pkt.ttl <= 1) {
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Routing table', detail: 'TTL expired in transit — sending ICMP time exceeded.' }, frame);
      if (pkt.icmp.type === 'echo-request' && iface.ip !== undefined) this.sendIcmpError(deviceId, iface.ip, pkt, 'time-exceeded', 'ttl-exceeded', frame.flowId);
      return;
    }
    const fwd: Ipv4Packet = { ...pkt, ttl: pkt.ttl - 1 };
    this.routeAndSend(deviceId, fwd, frame.flowId, { originated: false, ingress: iface });
  }

  private localIcmp(deviceId: string, pkt: Ipv4Packet, flowId: number): void {
    const icmp = pkt.icmp;
    if (icmp.type === 'echo-request') {
      const role = this.role(deviceId);
      const replySrc = this.isLocalAddress(deviceId, pkt.dst) ? pkt.dst : this.interfaces(deviceId).find((i) => i.up && i.ip !== undefined)?.ip;
      if (replySrc === undefined) return;
      const reply: Ipv4Packet = {
        kind: 'ipv4',
        src: replySrc,
        dst: pkt.src,
        ttl: role === 'host' ? 128 : 255,
        protocol: 'icmp',
        icmp: { type: 'echo-reply', id: icmp.id, seq: icmp.seq },
        sizeBytes: pkt.sizeBytes,
      };
      this.trace(flowId, { deviceId, action: 'reply', table: 'ICMP', detail: `ICMP echo reply to ${formatIpv4(pkt.src)}.` });
      this.routeAndSend(deviceId, reply, flowId, { originated: true });
      return;
    }
    const m = this.matchProbe(icmp);
    if (!m || m.s.srcDeviceId !== deviceId) return;
    if (icmp.type === 'echo-reply') {
      m.p.outcome = 'reply';
      m.p.from = pkt.src;
      m.p.replyTtl = pkt.ttl;
    } else if (icmp.type === 'time-exceeded') {
      m.p.outcome = 'ttl-exceeded';
      m.p.from = pkt.src;
    } else {
      m.p.outcome = 'unreachable';
      m.p.from = pkt.src;
      m.p.code = icmp.code;
    }
    m.p.rttMs = this.now - m.p.sentAt;
    this.trace(flowId, { deviceId, action: 'deliver', table: 'ICMP', detail: `ICMP ${icmp.type} from ${formatIpv4(pkt.src)} (RTT ${m.p.rttMs.toFixed(3)} ms).` });
    this.afterProbe(m.s);
  }

  private sendIcmpError(deviceId: string, src: number, orig: Ipv4Packet, type: 'time-exceeded' | 'dest-unreachable', code: string, flowId: number): void {
    const err: Ipv4Packet = {
      kind: 'ipv4',
      src,
      dst: orig.src,
      ttl: 255,
      protocol: 'icmp',
      // Errors quote the original probe id/seq so the sender can match them.
      icmp: { type, id: orig.icmp.id, seq: orig.icmp.seq, code },
      sizeBytes: 56,
    };
    this.routeAndSend(deviceId, err, flowId, { originated: true });
  }

  private routeAndSend(deviceId: string, pkt: Ipv4Packet, flowId: number, o: { originated: boolean; ingress?: L3Interface }): void {
    const table = this.routingTable(deviceId);
    const r = resolve(table, pkt.dst);
    const iface = r ? this.interfaces(deviceId).find((i) => i.name === r.iface) : undefined;
    if (!r || !iface?.up || iface.ip === undefined) {
      this.trace(flowId, { deviceId, action: 'drop', table: 'Routing table', detail: `No route to ${formatIpv4(pkt.dst)}.` });
      if (!o.originated && pkt.icmp.type === 'echo-request' && o.ingress?.ip !== undefined) {
        this.sendIcmpError(deviceId, o.ingress.ip, pkt, 'dest-unreachable', 'net-unreachable', flowId);
      }
      return;
    }
    const via = r.route.protocol === 'C' || r.route.protocol === 'L' ? `directly connected via ${iface.name}` : `${r.route.protocol} route ${formatIpv4(r.route.network)}/${r.route.prefixLen} via ${formatIpv4(r.nextHop)} (${iface.name})`;
    this.trace(flowId, { deviceId, iface: iface.name, action: o.originated ? 'send' : 'forward', table: 'Routing table', detail: `${formatIpv4(pkt.dst)}: ${via}${o.originated ? '' : `, TTL now ${pkt.ttl}`}.` });

    const rt = this.rt(deviceId);
    const arp = rt.arp.get(r.nextHop);
    if (arp && arp.iface === iface.name && this.now - arp.at <= ARP_TIMEOUT_MS) {
      const frame: Frame = { srcMac: iface.mac, dstMac: arp.mac, payload: pkt, flowId };
      this.trace(flowId, { deviceId, iface: iface.name, action: 'send', table: 'ARP cache', detail: `Next hop ${formatIpv4(r.nextHop)} is at ${arp.mac}.` }, frame);
      this.sendOnIface(deviceId, iface, frame);
      return;
    }

    // ARP needed.
    const pend = rt.pending.get(r.nextHop);
    const routing = routesPackets(this.devices.get(deviceId)!.kind, this.configs.get(deviceId)!);
    if (!pend || this.now - pend.requestedAt >= ARP_RETRY_MS) {
      const arpFlow = this.newFlow(`ARP ${this.name(deviceId)}: who has ${formatIpv4(r.nextHop)}?`, flowId);
      const req: Frame = {
        srcMac: iface.mac,
        dstMac: BROADCAST_MAC,
        flowId: arpFlow,
        payload: { kind: 'arp', op: 'request', senderMac: iface.mac, senderIp: iface.ip, targetMac: '00:00:00:00:00:00', targetIp: r.nextHop },
      };
      this.trace(arpFlow, { deviceId, iface: iface.name, action: 'send', table: 'ARP cache', detail: `ARP request: who has ${formatIpv4(r.nextHop)}? Tell ${formatIpv4(iface.ip)}.` }, req);
      rt.pending.set(r.nextHop, { iface: iface.name, requestedAt: this.now, queue: routing ? [] : (pend?.queue ?? []) });
      this.queue.push(this.now + ARP_QUEUE_HOLD_MS, { type: 'arp-expire', deviceId, ip: r.nextHop });
      this.sendOnIface(deviceId, iface, req);
    }
    if (routing) {
      // IOS drops the packet that triggers ARP resolution (the familiar ".!!!!").
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'ARP cache', detail: `ARP entry for ${formatIpv4(r.nextHop)} incomplete — packet dropped (router behaviour).` });
    } else {
      const p = rt.pending.get(r.nextHop)!;
      if (p.queue.length < 5) p.queue.push({ pkt, flowId });
      this.trace(flowId, { deviceId, iface: iface.name, action: 'queue', table: 'ARP cache', detail: `Waiting for ARP reply for ${formatIpv4(r.nextHop)} — packet queued.` });
    }
  }

  private drainPending(deviceId: string, ip: number): void {
    const rt = this.rt(deviceId);
    const pend = rt.pending.get(ip);
    if (!pend) return;
    rt.pending.delete(ip);
    for (const q of pend.queue) this.routeAndSend(deviceId, q.pkt, q.flowId, { originated: true });
  }
}

// ---------------------------------------------------------------------------
// Frame view for the packet inspector
// ---------------------------------------------------------------------------

export function viewFrame(f: Frame): FrameView {
  const base = { srcMac: f.srcMac, dstMac: f.dstMac, vlanTag: f.vlanTag, etherType: etherTypeOf(f) };
  const p = f.payload;
  if (p.kind === 'arp') {
    const a = p as ArpPacket;
    return {
      ...base,
      summary: a.op === 'request' ? `ARP who-has ${formatIpv4(a.targetIp)} tell ${formatIpv4(a.senderIp)}` : `ARP ${formatIpv4(a.senderIp)} is-at ${a.senderMac}`,
      arp: { op: a.op, senderMac: a.senderMac, senderIp: formatIpv4(a.senderIp), targetMac: a.targetMac, targetIp: formatIpv4(a.targetIp) },
    };
  }
  const ip = p as Ipv4Packet;
  return {
    ...base,
    summary: `ICMP ${ip.icmp.type} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)} TTL ${ip.ttl}`,
    ip: {
      src: formatIpv4(ip.src),
      dst: formatIpv4(ip.dst),
      ttl: ip.ttl,
      protocol: 'ICMP (1)',
      icmp: `${ip.icmp.type}${ip.icmp.code ? ` (${ip.icmp.code})` : ''} id=${ip.icmp.id} seq=${ip.icmp.seq}`,
      sizeBytes: ip.sizeBytes,
    },
  };
}

export function isInSubnetOf(iface: L3Interface, ip: number): boolean {
  return iface.network !== undefined && inSubnet(ip, iface.network, iface.prefixLen!);
}
