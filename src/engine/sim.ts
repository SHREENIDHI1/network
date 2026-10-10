import type { Device, Topology } from '../model/types';
import { effectivePort, getNetConfig, isBridgeRole, roleOf, type DeviceRole, type NetConfig } from './config/netConfig';
import { EventQueue } from './core/eventQueue';
import { BROADCAST_MAC, etherTypeOf, type ArpPacket, type Frame, type IcmpMessage, type Ipv4Packet } from './core/types';
import { computeSegments, type Segment } from './ethernet/segments';
import { computeStp, type StpState } from './ethernet/stp';
import { bundleByName, computeEtherChannel, emptyEtherChannel, pickMember, type Bundle, type EtherChannelState } from './ethernet/etherchannel';
import { computeOspf, type OspfResult } from './ospf/ospf';
import { computeIsis, emptyIsis, type IsisResult } from './igp/isis';
import { computeRip, emptyRip, type RipResult } from './igp/rip';
import { computeFhrp, type FhrpResult } from './fhrp/fhrp';
import { evaluateAcl } from './security/acl';
import type { DhcpMessage } from './core/types';
import { broadcastOf, maskToPrefix, networkOf, parseIpv4, prefixToMask } from './ip/ipv4';
import { deriveL3Interfaces, portCarriesVlan, vlanExists, type L3Interface } from './ip/interfaces';
import { formatIpv4, inSubnet } from './ip/ipv4';
import { buildRoutingTable, resolve, routesPackets, type Route } from './ip/routing';
import { computePhysical, portKey, type PhysicalState } from './physical/linkState';

/**
 * RailMPLS Lab discrete-event network engine (Phase 2).
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
export const DHCP_TIMEOUT_MS = 4_000;
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
  ip?: { src: string; dst: string; ttl: number; dscp: number; protocol: string; /** ICMP or UDP/DHCP summary */ icmp: string; sizeBytes: number };
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
  table?: 'Interface' | 'STP' | 'VLAN' | 'Port security' | 'EtherChannel' | 'MAC table' | 'ARP cache' | 'Routing table' | 'ICMP' | 'Host stack' | 'ACL' | 'NAT' | 'DHCP';
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

export interface NatTranslation {
  insideLocal: number;
  insideGlobal: number;
  localId?: number;
  globalId?: number;
  outside?: number;
  static: boolean;
}

export interface DhcpLeaseInfo {
  ip: number;
  prefixLen: number;
  router?: number;
  dns?: number;
  server?: number;
  obtainedAt: number;
  apipa: boolean;
}

export interface DhcpClientState {
  state: 'selecting' | 'requesting' | 'bound' | 'apipa';
  xid: number;
  attempts: number;
  lease?: DhcpLeaseInfo;
  offer?: DhcpMessage;
}

export interface DhcpBinding {
  ip: number;
  mac: string;
  pool: string;
  at: number;
}

type SimEvent =
  | { type: 'deliver'; deviceId: string; portId: string; frame: Frame; linkId: string }
  | { type: 'dhcp-start'; deviceId: string; iface: string }
  | { type: 'dhcp-timeout'; deviceId: string; iface: string; xid: number }
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
  counters: Map<string, PortCounters>;
}

export interface PortCounters {
  rx: number;
  tx: number;
  drops: number;
  /** Frames damaged by a duplex mismatch: CRC errors seen on the full-duplex end. */
  crc: number;
  /** Late collisions seen on the half-duplex end of a duplex mismatch. */
  lateCollisions: number;
}

const zeroCounters = (): PortCounters => ({ rx: 0, tx: 0, drops: 0, crc: 0, lateCollisions: 0 });

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
  ec: EtherChannelState = emptyEtherChannel();
  /** Frames sent per link with a duplex mismatch (deterministic loss pattern). */
  private duplexSeq = new Map<string, number>();
  l3 = new Map<string, L3Interface[]>();
  routes = new Map<string, Route[]>();
  segments: Segment[] = [];
  fhrp: FhrpResult = { groups: [], byIface: new Map() };
  private fhrpActive = new Map<string, string>();
  /** Config as typed (before DHCP lease overlay). */
  private baseConfigs = new Map<string, NetConfig>();
  readonly aclHits = new Map<string, number[]>();
  readonly natTable = new Map<string, NatTranslation[]>();
  readonly dhcpClients = new Map<string, DhcpClientState>();
  readonly dhcpBindings = new Map<string, Map<number, DhcpBinding>>();
  private nextXid = 0x3903f326;
  isis: IsisResult = emptyIsis();
  rip: RipResult = emptyRip();
  ospf: OspfResult = { routerIds: new Map(), interfaces: [], neighbors: [], routes: new Map(), problems: [], lsdb: [], abrs: new Set(), asbrs: new Set() };

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
    this.baseConfigs = new Map(topo.devices.map((d) => [d.id, getNetConfig(d)]));
    this.configs = new Map(this.baseConfigs);

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

  /** Host NICs with a DHCP (or APIPA) lease get that address and gateway. */
  private applyLeases(): void {
    this.configs = new Map(this.baseConfigs);
    for (const d of this.topology.devices) {
      if (roleOf(d.kind) !== 'host') continue;
      const base = this.baseConfigs.get(d.id)!;
      let cfg: NetConfig | undefined;
      for (const p of d.ports) {
        if (!base.interfaces[p.id]?.dhcpClient) continue;
        cfg ??= structuredClone(base);
        const lease = this.dhcpClients.get(`${d.id}|${p.id}`)?.lease;
        if (lease) {
          cfg.interfaces[p.id] = { ...cfg.interfaces[p.id], ip: { address: formatIpv4(lease.ip), mask: prefixToMask(lease.prefixLen) } };
          if (lease.router !== undefined) cfg.defaultGateway = formatIpv4(lease.router);
          else delete cfg.defaultGateway;
        } else {
          delete cfg.interfaces[p.id].ip;
          delete cfg.defaultGateway;
        }
      }
      if (cfg) this.configs.set(d.id, cfg);
    }
  }

  private recompute(): void {
    this.applyLeases();
    const oldStp = this.stp;
    this.phys = computePhysical(this.topology, this.configs, this.cuts, this.errDisabled);
    this.ec = computeEtherChannel(this.topology, this.configs, this.phys);
    this.stp = computeStp(this.topology, this.configs, this.phys, this.ec);
    this.l3.clear();
    this.routes.clear();
    for (const d of this.topology.devices) {
      const cfg = this.configs.get(d.id)!;
      this.l3.set(d.id, deriveL3Interfaces(d, cfg, this.phys, this.stp));
    }
    // Control plane: broadcast domains → OSPF → routing tables.
    this.segments = computeSegments(this.topology, this.configs, this.phys, this.stp, this.l3);
    const base = new Map<string, Route[]>();
    for (const d of this.topology.devices) base.set(d.id, buildRoutingTable(d.kind, this.configs.get(d.id)!, this.l3.get(d.id)!));
    this.ospf = computeOspf(this.topology, this.configs, this.l3, this.phys, this.segments, base);
    this.isis = computeIsis(this.topology, this.configs, this.l3, this.segments);
    this.rip = computeRip(this.topology, this.configs, this.l3, this.segments);
    for (const d of this.topology.devices) {
      const dynamic = [...(this.ospf.routes.get(d.id) ?? []), ...(this.isis.routes.get(d.id) ?? []), ...(this.rip.routes.get(d.id) ?? [])];
      this.routes.set(d.id, buildRoutingTable(d.kind, this.configs.get(d.id)!, this.l3.get(d.id)!, dynamic));
    }

    // First-hop redundancy. A change of active router is announced by its hellos
    // from the virtual MAC, which moves that MAC in every switch's table.
    this.fhrp = computeFhrp(this.topology, this.configs, this.l3, this.phys, this.segments, this.fhrpActive);
    const movedMacs = new Set<string>();
    const nextActive = new Map<string, string>();
    for (const g of this.fhrp.groups) {
      if (!g.active) continue;
      const k = `${g.active.deviceId}|${g.active.iface}`;
      nextActive.set(g.key, k);
      if (this.fhrpActive.get(g.key) !== k) movedMacs.add(g.vmac);
    }
    this.fhrpActive = nextActive;
    if (movedMacs.size)
      for (const rtm of this.runtime.values()) for (const t of rtm.mac.values()) for (const m of movedMacs) t.delete(m);

    // DHCP clients: start on NICs that need an address; forget NICs no longer using DHCP.
    for (const d of this.topology.devices) {
      if (roleOf(d.kind) !== 'host') continue;
      const base = this.baseConfigs.get(d.id)!;
      for (const p of d.ports) {
        const k = `${d.id}|${p.id}`;
        if (!base.interfaces[p.id]?.dhcpClient) {
          this.dhcpClients.delete(k);
          continue;
        }
        if (!this.dhcpClients.has(k) && this.phys.ports.get(portKey(d.id, p.id))?.operUp) {
          this.dhcpClients.set(k, { state: 'selecting', xid: 0, attempts: 0 });
          this.queue.push(this.now, { type: 'dhcp-start', deviceId: d.id, iface: p.id });
        }
      }
    }
    const stpChanged = [...this.stp.ports].some(([k, p]) => oldStp.ports.get(k)?.state !== p.state);

    // Flush MAC entries on ports that are no longer forwarding; a spanning-tree
    // topology change flushes all dynamic entries (RSTP TC behaviour).
    for (const [devId, rt] of this.runtime) {
      for (const [vlan, table] of rt.mac) {
        for (const [mac, e] of table) {
          if (!this.logicalForwarding(devId, e.port) || (stpChanged && !e.secure)) table.delete(mac);
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
    this.aclHits.clear();
    this.natTable.clear();
    this.dhcpClients.clear();
    this.dhcpBindings.clear();
    this.fhrpActive.clear();
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

  portCounters(id: string, port: string): PortCounters {
    return this.runtime.get(id)?.counters.get(port) ?? zeroCounters();
  }

  /** EtherChannel bundles configured on a device ("show etherchannel summary"). */
  etherChannels(id: string): Bundle[] {
    return this.ec.bundles.get(id) ?? [];
  }

  /** Port-channel name for a bundled member port, else the port itself. */
  private lport(deviceId: string, portId: string): string {
    return this.ec.logical.get(portKey(deviceId, portId)) ?? portId;
  }

  /** Bundled, up members of a port-channel (or [port] for a plain port). */
  private physicalMembers(deviceId: string, lp: string): string[] {
    const b = bundleByName(this.ec, deviceId, lp);
    if (!b) return [lp];
    return b.members.filter((m) => m.flag === 'P' && this.phys.ports.get(portKey(deviceId, m.portId))?.operUp).map((m) => m.portId);
  }

  /** Is a logical port (physical port or port-channel) up and STP-forwarding? */
  private logicalForwarding(deviceId: string, lp: string): boolean {
    return this.physicalMembers(deviceId, lp).some(
      (p) => !!this.phys.ports.get(portKey(deviceId, p))?.operUp && this.stp.ports.get(portKey(deviceId, p))?.state === 'forwarding',
    );
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
        case 'dhcp-start':
          return { time: e.time, text: `DHCP client start on ${this.name(d.deviceId)} ${d.iface}`, deviceId: d.deviceId };
        case 'dhcp-timeout':
          return { time: e.time, text: `DHCP timeout check on ${this.name(d.deviceId)} ${d.iface}`, deviceId: d.deviceId };
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
      case 'dhcp-start':
        this.lastEvent = { time: this.now, description: `DHCP client starts on ${this.name(ev.deviceId)} ${ev.iface}`, deviceId: ev.deviceId };
        this.dhcpDiscover(ev.deviceId, ev.iface);
        break;
      case 'dhcp-timeout': {
        const c = this.dhcpClients.get(`${ev.deviceId}|${ev.iface}`);
        if (!c || c.xid !== ev.xid || c.state === 'bound' || c.state === 'apipa') break;
        this.lastEvent = { time: this.now, description: `DHCP timeout on ${this.name(ev.deviceId)}`, deviceId: ev.deviceId };
        if (c.attempts < 2) this.dhcpDiscover(ev.deviceId, ev.iface);
        else this.dhcpApipa(ev.deviceId, ev.iface);
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
      dscp: 0,
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

  private count(deviceId: string, port: string, k: keyof PortCounters): void {
    const rt = this.rt(deviceId);
    const c = rt.counters.get(port) ?? zeroCounters();
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

  /** Which device/interface owns an IP address (including active virtual IPs). */
  addressOwner(ip: number): { deviceId: string; iface: string } | undefined {
    for (const [devId, ifs] of this.l3) {
      for (const i of ifs) {
        if (!i.up) continue;
        if (i.ip === ip || this.ownedVips(devId, i.name).some((v) => v.vip === ip)) return { deviceId: devId, iface: i.name };
      }
    }
    return undefined;
  }

  /** Does this device route packets (router / L3 switch with ip routing)? */
  forwards(deviceId: string): boolean {
    const d = this.devices.get(deviceId);
    return !!d && routesPackets(d.kind, this.configs.get(deviceId)!);
  }

  private isLocalAddress(deviceId: string, ip: number): boolean {
    return this.interfaces(deviceId).some((i) => i.up && (i.ip === ip || this.ownedVips(deviceId, i.name).some((v) => v.vip === ip)));
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
    if (st.duplexMismatch) {
      // Simplified: every 4th frame on a duplex-mismatched link is destroyed by a late collision.
      const n = (this.duplexSeq.get(link.id) ?? 0) + 1;
      this.duplexSeq.set(link.id, n);
      if (n % 4 === 0) {
        const peer = this.phys.ports.get(portKey(st.peer.deviceId, st.peer.portId));
        const half = st.duplex === 'half' ? { d: deviceId, p: portId } : { d: st.peer.deviceId, p: st.peer.portId };
        const full = st.duplex === 'half' ? { d: st.peer.deviceId, p: st.peer.portId } : { d: deviceId, p: portId };
        this.count(half.d, half.p, 'lateCollisions');
        this.count(full.d, full.p, 'crc');
        this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'Interface', detail: `Duplex mismatch on this link (${st.duplex} here, ${peer?.duplex ?? '?'} at the far end): the frame was destroyed by a late collision / CRC error.` }, frame);
        return;
      }
    }
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
    if (role === 'hub') {
      const out = this.devices.get(deviceId)!.ports.filter((p) => p.id !== portId && this.phys.ports.get(portKey(deviceId, p.id))?.operUp);
      this.trace(frame.flowId, { deviceId, portId, action: 'flood', table: 'Interface', detail: `Hub repeats the bits out of every other port (${out.map((p) => p.id).join(', ') || 'none'}) — no MAC learning, one collision domain.` }, frame);
      for (const p of out) this.transmit(deviceId, p.id, frame);
      return;
    }
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
    if (frame.dstMac !== iface.mac && frame.dstMac !== BROADCAST_MAC && !this.ownedVips(deviceId, iface.name).some((v) => v.vmac === frame.dstMac)) {
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
    const flag = this.ec.flags.get(portKey(deviceId, portId));
    if (flag === 's') {
      this.trace(frame.flowId, { deviceId, portId, action: 'drop', table: 'EtherChannel', detail: `${portId} is a suspended EtherChannel member — frame discarded.` }, frame);
      this.count(deviceId, portId, 'drops');
      return;
    }
    const lp = this.lport(deviceId, portId);
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
    if (!existing || existing.port !== lp) {
      const via = lp !== portId ? ` (member ${portId})` : '';
      this.trace(frame.flowId, { deviceId, portId, action: 'learn', table: 'MAC table', detail: `Learned ${frame.srcMac} on ${lp}${via} in VLAN ${vlan}.` }, frame);
    }
    table.set(frame.srcMac, { port: lp, at: this.now, secure });

    this.bridgeForward(deviceId, vlan, { ...frame, vlanTag: undefined }, lp);
  }

  /** Forwards a frame inside VLAN `vlan`. `ingress` = arrival port, or 'cpu' when sent by the switch's own SVI. */
  private bridgeForward(deviceId: string, vlan: number, frame: Frame, ingress: string): void {
    const role = this.role(deviceId);
    const cfg = this.configs.get(deviceId)!;
    const svi = this.interfaces(deviceId).find((i) => i.kind === 'svi' && i.vlan === vlan && i.up);

    if (ingress !== 'cpu' && svi && (frame.dstMac === svi.mac || this.ownedVips(deviceId, svi.name).some((v) => v.vmac === frame.dstMac))) {
      this.trace(frame.flowId, { deviceId, iface: svi.name, action: 'deliver', table: 'MAC table', detail: `Destination is the switch's own ${svi.name} MAC — passed to the IP stack.` }, frame);
      this.l3Input(deviceId, svi, frame, ingress);
      return;
    }

    /** Logical egress ports (physical ports, or one entry per port-channel) forwarding in this VLAN. */
    const members = (exclude: string): string[] => {
      const out: string[] = [];
      for (const pt of this.devices.get(deviceId)!.ports) {
        const flag = this.ec.flags.get(portKey(deviceId, pt.id));
        if (flag === 's' || flag === 'D') continue;
        const lp = this.lport(deviceId, pt.id);
        if (lp === exclude || out.includes(lp)) continue;
        if (!portCarriesVlan(cfg, role, pt.id, vlan)) continue;
        if (!this.phys.ports.get(portKey(deviceId, pt.id))?.operUp) continue;
        if (this.stp.ports.get(portKey(deviceId, pt.id))?.state !== 'forwarding') continue;
        out.push(lp);
      }
      return out;
    };

    const flood = (why: string) => {
      const out = members(ingress);
      this.trace(frame.flowId, { deviceId, portId: ingress === 'cpu' ? undefined : ingress, action: 'flood', table: 'MAC table', detail: `${why} — flooded in VLAN ${vlan} to ${out.length ? out.join(', ') : 'no other ports'}.` }, frame);
      for (const lp of out) this.egressSwitchport(deviceId, lp, vlan, frame);
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
    if (!members('').includes(entry.port)) {
      flood(`MAC table points to ${entry.port}, which is not forwarding for VLAN ${vlan}`);
      return;
    }
    this.trace(frame.flowId, { deviceId, portId: entry.port, action: 'forward', table: 'MAC table', detail: `${frame.dstMac} found on ${entry.port} (VLAN ${vlan}) — forwarded.` }, frame);
    this.egressSwitchport(deviceId, entry.port, vlan, frame);
  }

  /** Sends out a logical port; a port-channel picks one bundled member by MAC hash. */
  private egressSwitchport(deviceId: string, lp: string, vlan: number, frame: Frame): void {
    const portId = pickMember(this.physicalMembers(deviceId, lp), frame.srcMac, frame.dstMac);
    if (!portId) {
      this.trace(frame.flowId, { deviceId, action: 'drop', table: 'EtherChannel', detail: `${lp} has no bundled member up.` }, frame);
      return;
    }
    if (portId !== lp) this.trace(frame.flowId, { deviceId, portId, action: 'forward', table: 'EtherChannel', detail: `${lp}: src/dst MAC hash chose member ${portId}.` }, frame);
    const p = effectivePort(this.role(deviceId), this.configs.get(deviceId)!.interfaces[portId]);
    const tagged = p.mode === 'trunk' && vlan !== p.nativeVlan;
    this.transmit(deviceId, portId, { ...frame, vlanTag: tagged ? vlan : undefined });
  }

  // ----------------------------------------------------------------- L3 --

  private sendOnIface(deviceId: string, iface: L3Interface, frame: Frame): void {
    if (iface.kind === 'loop') {
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Interface', detail: `${iface.name} is a loopback: no other host can live on it.` }, frame);
      return;
    }
    if (iface.kind === 'svi') {
      this.bridgeForward(deviceId, iface.vlan!, frame, 'cpu');
      return;
    }
    const tag = iface.kind === 'sub' && !iface.native ? iface.vlan : undefined;
    this.trace(frame.flowId, { deviceId, portId: iface.port, iface: iface.name, action: 'send', table: 'Interface', detail: `Sent out ${iface.name}${tag !== undefined ? ` tagged VLAN ${tag}` : ''}.` }, { ...frame, vlanTag: tag });
    this.transmit(deviceId, iface.port!, { ...frame, vlanTag: tag });
  }

  /** Virtual IPs (HSRP/VRRP) this interface currently owns as active/master. */
  private ownedVips(deviceId: string, ifaceName: string): Array<{ vip: number; vmac: string }> {
    const out: Array<{ vip: number; vmac: string }> = [];
    for (const { group, member } of this.fhrp.byIface.get(`${deviceId}|${ifaceName}`) ?? []) {
      if (group.active === member && group.vip !== undefined) out.push({ vip: group.vip, vmac: group.vmac });
    }
    return out;
  }

  private ifCfg(deviceId: string, name: string) {
    return this.configs.get(deviceId)?.interfaces[name];
  }

  private natStaticGlobal(deviceId: string, ip: number): number | undefined {
    for (const st of this.configs.get(deviceId)?.nat.statics ?? []) if (parseIpv4(st.global) === ip) return parseIpv4(st.local) ?? undefined;
    return undefined;
  }

  private l3Input(deviceId: string, iface: L3Interface, frame: Frame, portId: string): void {
    const pl = frame.payload;
    const rt = this.rt(deviceId);
    if (pl.kind === 'arp') {
      // Which MAC answers for the target: our address, a virtual IP we own, or a static NAT global on an outside interface.
      let answerMac: string | undefined;
      let why = '';
      if (iface.ip !== undefined && pl.targetIp === iface.ip) answerMac = iface.mac;
      const vip = this.ownedVips(deviceId, iface.name).find((v) => v.vip === pl.targetIp);
      if (!answerMac && vip) {
        answerMac = vip.vmac;
        why = ' (virtual IP, virtual MAC)';
      }
      if (!answerMac && this.ifCfg(deviceId, iface.name)?.natRole === 'outside' && this.natStaticGlobal(deviceId, pl.targetIp) !== undefined) {
        answerMac = iface.mac;
        why = ' (static NAT global address)';
      }
      if (!answerMac) {
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
          srcMac: answerMac,
          dstMac: pl.senderMac,
          flowId: frame.flowId,
          payload: { kind: 'arp', op: 'reply', senderMac: answerMac, senderIp: pl.targetIp, targetMac: pl.senderMac, targetIp: pl.senderIp },
        };
        this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'reply', table: 'ARP cache', detail: `ARP reply: ${formatIpv4(pl.targetIp)} is at ${answerMac}${why}.` }, reply);
        this.sendOnIface(deviceId, iface, reply);
      }
      this.drainPending(deviceId, pl.senderIp);
      return;
    }

    let pkt = pl;
    const routing = routesPackets(this.devices.get(deviceId)!.kind, this.configs.get(deviceId)!);

    // 1. Inbound ACL.
    const aclIn = this.ifCfg(deviceId, iface.name)?.aclIn;
    if (aclIn && routing && !this.aclPermits(deviceId, aclIn, pkt, frame.flowId, iface.name, 'in')) {
      this.adminProhibited(deviceId, iface, pkt, frame.flowId);
      return;
    }

    // 2. NAT outside → inside (before routing).
    if (this.ifCfg(deviceId, iface.name)?.natRole === 'outside') {
      const t = this.natInbound(deviceId, pkt);
      if (t) {
        this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'forward', table: 'NAT', detail: `NAT outside→inside: destination ${formatIpv4(pkt.dst)} → ${formatIpv4(t.dst)}.` });
        pkt = t;
      }
    }

    // 3. Local delivery (own address, owned virtual IP, broadcast).
    const directedBcast = iface.network !== undefined && iface.prefixLen !== undefined && pkt.dst === broadcastOf(iface.network, iface.prefixLen);
    if (this.isLocalAddress(deviceId, pkt.dst) || pkt.dst === 0xffffffff || directedBcast) {
      this.trace(frame.flowId, { deviceId, portId: portId === 'cpu' ? undefined : portId, iface: iface.name, action: 'deliver', table: 'Host stack', detail: `Packet for ${formatIpv4(pkt.dst)} is for this device.` }, frame);
      if (pkt.udp) this.localUdp(deviceId, iface, pkt, frame.flowId);
      else this.localIcmp(deviceId, pkt, frame.flowId);
      return;
    }

    // 4. Forwarding.
    if (!routing) {
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Host stack', detail: `Not for me and IP routing is disabled — dropped.` }, frame);
      return;
    }
    if (pkt.ttl <= 1) {
      this.trace(frame.flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Routing table', detail: 'TTL expired in transit — sending ICMP time exceeded.' }, frame);
      if (pkt.icmp?.type === 'echo-request' && iface.ip !== undefined) this.sendIcmpError(deviceId, iface.ip, pkt, 'time-exceeded', 'ttl-exceeded', frame.flowId);
      return;
    }
    const fwd: Ipv4Packet = { ...pkt, ttl: pkt.ttl - 1 };
    this.routeAndSend(deviceId, fwd, frame.flowId, { originated: false, ingress: iface });
  }

  // --------------------------------------------------------------- ACL --

  private aclPermits(deviceId: string, name: string, pkt: Ipv4Packet, flowId: number, ifName: string, dir: 'in' | 'out'): boolean {
    const acl = this.configs.get(deviceId)?.acls[name];
    if (!acl) return true; // IOS: an applied but undefined ACL permits everything
    const v = evaluateAcl(acl, pkt);
    const key = `${deviceId}|${name}`;
    const hits = this.aclHits.get(key) ?? [];
    if (v.index >= 0) hits[v.index] = (hits[v.index] ?? 0) + 1;
    this.aclHits.set(key, hits);
    this.trace(flowId, {
      deviceId,
      iface: ifName,
      action: v.permit ? 'forward' : 'drop',
      table: 'ACL',
      detail: `ACL ${name} ${dir} on ${ifName}: ${v.permit ? 'permitted' : 'denied'} by ${v.index >= 0 ? `entry ${(v.index + 1) * 10}` : 'implicit deny'}.`,
    });
    return v.permit;
  }

  /** ICMP "administratively prohibited" back to the source of a denied packet (not for ICMP errors or DHCP). */
  private adminProhibited(deviceId: string, iface: L3Interface, pkt: Ipv4Packet, flowId: number): void {
    if (pkt.icmp?.type === 'echo-request' && iface.ip !== undefined) this.sendIcmpError(deviceId, iface.ip, pkt, 'dest-unreachable', 'admin-prohibited', flowId);
  }

  // --------------------------------------------------------------- NAT --

  private natInbound(deviceId: string, pkt: Ipv4Packet): Ipv4Packet | undefined {
    const local = this.natStaticGlobal(deviceId, pkt.dst);
    if (local !== undefined) return { ...pkt, dst: local };
    if (!pkt.icmp) return undefined;
    const e = (this.natTable.get(deviceId) ?? []).find((x) => x.insideGlobal === pkt.dst && x.globalId === pkt.icmp!.id);
    if (!e) return undefined;
    return { ...pkt, dst: e.insideLocal, icmp: { ...pkt.icmp, id: e.localId! } };
  }

  private natOutbound(deviceId: string, pkt: Ipv4Packet, egress: L3Interface): { pkt: Ipv4Packet; detail: string } | undefined {
    const cfg = this.configs.get(deviceId)!;
    for (const st of cfg.nat.statics) {
      if (parseIpv4(st.local) === pkt.src) {
        return { pkt: { ...pkt, src: parseIpv4(st.global)! }, detail: `static NAT: source ${st.local} → ${st.global}` };
      }
    }
    for (const rule of cfg.nat.overload) {
      if (rule.iface !== egress.name || egress.ip === undefined) continue;
      const acl = cfg.acls[rule.acl];
      if (!acl || !evaluateAcl(acl, pkt).permit) continue;
      if (!pkt.icmp) return { pkt, detail: 'PAT matched but only ICMP is translated in this simulator — not translated' };
      const table = this.natTable.get(deviceId) ?? [];
      let e = table.find((x) => !x.static && x.insideLocal === pkt.src && x.localId === pkt.icmp!.id && x.insideGlobal === egress.ip);
      if (!e) {
        let g = pkt.icmp.id;
        while (table.some((x) => x.insideGlobal === egress.ip && x.globalId === g)) g++;
        e = { insideLocal: pkt.src, insideGlobal: egress.ip, localId: pkt.icmp.id, globalId: g, outside: pkt.dst, static: false };
        table.push(e);
        this.natTable.set(deviceId, table);
      }
      return {
        pkt: { ...pkt, src: egress.ip, icmp: { ...pkt.icmp, id: e.globalId! } },
        detail: `PAT overload: ${formatIpv4(pkt.src)}:${pkt.icmp.id} → ${formatIpv4(egress.ip)}:${e.globalId}`,
      };
    }
    return undefined;
  }

  natTranslations(deviceId: string): NatTranslation[] {
    const statics = (this.configs.get(deviceId)?.nat.statics ?? []).map((st) => ({ insideLocal: parseIpv4(st.local)!, insideGlobal: parseIpv4(st.global)!, static: true }));
    return [...statics, ...(this.natTable.get(deviceId) ?? [])];
  }

  clearNat(deviceId: string): void {
    this.natTable.delete(deviceId);
    this.changed();
  }

  // -------------------------------------------------------------- DHCP --

  private dhcpKey(deviceId: string, iface: string): string {
    return `${deviceId}|${iface}`;
  }

  dhcpClient(deviceId: string, iface: string): DhcpClientState | undefined {
    return this.dhcpClients.get(this.dhcpKey(deviceId, iface));
  }

  /** "ipconfig /renew": restart DHCP on every DHCP-enabled NIC of the host. */
  dhcpRenew(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (!d) return;
    for (const p of d.ports) {
      if (!this.baseConfigs.get(deviceId)?.interfaces[p.id]?.dhcpClient) continue;
      this.dhcpClients.set(this.dhcpKey(deviceId, p.id), { state: 'selecting', xid: 0, attempts: 0 });
      this.queue.push(this.now, { type: 'dhcp-start', deviceId, iface: p.id });
    }
    this.recompute();
    this.changed();
  }

  /** "ipconfig /release": drop the lease locally and free the server binding. */
  dhcpRelease(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (!d) return;
    for (const p of d.ports) {
      const c = this.dhcpClients.get(this.dhcpKey(deviceId, p.id));
      if (!c?.lease) continue;
      const mac = this.interfaces(deviceId).find((i) => i.name === p.id)?.mac;
      for (const b of this.dhcpBindings.values()) for (const [ip, e] of b) if (e.mac === mac) b.delete(ip);
      this.dhcpClients.set(this.dhcpKey(deviceId, p.id), { state: 'bound', xid: c.xid, attempts: 0 });
    }
    this.recompute();
    this.changed();
  }

  bindings(deviceId: string): DhcpBinding[] {
    return [...(this.dhcpBindings.get(deviceId)?.values() ?? [])].sort((a, b) => a.ip - b.ip);
  }

  clearBindings(deviceId: string): void {
    this.dhcpBindings.delete(deviceId);
    this.changed();
  }

  private dhcpDiscover(deviceId: string, ifName: string): void {
    const iface = this.interfaces(deviceId).find((i) => i.name === ifName);
    const key = this.dhcpKey(deviceId, ifName);
    const c = this.dhcpClients.get(key);
    if (!iface || !c) return;
    const xid = (this.nextXid = (this.nextXid * 1103515245 + 12345) >>> 0);
    c.state = 'selecting';
    c.xid = xid;
    c.attempts++;
    const flowId = this.newFlow(`DHCP ${this.name(deviceId)} ${ifName}: DISCOVER #${c.attempts}`);
    this.dhcpBroadcast(deviceId, iface, { op: 'discover', xid, chaddr: iface.mac }, 68, 67, 0, flowId);
    this.queue.push(this.now + DHCP_TIMEOUT_MS, { type: 'dhcp-timeout', deviceId, iface: ifName, xid });
  }

  private dhcpApipa(deviceId: string, ifName: string): void {
    const c = this.dhcpClients.get(this.dhcpKey(deviceId, ifName));
    const iface = this.interfaces(deviceId).find((i) => i.name === ifName);
    if (!c || !iface) return;
    const h = parseInt(iface.mac.replace(/:/g, '').slice(-4), 16);
    const ip = (((169 << 24) | (254 << 16) | ((1 + (h >> 8) % 254) << 8) | (1 + (h & 0xff) % 254)) >>> 0);
    c.state = 'apipa';
    c.lease = { ip, prefixLen: 16, obtainedAt: this.now, apipa: true };
    const flowId = this.newFlow(`DHCP ${this.name(deviceId)}: no server answered — APIPA`);
    this.trace(flowId, { deviceId, iface: ifName, action: 'learn', table: 'DHCP', detail: `No DHCP offer after ${c.attempts} attempts — self-assigned APIPA address ${formatIpv4(ip)}/16 (no gateway).` });
    this.recompute();
  }

  /** Sends a DHCP message as an IP broadcast on an interface (client → servers, or relay/server → client). */
  private dhcpBroadcast(deviceId: string, iface: L3Interface, msg: DhcpMessage, srcPort: number, dstPort: number, src: number, flowId: number): void {
    const pkt: Ipv4Packet = { kind: 'ipv4', src, dst: 0xffffffff, ttl: 64, dscp: 48, protocol: 'udp', udp: { srcPort, dstPort, dhcp: msg }, sizeBytes: 342 };
    const frame: Frame = { srcMac: iface.mac, dstMac: BROADCAST_MAC, payload: pkt, flowId };
    this.trace(flowId, { deviceId, iface: iface.name, action: 'send', table: 'DHCP', detail: `DHCP ${msg.op.toUpperCase()} broadcast (xid 0x${msg.xid.toString(16)}).` }, frame);
    this.sendOnIface(deviceId, iface, frame);
  }

  private localUdp(deviceId: string, iface: L3Interface, pkt: Ipv4Packet, flowId: number): void {
    const msg = pkt.udp?.dhcp;
    if (!msg) {
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Host stack', detail: `UDP port ${pkt.udp?.dstPort} not listening.` });
      return;
    }
    const toServer = msg.op === 'discover' || msg.op === 'request' || msg.op === 'release';
    if (toServer) {
      const cfg = this.configs.get(deviceId)!;
      const hasPools = Object.keys(cfg.dhcp.pools).length > 0;
      if (hasPools && this.dhcpServe(deviceId, iface, msg, flowId)) return;
      const helpers = cfg.interfaces[iface.name]?.helpers ?? [];
      if (helpers.length && !msg.giaddr && iface.ip !== undefined && pkt.dst === 0xffffffff) {
        for (const h of helpers) {
          const dst = parseIpv4(h);
          if (dst === null) continue;
          const relayed: Ipv4Packet = { kind: 'ipv4', src: iface.ip, dst, ttl: 64, dscp: 48, protocol: 'udp', udp: { srcPort: 67, dstPort: 67, dhcp: { ...msg, giaddr: iface.ip } }, sizeBytes: 342 };
          this.trace(flowId, { deviceId, iface: iface.name, action: 'forward', table: 'DHCP', detail: `DHCP relay (ip helper-address): ${msg.op.toUpperCase()} unicast to ${h}, giaddr ${formatIpv4(iface.ip)}.` });
          this.routeAndSend(deviceId, relayed, flowId, { originated: true });
        }
        return;
      }
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'DHCP', detail: hasPools ? 'No DHCP pool matches this subnet.' : 'No DHCP server or relay (ip helper-address) on this interface.' });
      return;
    }

    // Server → client messages.
    if (msg.giaddr !== undefined && this.isLocalAddress(deviceId, msg.giaddr) && pkt.dst !== 0xffffffff) {
      // We are the relay: hand the reply to the client on the giaddr interface.
      const out = this.interfaces(deviceId).find((i) => i.ip === msg.giaddr && i.up);
      if (out) {
        this.trace(flowId, { deviceId, iface: out.name, action: 'forward', table: 'DHCP', detail: `DHCP relay: ${msg.op.toUpperCase()} from server delivered to client segment ${out.name}.` });
        this.dhcpBroadcast(deviceId, out, msg, 67, 68, out.ip!, flowId);
      }
      return;
    }
    const c = this.dhcpClients.get(this.dhcpKey(deviceId, iface.name));
    if (!c || msg.chaddr !== iface.mac || msg.xid !== c.xid) return;
    if (msg.op === 'offer' && c.state === 'selecting') {
      c.state = 'requesting';
      c.offer = msg;
      this.trace(flowId, { deviceId, iface: iface.name, action: 'learn', table: 'DHCP', detail: `OFFER ${formatIpv4(msg.yiaddr!)} from server ${formatIpv4(msg.serverId ?? 0)} — sending REQUEST.` });
      this.dhcpBroadcast(deviceId, iface, { op: 'request', xid: c.xid, chaddr: iface.mac, requestedIp: msg.yiaddr, serverId: msg.serverId }, 68, 67, 0, flowId);
    } else if (msg.op === 'ack' && c.state === 'requesting') {
      c.state = 'bound';
      c.lease = { ip: msg.yiaddr!, prefixLen: maskToPrefix(formatIpv4(msg.mask ?? 0)) ?? 24, router: msg.router, dns: msg.dns, server: msg.serverId, obtainedAt: this.now, apipa: false };
      this.trace(flowId, { deviceId, iface: iface.name, action: 'learn', table: 'DHCP', detail: `ACK — bound to ${formatIpv4(msg.yiaddr!)}${msg.router !== undefined ? `, gateway ${formatIpv4(msg.router)}` : ''}.` });
      this.recompute();
    } else if (msg.op === 'nak') {
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'DHCP', detail: 'NAK — restarting DHCP.' });
      c.state = 'selecting';
      this.queue.push(this.now + 1, { type: 'dhcp-start', deviceId, iface: iface.name });
    }
  }

  /** DHCP server logic. Returns false if no pool serves the client's subnet. */
  private dhcpServe(deviceId: string, iface: L3Interface, msg: DhcpMessage, flowId: number): boolean {
    const cfg = this.configs.get(deviceId)!;
    const subnetAddr = msg.giaddr ?? iface.ip;
    if (subnetAddr === undefined) return false;
    const poolEntry = Object.entries(cfg.dhcp.pools).find(([, p]) => {
      const net = p.network ? parseIpv4(p.network) : null;
      const len = p.mask ? maskToPrefix(p.mask) : null;
      return net !== null && len !== null && networkOf(subnetAddr, len) === networkOf(net, len);
    });
    if (!poolEntry) return false;
    const [poolName, pool] = poolEntry;
    const net = networkOf(parseIpv4(pool.network!)!, maskToPrefix(pool.mask!)!);
    const len = maskToPrefix(pool.mask!)!;
    const bindings = this.dhcpBindings.get(deviceId) ?? new Map<number, DhcpBinding>();
    this.dhcpBindings.set(deviceId, bindings);
    const serverId = iface.ip ?? 0;

    const excluded = (ip: number) =>
      cfg.dhcp.excluded.some((r) => {
        const a = parseIpv4(r.from);
        const b = parseIpv4(r.to);
        return a !== null && b !== null && ip >= a && ip <= b;
      });
    const ownIps = new Set<number>();
    for (const ifs of this.l3.values()) for (const i of ifs) if (i.ip !== undefined) ownIps.add(i.ip);
    const gw = pool.defaultRouter ? parseIpv4(pool.defaultRouter) : null;

    const reply = (op: DhcpMessage['op'], yiaddr?: number) => {
      const out: DhcpMessage = {
        op,
        xid: msg.xid,
        chaddr: msg.chaddr,
        yiaddr,
        serverId,
        giaddr: msg.giaddr,
        mask: parseIpv4(pool.mask!) ?? undefined,
        router: gw ?? undefined,
        dns: pool.dnsServer ? parseIpv4(pool.dnsServer) ?? undefined : undefined,
        leaseSec: Math.round(pool.leaseDays * 86400),
      };
      this.trace(flowId, { deviceId, iface: iface.name, action: 'reply', table: 'DHCP', detail: `DHCP server pool ${poolName}: ${op.toUpperCase()}${yiaddr !== undefined ? ` ${formatIpv4(yiaddr)}` : ''}.` });
      if (msg.giaddr) {
        const pkt: Ipv4Packet = { kind: 'ipv4', src: serverId, dst: msg.giaddr, ttl: 64, dscp: 48, protocol: 'udp', udp: { srcPort: 67, dstPort: 67, dhcp: out }, sizeBytes: 342 };
        this.routeAndSend(deviceId, pkt, flowId, { originated: true });
      } else this.dhcpBroadcast(deviceId, iface, out, 67, 68, serverId, flowId);
    };

    if (msg.op === 'discover') {
      const existing = [...bindings.values()].find((b) => b.mac === msg.chaddr && b.pool === poolName);
      let ip = existing?.ip;
      if (ip === undefined) {
        const bcast = broadcastOf(net, len);
        for (let cand = net + 1; cand < bcast; cand++) {
          if (excluded(cand) || ownIps.has(cand) || cand === gw || bindings.has(cand)) continue;
          ip = cand;
          break;
        }
      }
      if (ip === undefined) {
        this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'DHCP', detail: `Pool ${poolName} exhausted — no OFFER sent.` });
        return true;
      }
      reply('offer', ip);
      return true;
    }
    if (msg.op === 'request') {
      if (msg.serverId !== undefined && msg.serverId !== serverId) return true; // client chose another server
      const ip = msg.requestedIp;
      const holder = ip !== undefined ? bindings.get(ip) : undefined;
      if (ip === undefined || networkOf(ip, len) !== net || excluded(ip) || (holder && holder.mac !== msg.chaddr)) {
        reply('nak');
        return true;
      }
      for (const [bip, b] of bindings) if (b.mac === msg.chaddr && bip !== ip) bindings.delete(bip);
      bindings.set(ip, { ip, mac: msg.chaddr, pool: poolName, at: this.now });
      reply('ack', ip);
      return true;
    }
    return true;
  }

  private localIcmp(deviceId: string, pkt: Ipv4Packet, flowId: number): void {
    const icmp = pkt.icmp;
    if (!icmp) return;
    if (icmp.type === 'echo-request') {
      const role = this.role(deviceId);
      const replySrc = this.isLocalAddress(deviceId, pkt.dst) ? pkt.dst : this.interfaces(deviceId).find((i) => i.up && i.ip !== undefined)?.ip;
      if (replySrc === undefined) return;
      const reply: Ipv4Packet = {
        kind: 'ipv4',
        src: replySrc,
        dst: pkt.src,
        ttl: role === 'host' ? 128 : 255,
        dscp: pkt.dscp,
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
      dscp: 0,
      protocol: 'icmp',
      // Errors quote the original probe id/seq so the sender can match them.
      icmp: { type, id: orig.icmp!.id, seq: orig.icmp!.seq, code },
      sizeBytes: 56,
    };
    this.routeAndSend(deviceId, err, flowId, { originated: true });
  }

  private routeAndSend(deviceId: string, pktIn: Ipv4Packet, flowId: number, o: { originated: boolean; ingress?: L3Interface }): void {
    let pkt = pktIn;
    const table = this.routingTable(deviceId);
    const r = resolve(table, pkt.dst);
    const iface = r ? this.interfaces(deviceId).find((i) => i.name === r.iface) : undefined;
    if (!r || !iface?.up || iface.ip === undefined) {
      this.trace(flowId, { deviceId, action: 'drop', table: 'Routing table', detail: `No route to ${formatIpv4(pkt.dst)}.` });
      if (!o.originated && pkt.icmp?.type === 'echo-request' && o.ingress?.ip !== undefined) {
        this.sendIcmpError(deviceId, o.ingress.ip, pkt, 'dest-unreachable', 'net-unreachable', flowId);
      }
      return;
    }
    const via = r.route.protocol === 'C' || r.route.protocol === 'L' ? `directly connected via ${iface.name}` : `${r.route.protocol} route ${formatIpv4(r.route.network)}/${r.route.prefixLen} via ${formatIpv4(r.nextHop)} (${iface.name})`;
    this.trace(flowId, { deviceId, iface: iface.name, action: o.originated ? 'send' : 'forward', table: 'Routing table', detail: `${formatIpv4(pkt.dst)}: ${via}${o.originated ? '' : `, TTL now ${pkt.ttl}`}.` });

    if (!o.originated && o.ingress) {
      // NAT inside → outside happens after routing (IOS order of operations).
      if (this.ifCfg(deviceId, o.ingress.name)?.natRole === 'inside' && this.ifCfg(deviceId, iface.name)?.natRole === 'outside') {
        const t = this.natOutbound(deviceId, pkt, iface);
        if (t) {
          this.trace(flowId, { deviceId, iface: iface.name, action: 'forward', table: 'NAT', detail: `NAT inside→outside: ${t.detail}.` });
          pkt = t.pkt;
        }
      }
      const aclOut = this.ifCfg(deviceId, iface.name)?.aclOut;
      if (aclOut && !this.aclPermits(deviceId, aclOut, pkt, flowId, iface.name, 'out')) {
        this.adminProhibited(deviceId, o.ingress, pkt, flowId);
        return;
      }
    }

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
  const dhcp = ip.udp?.dhcp;
  const l4 = ip.icmp
    ? `${ip.icmp.type}${ip.icmp.code ? ` (${ip.icmp.code})` : ''} id=${ip.icmp.id} seq=${ip.icmp.seq}`
    : `UDP ${ip.udp?.srcPort} → ${ip.udp?.dstPort}${dhcp ? ` DHCP ${dhcp.op.toUpperCase()} xid=0x${dhcp.xid.toString(16)}${dhcp.yiaddr !== undefined ? ` yiaddr=${formatIpv4(dhcp.yiaddr)}` : ''}${dhcp.giaddr ? ` giaddr=${formatIpv4(dhcp.giaddr)}` : ''}` : ''}`;
  return {
    ...base,
    summary: ip.icmp
      ? `ICMP ${ip.icmp.type} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)} TTL ${ip.ttl}`
      : `DHCP ${dhcp?.op.toUpperCase() ?? 'UDP'} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)}`,
    ip: {
      src: formatIpv4(ip.src),
      dst: formatIpv4(ip.dst),
      ttl: ip.ttl,
      dscp: ip.dscp,
      protocol: ip.protocol === 'icmp' ? 'ICMP (1)' : 'UDP (17)',
      icmp: l4,
      sizeBytes: ip.sizeBytes,
    },
  };
}

export function isInSubnetOf(iface: L3Interface, ip: number): boolean {
  return iface.network !== undefined && inSubnet(ip, iface.network, iface.prefixLen!);
}
