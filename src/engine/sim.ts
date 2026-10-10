import type { Device, Topology } from '../model/types';
import { effectivePort, getNetConfig, isBridgeRole, longIfName, roleOf, type DeviceRole, type NetConfig } from './config/netConfig';
import { EventQueue } from './core/eventQueue';
import { BROADCAST_MAC, etherTypeOf, type ArpPacket, type Frame, type IcmpMessage, type Ipv4Packet, type MplsLabel } from './core/types';
import { computeLdp, emptyLdp, ldpSyncHolddown, OSPF_MAX_METRIC, prefixKey, type LdpResult, type LfibEntry } from './mpls/ldp';
import { computeSegments, type Segment } from './ethernet/segments';
import { computeStp, type StpState } from './ethernet/stp';
import { bundleByName, computeEtherChannel, emptyEtherChannel, pickMember, type Bundle, type EtherChannelState } from './ethernet/etherchannel';
import { computeOspf, type OspfResult } from './ospf/ospf';
import { computeIsis, emptyIsis, type IsisResult } from './igp/isis';
import { computeRip, emptyRip, type RipResult } from './igp/rip';
import { computeFhrp, type FhrpResult } from './fhrp/fhrp';
import { evaluateAcl } from './security/acl';
import type { AppMessage, DhcpMessage } from './core/types';
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
  /** Label stack quoted by an MPLS router in its time-exceeded message (RFC 4950). */
  labels?: Array<{ label: number; exp: number }>;
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
  /** MPLS label stack, top first. */
  mpls?: Array<{ label: number; tc: number; ttl: number }>;
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
  table?:
    | 'Interface'
    | 'STP'
    | 'VLAN'
    | 'Port security'
    | 'EtherChannel'
    | 'MAC table'
    | 'ARP cache'
    | 'Routing table'
    | 'ICMP'
    | 'Host stack'
    | 'ACL'
    | 'NAT'
    | 'DHCP'
    | 'LFIB';
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
  | { type: 'arp-expire'; deviceId: string; ip: number }
  | { type: 'app-send'; sessionId: number }
  | { type: 'app-timeout'; sessionId: number; attempt: number }
  | { type: 'lsp-send'; sessionId: number }
  | { type: 'lsp-timeout'; sessionId: number; index: number };

/** One MPLS echo request of an LSP ping / LSP traceroute. */
export interface LspProbe {
  seq: number;
  ttl: number;
  flowId: number;
  sentAt: number;
  /** IOS codes: '!' success, 'Q' not sent, '.' timeout, 'L' / 'B' / 'N' / 'f' replies. */
  code: string;
  from?: number;
  rttMs?: number;
  info?: string;
}

/** "ping mpls ipv4 P/L" / "traceroute mpls ipv4 P/L". */
export interface LspSession {
  id: number;
  kind: 'ping' | 'trace';
  srcDeviceId: string;
  network: number;
  prefixLen: number;
  count: number;
  timeoutMs: number;
  maxTtl: number;
  probes: LspProbe[];
  done: boolean;
  /** Ingress label (hop 0 line of traceroute mpls). */
  ingress?: { iface: string; nextHop: number; out: LfibEntry['out'] };
  error?: string;
}

/** DNS lookup, NTP poll or SSH/Telnet connection attempt started from a device. */
export interface AppSession {
  id: number;
  kind: 'dns' | 'ntp' | 'ssh' | 'telnet';
  deviceId: string;
  /** Server / target address. */
  target: number;
  name?: string;
  user?: string;
  status: 'pending' | 'ok' | 'fail';
  /** Human-readable outcome (login result, refusal reason, timeout…). */
  result?: string;
  /** DNS answer. */
  address?: number;
  attempts: number;
  flowId: number;
}

export interface LogLine {
  at: number;
  text: string;
}

export interface InboxItem {
  at: number;
  from: number;
  kind: 'syslog' | 'trap';
  text: string;
  community?: string;
}

/** Wait for an answer before retrying (DNS/NTP/TCP SYN), and how many tries. */
export const APP_TIMEOUT_MS = 1_500;
export const APP_ATTEMPTS = 3;

interface PendingArp {
  iface: string;
  requestedAt: number;
  queue: Array<{ pkt: Ipv4Packet; flowId: number; mpls?: MplsLabel[]; iface?: string }>;
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
  appSessions = new Map<number, AppSession>();
  private nextApp = 1;
  /** NTP association per client device: server, own stratum, time of sync. */
  ntpState = new Map<string, { server: number; stratum: number; at: number }>();
  /** Local log buffer per device ("show logging"). */
  logs = new Map<string, LogLine[]>();
  /** Syslog messages and SNMP traps received by NMS servers. */
  inbox = new Map<string, InboxItem[]>();
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
  ospf: OspfResult = {
    routerIds: new Map(),
    interfaces: [],
    neighbors: [],
    routes: new Map(),
    problems: [],
    lsdb: [],
    abrs: new Set(),
    asbrs: new Set(),
  };

  ldp: LdpResult = emptyLdp();
  /** Interfaces whose OSPF cost is held at max by "mpls ldp sync" (no LDP session yet). */
  ldpSyncHeld: Array<{ deviceId: string; iface: string }> = [];
  readonly lspSessions = new Map<number, LspSession>();
  /** Bytes label-switched per LFIB entry (key "deviceId|inLabel"). */
  readonly lfibBytes = new Map<string, number>();

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
    const oldPhys = this.phys;
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
    const buildTables = () => {
      for (const d of this.topology.devices) {
        const dynamic = [...(this.ospf.routes.get(d.id) ?? []), ...(this.isis.routes.get(d.id) ?? []), ...(this.rip.routes.get(d.id) ?? [])];
        this.routes.set(d.id, buildRoutingTable(d.kind, this.configs.get(d.id)!, this.l3.get(d.id)!, dynamic));
      }
    };
    buildTables();

    // MPLS / LDP on top of the IGP. "mpls ldp sync": a link whose LDP session is not up is
    // advertised with max OSPF cost, so traffic avoids it until labels are exchanged.
    this.ldp = computeLdp(this.topology, this.configs, this.l3, this.segments, this.routes, this.ospf);
    this.ldpSyncHeld = ldpSyncHolddown(this.ldp, this.configs);
    if (this.ldpSyncHeld.length) {
      const held = new Map(this.configs);
      for (const h of this.ldpSyncHeld) {
        const c = structuredClone(held.get(h.deviceId)!);
        c.interfaces[h.iface] = { ...(c.interfaces[h.iface] ?? {}), ospfCost: OSPF_MAX_METRIC };
        held.set(h.deviceId, c);
      }
      this.ospf = computeOspf(this.topology, held, this.l3, this.phys, this.segments, base);
      buildTables();
      this.ldp = computeLdp(this.topology, this.configs, this.l3, this.segments, this.routes, this.ospf);
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
    if (movedMacs.size) for (const rtm of this.runtime.values()) for (const t of rtm.mac.values()) for (const m of movedMacs) t.delete(m);

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
    this.logLinkChanges(oldPhys);
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

    // Unicast control-plane exchanges (OSPF DBD/LSU to FULL neighbours, LDP's TCP session)
    // have already resolved ARP between neighbouring routers.
    const prime = (devId: string, iface: string, peerDev: string, peerIp: number) => {
      const rt = this.rt(devId);
      if (rt.arp.has(peerIp)) return;
      const mac = this.l3.get(peerDev)?.find((i) => i.up && i.ip === peerIp)?.mac;
      if (mac) rt.arp.set(peerIp, { mac, iface, at: this.now });
    };
    for (const n of this.ospf.neighbors) if (n.state === 'FULL') prime(n.deviceId, n.iface, n.neighborDeviceId, n.neighborIp);
    for (const d of this.ldp.discoveries) prime(d.deviceId, d.iface, d.neighborDeviceId, d.neighborIp);
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
    this.appSessions.clear();
    this.ntpState.clear();
    this.logs.clear();
    this.inbox.clear();
    this.lspSessions.clear();
    this.lfibBytes.clear();
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
    return this.queue
      .list()
      .slice(0, limit)
      .map((e) => {
        const d = e.data;
        switch (d.type) {
          case 'deliver':
            return {
              time: e.time,
              text: `${viewFrame(d.frame).summary} → ${this.name(d.deviceId)} ${d.portId}`,
              linkId: d.linkId,
              deviceId: d.deviceId,
            };
          case 'probe-send': {
            const s = this.sessions.get(d.sessionId);
            return { time: e.time, text: `${s?.kind ?? 'probe'} from ${this.name(s?.srcDeviceId ?? '')}: send next probe`, deviceId: s?.srcDeviceId };
          }
          case 'probe-timeout':
            return { time: e.time, text: `timeout check for probe ${d.index + 1} of session ${d.sessionId}` };
          case 'lsp-send': {
            const s = this.lspSessions.get(d.sessionId);
            return {
              time: e.time,
              text: `LSP ${s?.kind ?? 'ping'} from ${this.name(s?.srcDeviceId ?? '')}: send next MPLS echo`,
              deviceId: s?.srcDeviceId,
            };
          }
          case 'lsp-timeout':
            return { time: e.time, text: `timeout check for MPLS echo ${d.index + 1} of session ${d.sessionId}` };
          case 'arp-expire':
            return { time: e.time, text: `ARP hold timer at ${this.name(d.deviceId)} for ${formatIpv4(d.ip)}`, deviceId: d.deviceId };
          case 'dhcp-start':
            return { time: e.time, text: `DHCP client start on ${this.name(d.deviceId)} ${d.iface}`, deviceId: d.deviceId };
          case 'dhcp-timeout':
            return { time: e.time, text: `DHCP timeout check on ${this.name(d.deviceId)} ${d.iface}`, deviceId: d.deviceId };
          case 'app-send':
          case 'app-timeout': {
            const a = this.appSessions.get(d.sessionId);
            return {
              time: e.time,
              text: `${a?.kind.toUpperCase() ?? 'APP'} ${d.type === 'app-send' ? 'request' : 'timeout check'} from ${this.name(a?.deviceId ?? '')}`,
              deviceId: a?.deviceId,
            };
          }
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
        this.lastEvent = {
          time: this.now,
          description: `Frame arrives at ${this.name(ev.deviceId)} ${ev.portId}`,
          deviceId: ev.deviceId,
          linkId: ev.linkId,
        };
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
      case 'app-send':
        this.appSend(ev.sessionId);
        break;
      case 'app-timeout': {
        const a = this.appSessions.get(ev.sessionId);
        if (!a || a.status !== 'pending' || a.attempts !== ev.attempt) break;
        this.lastEvent = {
          time: this.now,
          description: `${a.kind.toUpperCase()} request from ${this.name(a.deviceId)} timed out (try ${a.attempts})`,
        };
        if (a.attempts < APP_ATTEMPTS) this.queue.push(this.now, { type: 'app-send', sessionId: a.id });
        else this.finishApp(a, 'fail', `% Connection timed out; remote host not responding (${a.attempts} attempts)`);
        break;
      }
      case 'lsp-send':
        this.lspSend(ev.sessionId);
        break;
      case 'lsp-timeout': {
        const s = this.lspSessions.get(ev.sessionId);
        const p = s?.probes[ev.index];
        if (s && p && p.code === 'pending') {
          p.code = '.';
          this.lastEvent = { time: this.now, description: `MPLS echo ${p.seq + 1} timed out` };
          this.afterLsp(s);
        }
        break;
      }
      case 'arp-expire': {
        const rt = this.rt(ev.deviceId);
        const pend = rt.pending.get(ev.ip);
        if (pend && this.now - pend.requestedAt >= ARP_QUEUE_HOLD_MS - 1e-9) {
          for (const q of pend.queue)
            this.trace(q.flowId, {
              deviceId: ev.deviceId,
              iface: pend.iface,
              action: 'drop',
              table: 'ARP cache',
              detail: `ARP for ${formatIpv4(ev.ip)} unanswered — queued packet discarded.`,
            });
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
    const flowId = this.newFlow(
      `${s.kind === 'ping' ? 'Ping' : 'Traceroute'} ${this.name(s.srcDeviceId)} → ${formatIpv4(s.dst)} #${index + 1}${s.kind === 'traceroute' ? ` (TTL ${ttl})` : ''}`,
    );
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
      this.trace(flowId, {
        deviceId: s.srcDeviceId,
        action: 'deliver',
        table: 'Host stack',
        detail: 'Destination is a local address — answered internally.',
      });
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
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'drop', table: 'Interface', detail: `${portId} is down (${st?.reason ?? 'not connected'}).` },
        frame,
      );
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
        this.trace(
          frame.flowId,
          {
            deviceId,
            portId,
            action: 'drop',
            table: 'Interface',
            detail: `Duplex mismatch on this link (${st.duplex} here, ${peer?.duplex ?? '?'} at the far end): the frame was destroyed by a late collision / CRC error.`,
          },
          frame,
        );
        return;
      }
    }
    this.queue.push(this.now + delay, {
      type: 'deliver',
      deviceId: st.peer.deviceId,
      portId: st.peer.portId,
      frame: { ...frame },
      linkId: st.linkId,
    });
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
      this.trace(
        frame.flowId,
        {
          deviceId,
          portId,
          action: 'flood',
          table: 'Interface',
          detail: `Hub repeats the bits out of every other port (${out.map((p) => p.id).join(', ') || 'none'}) — no MAC learning, one collision domain.`,
        },
        frame,
      );
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
        this.trace(
          frame.flowId,
          {
            deviceId,
            portId,
            action: 'drop',
            table: 'Interface',
            detail: `Tagged frame (VLAN ${frame.vlanTag}) but no subinterface with that encapsulation on ${portId}.`,
          },
          frame,
        );
        this.count(deviceId, portId, 'drops');
        return;
      }
    } else {
      iface = ifs.find((i) => i.kind === 'sub' && i.port === portId && i.native) ?? ifs.find((i) => i.kind === 'port' && i.port === portId);
    }
    if (!iface || !iface.up) {
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'drop', table: 'Interface', detail: `No up L3 interface for this frame on ${portId}.` },
        frame,
      );
      return;
    }
    if (frame.dstMac !== iface.mac && frame.dstMac !== BROADCAST_MAC && !this.ownedVips(deviceId, iface.name).some((v) => v.vmac === frame.dstMac)) {
      this.trace(
        frame.flowId,
        {
          deviceId,
          portId,
          iface: iface.name,
          action: 'drop',
          table: 'Interface',
          detail: 'Destination MAC is not this interface — NIC filters the frame.',
        },
        frame,
      );
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
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'drop', table: 'EtherChannel', detail: `${portId} is a suspended EtherChannel member — frame discarded.` },
        frame,
      );
      this.count(deviceId, portId, 'drops');
      return;
    }
    const lp = this.lport(deviceId, portId);
    const stp = this.stp.ports.get(portKey(deviceId, portId));
    if (stp?.state !== 'forwarding') {
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'drop', table: 'STP', detail: `${portId} is ${stp?.role ?? 'disabled'}/discarding — frame discarded.` },
        frame,
      );
      this.count(deviceId, portId, 'drops');
      return;
    }

    // Ingress VLAN classification (802.1Q).
    let vlan: number;
    if (p.mode === 'access') {
      if (frame.vlanTag !== undefined) {
        this.trace(
          frame.flowId,
          { deviceId, portId, action: 'drop', table: 'VLAN', detail: 'Tagged frame received on an access port — dropped.' },
          frame,
        );
        this.count(deviceId, portId, 'drops');
        return;
      }
      vlan = p.accessVlan!;
    } else {
      vlan = frame.vlanTag ?? p.nativeVlan!;
      const allowed = p.trunkAllowed === 'all' || (p.trunkAllowed ?? []).includes(vlan);
      if (!allowed) {
        this.trace(
          frame.flowId,
          { deviceId, portId, action: 'drop', table: 'VLAN', detail: `VLAN ${vlan} is not allowed on trunk ${portId}.` },
          frame,
        );
        this.count(deviceId, portId, 'drops');
        return;
      }
    }
    if (!vlanExists(cfg, vlan)) {
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'drop', table: 'VLAN', detail: `VLAN ${vlan} does not exist in the VLAN database — port is inactive for it.` },
        frame,
      );
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
          this.trace(
            frame.flowId,
            {
              deviceId,
              portId,
              action: 'learn',
              table: 'Port security',
              detail: `Secure MAC ${frame.srcMac} learned (${set.size}/${p.portSecurity.maximum}).`,
            },
            frame,
          );
        } else {
          rt.violations.set(portId, (rt.violations.get(portId) ?? 0) + 1);
          if (p.portSecurity.violation === 'shutdown') {
            const ed = this.errDisabled.get(deviceId) ?? new Set<string>();
            ed.add(portId);
            this.errDisabled.set(deviceId, ed);
            this.trace(
              frame.flowId,
              {
                deviceId,
                portId,
                action: 'drop',
                table: 'Port security',
                detail: `Security violation from ${frame.srcMac}: port ${portId} err-disabled.`,
              },
              frame,
            );
            this.recompute();
          } else {
            this.trace(
              frame.flowId,
              {
                deviceId,
                portId,
                action: 'drop',
                table: 'Port security',
                detail: `Security violation from ${frame.srcMac} (${p.portSecurity.violation}) — frame dropped.`,
              },
              frame,
            );
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
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'learn', table: 'MAC table', detail: `Learned ${frame.srcMac} on ${lp}${via} in VLAN ${vlan}.` },
        frame,
      );
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
      this.trace(
        frame.flowId,
        {
          deviceId,
          iface: svi.name,
          action: 'deliver',
          table: 'MAC table',
          detail: `Destination is the switch's own ${svi.name} MAC — passed to the IP stack.`,
        },
        frame,
      );
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
      this.trace(
        frame.flowId,
        {
          deviceId,
          portId: ingress === 'cpu' ? undefined : ingress,
          action: 'flood',
          table: 'MAC table',
          detail: `${why} — flooded in VLAN ${vlan} to ${out.length ? out.join(', ') : 'no other ports'}.`,
        },
        frame,
      );
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
      this.trace(
        frame.flowId,
        { deviceId, portId: ingress, action: 'drop', table: 'MAC table', detail: `${frame.dstMac} is on the ingress port — filtered.` },
        frame,
      );
      return;
    }
    if (!members('').includes(entry.port)) {
      flood(`MAC table points to ${entry.port}, which is not forwarding for VLAN ${vlan}`);
      return;
    }
    this.trace(
      frame.flowId,
      {
        deviceId,
        portId: entry.port,
        action: 'forward',
        table: 'MAC table',
        detail: `${frame.dstMac} found on ${entry.port} (VLAN ${vlan}) — forwarded.`,
      },
      frame,
    );
    this.egressSwitchport(deviceId, entry.port, vlan, frame);
  }

  /** Sends out a logical port; a port-channel picks one bundled member by MAC hash. */
  private egressSwitchport(deviceId: string, lp: string, vlan: number, frame: Frame): void {
    const portId = pickMember(this.physicalMembers(deviceId, lp), frame.srcMac, frame.dstMac);
    if (!portId) {
      this.trace(frame.flowId, { deviceId, action: 'drop', table: 'EtherChannel', detail: `${lp} has no bundled member up.` }, frame);
      return;
    }
    if (portId !== lp)
      this.trace(
        frame.flowId,
        { deviceId, portId, action: 'forward', table: 'EtherChannel', detail: `${lp}: src/dst MAC hash chose member ${portId}.` },
        frame,
      );
    const p = effectivePort(this.role(deviceId), this.configs.get(deviceId)!.interfaces[portId]);
    const tagged = p.mode === 'trunk' && vlan !== p.nativeVlan;
    this.transmit(deviceId, portId, { ...frame, vlanTag: tagged ? vlan : undefined });
  }

  // ----------------------------------------------------------------- L3 --

  private sendOnIface(deviceId: string, iface: L3Interface, frame: Frame): void {
    if (iface.kind === 'loop') {
      this.trace(
        frame.flowId,
        { deviceId, iface: iface.name, action: 'drop', table: 'Interface', detail: `${iface.name} is a loopback: no other host can live on it.` },
        frame,
      );
      return;
    }
    if (iface.kind === 'svi') {
      this.bridgeForward(deviceId, iface.vlan!, frame, 'cpu');
      return;
    }
    const tag = iface.kind === 'sub' && !iface.native ? iface.vlan : undefined;
    this.trace(
      frame.flowId,
      {
        deviceId,
        portId: iface.port,
        iface: iface.name,
        action: 'send',
        table: 'Interface',
        detail: `Sent out ${iface.name}${tag !== undefined ? ` tagged VLAN ${tag}` : ''}.`,
      },
      { ...frame, vlanTag: tag },
    );
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
    if (frame.mpls?.length) {
      this.mplsInput(deviceId, iface, frame);
      return;
    }
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
        if (pl.op === 'request')
          this.trace(
            frame.flowId,
            {
              deviceId,
              iface: iface.name,
              action: 'drop',
              table: 'ARP cache',
              detail: `ARP request for ${formatIpv4(pl.targetIp)} — not my address, ignored.`,
            },
            frame,
          );
        return;
      }
      rt.arp.set(pl.senderIp, { mac: pl.senderMac, iface: iface.name, at: this.now });
      this.trace(
        frame.flowId,
        { deviceId, iface: iface.name, action: 'learn', table: 'ARP cache', detail: `ARP cache: ${formatIpv4(pl.senderIp)} is at ${pl.senderMac}.` },
        frame,
      );
      if (pl.op === 'request') {
        const reply: Frame = {
          srcMac: answerMac,
          dstMac: pl.senderMac,
          flowId: frame.flowId,
          payload: { kind: 'arp', op: 'reply', senderMac: answerMac, senderIp: pl.targetIp, targetMac: pl.senderMac, targetIp: pl.senderIp },
        };
        this.trace(
          frame.flowId,
          {
            deviceId,
            iface: iface.name,
            action: 'reply',
            table: 'ARP cache',
            detail: `ARP reply: ${formatIpv4(pl.targetIp)} is at ${answerMac}${why}.`,
          },
          reply,
        );
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
        this.trace(frame.flowId, {
          deviceId,
          iface: iface.name,
          action: 'forward',
          table: 'NAT',
          detail: `NAT outside→inside: destination ${formatIpv4(pkt.dst)} → ${formatIpv4(t.dst)}.`,
        });
        pkt = t;
      }
    }

    // MPLS echo requests are addressed to 127/8: the LSR at the end of the LSP answers them.
    if (pkt.udp?.app?.kind === 'mpls-echo-request' && pkt.dst >>> 24 === 127) {
      this.lspEchoEgress(deviceId, iface, pkt, frame.flowId);
      return;
    }

    // 3. Local delivery (own address, owned virtual IP, broadcast). /31 links have no broadcast address.
    const directedBcast =
      iface.network !== undefined && iface.prefixLen !== undefined && iface.prefixLen < 31 && pkt.dst === broadcastOf(iface.network, iface.prefixLen);
    if (this.isLocalAddress(deviceId, pkt.dst) || pkt.dst === 0xffffffff || directedBcast) {
      this.trace(
        frame.flowId,
        {
          deviceId,
          portId: portId === 'cpu' ? undefined : portId,
          iface: iface.name,
          action: 'deliver',
          table: 'Host stack',
          detail: `Packet for ${formatIpv4(pkt.dst)} is for this device.`,
        },
        frame,
      );
      if (pkt.tcp) this.localTcp(deviceId, iface, pkt, frame.flowId);
      else if (pkt.udp?.app) this.localApp(deviceId, iface, pkt, frame.flowId);
      else if (pkt.udp) this.localUdp(deviceId, iface, pkt, frame.flowId);
      else this.localIcmp(deviceId, pkt, frame.flowId);
      return;
    }

    // 4. Forwarding.
    if (!routing) {
      this.trace(
        frame.flowId,
        { deviceId, iface: iface.name, action: 'drop', table: 'Host stack', detail: `Not for me and IP routing is disabled — dropped.` },
        frame,
      );
      return;
    }
    if (pkt.ttl <= 1) {
      this.trace(
        frame.flowId,
        { deviceId, iface: iface.name, action: 'drop', table: 'Routing table', detail: 'TTL expired in transit — sending ICMP time exceeded.' },
        frame,
      );
      if (pkt.icmp?.type === 'echo-request' && iface.ip !== undefined)
        this.sendIcmpError(deviceId, iface.ip, pkt, 'time-exceeded', 'ttl-exceeded', frame.flowId);
      return;
    }
    const fwd: Ipv4Packet = { ...pkt, ttl: pkt.ttl - 1 };
    this.routeAndSend(deviceId, fwd, frame.flowId, { originated: false, ingress: iface });
  }

  // --------------------------------------------------------------- MPLS --

  /** Labelled frame received on an L3 interface: LFIB lookup, swap / pop, TTL. */
  private mplsInput(deviceId: string, iface: L3Interface, frame: Frame): void {
    const stack = frame.mpls!;
    const top = stack[0];
    const pkt = frame.payload as Ipv4Packet;
    const flowId = frame.flowId;
    const labels = stack.map((l) => ({ label: l.label, exp: l.tc }));
    if (!this.ldp.routers.get(deviceId)?.mplsIfaces.includes(iface.name)) {
      this.trace(
        flowId,
        {
          deviceId,
          iface: iface.name,
          action: 'drop',
          table: 'LFIB',
          detail: `Labelled packet (label ${top.label}) received on ${iface.name}, but MPLS is not enabled there ("mpls ip" missing) — dropped.`,
        },
        frame,
      );
      return;
    }
    const propagate = this.configs.get(deviceId)!.mpls.propagateTtl;
    const ttl = top.ttl - 1;
    const rest = stack.slice(1);
    // Label 0 (explicit-null): this router is the egress; pop and handle the IP packet.
    if (top.label === 0) {
      this.trace(
        flowId,
        {
          deviceId,
          iface: iface.name,
          action: 'forward',
          table: 'LFIB',
          detail: 'Label 0 (explicit-null): pop — this router is the end of the LSP.',
        },
        frame,
      );
      const ipTtl = propagate ? Math.min(pkt.ttl, top.ttl) : pkt.ttl;
      this.l3Input(deviceId, iface, { ...frame, mpls: rest.length ? rest : undefined, payload: { ...pkt, ttl: ipTtl } }, iface.port ?? 'cpu');
      return;
    }
    const entry = this.ldp.byInLabel.get(`${deviceId}|${top.label}`);
    if (!entry) {
      this.trace(
        flowId,
        { deviceId, iface: iface.name, action: 'drop', table: 'LFIB', detail: `No LFIB entry for local label ${top.label} — dropped.` },
        frame,
      );
      return;
    }
    const fec = `${formatIpv4(entry.network)}/${entry.prefixLen}`;
    const bytesKey = `${deviceId}|${top.label}`;
    this.lfibBytes.set(bytesKey, (this.lfibBytes.get(bytesKey) ?? 0) + pkt.sizeBytes + 4 * stack.length);
    if (ttl <= 0) {
      this.trace(
        flowId,
        { deviceId, iface: iface.name, action: 'drop', table: 'LFIB', detail: `Label TTL expired (label ${top.label}, FEC ${fec}).` },
        frame,
      );
      const app = pkt.udp?.app;
      if (app?.kind === 'mpls-echo-request') {
        const code = entry.out === 'none' ? 'B' : 'L';
        const info = entry.out === 'none' ? 'no label towards next hop' : `Labels: ${entry.out === 'pop' ? 'implicit-null' : entry.out}`;
        this.lspReply(deviceId, pkt, app.id, app.seq, code, info, flowId);
      } else if (pkt.icmp?.type === 'echo-request' && iface.ip !== undefined) {
        // RFC 4950: the time-exceeded message quotes the label stack.
        const err: Ipv4Packet = {
          kind: 'ipv4',
          src: iface.ip,
          dst: pkt.src,
          ttl: 255,
          dscp: 0,
          protocol: 'icmp',
          icmp: { type: 'time-exceeded', id: pkt.icmp.id, seq: pkt.icmp.seq, code: 'ttl-exceeded', mplsLabels: labels },
          sizeBytes: 56,
        };
        this.routeAndSend(deviceId, err, flowId, { originated: true });
      }
      return;
    }
    const out = this.interfaces(deviceId).find((i) => i.name === entry.iface && i.up);
    if (!out) {
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'LFIB', detail: `Outgoing interface ${entry.iface} is down.` }, frame);
      return;
    }
    if (typeof entry.out === 'number') {
      const next = [{ ...top, label: entry.out, ttl }, ...rest];
      this.trace(
        flowId,
        {
          deviceId,
          iface: iface.name,
          action: 'forward',
          table: 'LFIB',
          detail: `MPLS swap: label ${top.label} → ${entry.out} (FEC ${fec}) towards ${formatIpv4(entry.nextHop)} on ${entry.iface}, label TTL ${ttl}.`,
        },
        frame,
      );
      this.sendToNextHop(deviceId, out, entry.nextHop, pkt, next, flowId, false);
      return;
    }
    const ipTtl = propagate ? Math.min(pkt.ttl, ttl) : pkt.ttl;
    if (entry.out === 'pop') {
      this.trace(
        flowId,
        {
          deviceId,
          iface: iface.name,
          action: 'forward',
          table: 'LFIB',
          detail: `MPLS pop: label ${top.label} removed (FEC ${fec}; next hop advertised implicit-null — penultimate hop popping). Sent ${rest.length ? 'with the remaining labels' : 'as plain IP'} to ${formatIpv4(entry.nextHop)}.`,
        },
        frame,
      );
      this.sendToNextHop(deviceId, out, entry.nextHop, { ...pkt, ttl: ipTtl }, rest.length ? rest : undefined, flowId, false);
      return;
    }
    // No outgoing label (next hop not an LDP peer / no binding): forward as IP.
    this.trace(
      flowId,
      {
        deviceId,
        iface: iface.name,
        action: 'forward',
        table: 'LFIB',
        detail: `Label ${top.label} (FEC ${fec}) has no outgoing label ("No Label") — label removed, packet routed as IP.`,
      },
      frame,
    );
    if (ipTtl <= 0) return;
    this.routeAndSend(deviceId, { ...pkt, ttl: ipTtl }, flowId, { originated: false, ingress: iface });
  }

  /** MPLS echo request that reached the end of the LSP (IP destination 127/8). */
  private lspEchoEgress(deviceId: string, iface: L3Interface, pkt: Ipv4Packet, flowId: number): void {
    const app = pkt.udp!.app as Extract<AppMessage, { kind: 'mpls-echo-request' }>;
    if (!this.ldp.routers.has(deviceId) && !this.forwards(deviceId)) {
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'drop',
        table: 'Host stack',
        detail: 'MPLS echo request on a device that does not run MPLS — dropped.',
      });
      return;
    }
    const [net, len] = app.fec.split('/');
    const n = parseIpv4(net);
    const own = this.routingTable(deviceId).some((r) => r.protocol === 'C' && r.network === n && r.prefixLen === Number(len));
    this.trace(flowId, {
      deviceId,
      iface: iface.name,
      action: 'deliver',
      table: 'LFIB',
      detail: own
        ? `MPLS echo request: ${app.fec} is my own prefix — I am the egress (return code 3).`
        : `MPLS echo request arrived here, but ${app.fec} is not my prefix (FEC mismatch).`,
    });
    this.lspReply(deviceId, pkt, app.id, app.seq, own ? '!' : 'f', own ? '' : 'FEC mismatch', flowId);
  }

  private lspReply(deviceId: string, req: Ipv4Packet, id: number, seq: number, code: string, info: string, flowId: number): void {
    const src = this.ldp.routers.get(deviceId)?.routerId ?? this.interfaces(deviceId).find((i) => i.up && i.ip !== undefined)?.ip;
    if (src === undefined) return;
    const reply: Ipv4Packet = {
      kind: 'ipv4',
      src,
      dst: req.src,
      ttl: 255,
      dscp: 0,
      protocol: 'udp',
      udp: { srcPort: 3503, dstPort: 3503, app: { kind: 'mpls-echo-reply', id, seq, code, info } },
      sizeBytes: 100,
    };
    this.trace(flowId, { deviceId, action: 'reply', table: 'LFIB', detail: `MPLS echo reply (code ${code}) to ${formatIpv4(req.src)}.` });
    this.routeAndSend(deviceId, reply, flowId, { originated: true });
  }

  /** "ping mpls ipv4 P/L": MPLS echo requests along the LSP for the FEC. */
  lspPing(srcDeviceId: string, network: number, prefixLen: number, opts: { count?: number; timeoutMs?: number } = {}): number {
    return this.startLsp('ping', srcDeviceId, network, prefixLen, {
      count: opts.count ?? 5,
      timeoutMs: opts.timeoutMs ?? PING_TIMEOUT_MS,
      maxTtl: 255,
    });
  }

  /** "traceroute mpls ipv4 P/L": echo requests with label TTL 1, 2, 3… */
  lspTrace(srcDeviceId: string, network: number, prefixLen: number, opts: { maxTtl?: number; timeoutMs?: number } = {}): number {
    return this.startLsp('trace', srcDeviceId, network, prefixLen, {
      count: 0,
      timeoutMs: opts.timeoutMs ?? PING_TIMEOUT_MS,
      maxTtl: opts.maxTtl ?? 30,
    });
  }

  lspSession(id: number): LspSession | undefined {
    return this.lspSessions.get(id);
  }

  private startLsp(
    kind: LspSession['kind'],
    srcDeviceId: string,
    network: number,
    prefixLen: number,
    o: { count: number; timeoutMs: number; maxTtl: number },
  ): number {
    const id = this.nextSession++;
    const s: LspSession = { id, kind, srcDeviceId, network, prefixLen, probes: [], done: false, ...o };
    this.lspSessions.set(id, s);
    if (!this.ldp.routers.has(srcDeviceId)) {
      s.error = '% MPLS is not enabled on this device.';
      s.done = true;
    } else this.queue.push(this.now, { type: 'lsp-send', sessionId: id });
    this.changed();
    return id;
  }

  private lspSend(sessionId: number): void {
    const s = this.lspSessions.get(sessionId);
    if (!s || s.done) return;
    const index = s.probes.length;
    const ttl = s.kind === 'trace' ? index + 1 : 255;
    const fec = prefixKey(s.network, s.prefixLen);
    const fecText = `${formatIpv4(s.network)}/${s.prefixLen}`;
    const flowId = this.newFlow(
      `LSP ${s.kind === 'ping' ? 'ping' : 'trace'} ${this.name(s.srcDeviceId)} → ${fecText} #${index + 1}${s.kind === 'trace' ? ` (TTL ${ttl})` : ''}`,
    );
    const probe: LspProbe = { seq: index, ttl, flowId, sentAt: this.now, code: 'pending' };
    s.probes.push(probe);
    const ftn = this.ldp.byFec.get(`${s.srcDeviceId}|${fec}`)?.[0];
    s.ingress ??= ftn ? { iface: ftn.iface, nextHop: ftn.nextHop, out: ftn.out } : undefined;
    const out = ftn ? this.interfaces(s.srcDeviceId).find((i) => i.name === ftn.iface && i.up && i.ip !== undefined) : undefined;
    if (!ftn || ftn.out === 'none' || !out) {
      probe.code = 'Q';
      this.trace(flowId, {
        deviceId: s.srcDeviceId,
        action: 'drop',
        table: 'LFIB',
        detail: `No label for FEC ${fecText} — MPLS echo request not sent.`,
      });
      this.afterLsp(s);
      return;
    }
    const pkt: Ipv4Packet = {
      kind: 'ipv4',
      src: out.ip!,
      dst: 0x7f000001,
      ttl: s.kind === 'trace' ? ttl : 1,
      dscp: 0,
      protocol: 'udp',
      udp: { srcPort: 3503, dstPort: 3503, app: { kind: 'mpls-echo-request', id: s.id, seq: index, fec: fecText } },
      sizeBytes: 100,
    };
    const mpls = typeof ftn.out === 'number' ? [{ label: ftn.out, tc: 0, ttl }] : undefined;
    this.queue.push(this.now + s.timeoutMs, { type: 'lsp-timeout', sessionId: s.id, index });
    this.trace(flowId, {
      deviceId: s.srcDeviceId,
      iface: out.name,
      action: 'send',
      table: 'LFIB',
      detail: `MPLS echo request for ${fecText}: ${mpls ? `label ${ftn.out}, label TTL ${ttl}` : 'next hop is the egress (implicit-null) — sent unlabelled'}, IP destination 127.0.0.1.`,
    });
    this.sendToNextHop(s.srcDeviceId, out, ftn.nextHop, pkt, mpls, flowId, true);
  }

  private afterLsp(s: LspSession): void {
    if (s.done) return;
    const last = s.probes[s.probes.length - 1];
    if (s.kind === 'ping') s.done = s.probes.length >= s.count;
    else s.done = last.code === '!' || last.code === 'Q' || last.code === 'f' || last.ttl >= s.maxTtl;
    if (!s.done) this.queue.push(this.now + 0.001, { type: 'lsp-send', sessionId: s.id });
    this.changed();
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
    if (pkt.icmp?.type === 'echo-request' && iface.ip !== undefined)
      this.sendIcmpError(deviceId, iface.ip, pkt, 'dest-unreachable', 'admin-prohibited', flowId);
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
    const statics = (this.configs.get(deviceId)?.nat.statics ?? []).map((st) => ({
      insideLocal: parseIpv4(st.local)!,
      insideGlobal: parseIpv4(st.global)!,
      static: true,
    }));
    return [...statics, ...(this.natTable.get(deviceId) ?? [])];
  }

  clearNat(deviceId: string): void {
    this.natTable.delete(deviceId);
    this.changed();
  }

  // -------------------------------------------------------------- DHCP --

  // ------------------------------------------------- management services --

  appSession(id: number): AppSession | undefined {
    return this.appSessions.get(id);
  }

  deviceLog(deviceId: string): LogLine[] {
    return this.logs.get(deviceId) ?? [];
  }

  nmsInbox(deviceId: string): InboxItem[] {
    return this.inbox.get(deviceId) ?? [];
  }

  private mgmt(deviceId: string) {
    return this.configs.get(deviceId)!.mgmt;
  }

  /** Name servers in use: configured, else learned by DHCP (hosts). */
  nameServersOf(deviceId: string): number[] {
    const cfg = this.mgmt(deviceId)
      .nameServers.map((n) => parseIpv4(n))
      .filter((n): n is number => n !== null);
    if (cfg.length) return cfg;
    const leases = [...this.dhcpClients.entries()].filter(([k]) => k.startsWith(`${deviceId}|`)).map(([, c]) => c.lease?.dns);
    return leases.filter((d): d is number => d !== undefined);
  }

  private newApp(kind: AppSession['kind'], deviceId: string, target: number, extra: Partial<AppSession> = {}): AppSession {
    const a: AppSession = { id: this.nextApp++, kind, deviceId, target, status: 'pending', attempts: 0, flowId: 0, ...extra };
    this.appSessions.set(a.id, a);
    return a;
  }

  private finishApp(a: AppSession, status: 'ok' | 'fail', result: string, address?: number): void {
    a.status = status;
    a.result = result;
    if (address !== undefined) a.address = address;
    this.changed();
  }

  /** Resolves a host name: static host table first, then DNS (UDP 53). */
  resolveName(deviceId: string, name: string): number {
    const m = this.mgmt(deviceId);
    const n = name.toLowerCase();
    const local = m.hosts[n] ?? (m.domainName ? m.hosts[n.replace(new RegExp(`\\.${m.domainName.replace(/\./g, '\\.')}$`, 'i'), '')] : undefined);
    if (local) {
      const a = this.newApp('dns', deviceId, 0, { name: n });
      this.finishApp(a, 'ok', `${n} is ${local} (static host table)`, parseIpv4(local)!);
      return a.id;
    }
    const role = this.role(deviceId);
    const servers = this.nameServersOf(deviceId);
    if (role !== 'host' && !m.domainLookup) {
      const a = this.newApp('dns', deviceId, 0, { name: n });
      this.finishApp(a, 'fail', '% Unrecognized host or address (DNS lookup is disabled: no ip domain-lookup)');
      return a.id;
    }
    if (!servers.length) {
      const a = this.newApp('dns', deviceId, 0, { name: n });
      this.finishApp(a, 'fail', role === 'host' ? 'No DNS server configured.' : '% Unrecognized host or address (no ip name-server configured)');
      return a.id;
    }
    const a = this.newApp('dns', deviceId, servers[0], { name: n });
    this.queue.push(this.now, { type: 'app-send', sessionId: a.id });
    return a.id;
  }

  /** Polls the first configured NTP server (UDP 123). */
  ntpPoll(deviceId: string): number | undefined {
    const server = this.mgmt(deviceId)
      .ntpServers.map((n) => parseIpv4(n))
      .find((n): n is number => n !== null);
    if (server === undefined) return undefined;
    const a = this.newApp('ntp', deviceId, server);
    this.queue.push(this.now, { type: 'app-send', sessionId: a.id });
    return a.id;
  }

  /** Opens an SSH/Telnet connection (TCP 22/23); the far device decides from its vty settings. */
  remoteLogin(deviceId: string, target: number, proto: 'ssh' | 'telnet', user?: string): number {
    const a = this.newApp(proto, deviceId, target, { user });
    this.queue.push(this.now, { type: 'app-send', sessionId: a.id });
    return a.id;
  }

  private appSend(id: number): void {
    const a = this.appSessions.get(id);
    if (!a || a.status !== 'pending') return;
    a.attempts++;
    const eg = this.egressFor(a.deviceId, a.target);
    if (!eg) {
      this.finishApp(a, 'fail', `% No route to ${formatIpv4(a.target)}`);
      return;
    }
    let pkt: Ipv4Packet;
    let label: string;
    if (a.kind === 'dns') {
      pkt = {
        kind: 'ipv4',
        src: eg.srcIp,
        dst: a.target,
        ttl: 64,
        dscp: 0,
        protocol: 'udp',
        udp: { srcPort: 49152 + a.id, dstPort: 53, app: { kind: 'dns-query', id: a.id, name: a.name! } },
        sizeBytes: 74,
      };
      label = `DNS ${this.name(a.deviceId)}: ${a.name}?`;
    } else if (a.kind === 'ntp') {
      pkt = {
        kind: 'ipv4',
        src: eg.srcIp,
        dst: a.target,
        ttl: 64,
        dscp: 0,
        protocol: 'udp',
        udp: { srcPort: 123, dstPort: 123, app: { kind: 'ntp-request', id: a.id } },
        sizeBytes: 76,
      };
      label = `NTP ${this.name(a.deviceId)} → ${formatIpv4(a.target)}`;
    } else {
      const port = a.kind === 'ssh' ? 22 : 23;
      pkt = {
        kind: 'ipv4',
        src: eg.srcIp,
        dst: a.target,
        ttl: 64,
        dscp: 16,
        protocol: 'tcp',
        tcp: { srcPort: 49152 + a.id, dstPort: port, flags: 'SYN', id: a.id },
        sizeBytes: 60,
      };
      label = `${a.kind === 'ssh' ? 'SSH' : 'Telnet'} ${this.name(a.deviceId)} → ${formatIpv4(a.target)}`;
    }
    a.flowId = this.newFlow(`${label}${a.attempts > 1 ? ` (retry ${a.attempts - 1})` : ''}`);
    this.lastEvent = { time: this.now, description: label, deviceId: a.deviceId };
    this.routeAndSend(a.deviceId, pkt, a.flowId, { originated: true });
    this.queue.push(this.now + APP_TIMEOUT_MS, { type: 'app-timeout', sessionId: a.id, attempt: a.attempts });
  }

  /** Sends a one-way UDP message (syslog / SNMP trap) from a device. */
  private sendOneWay(deviceId: string, dst: number, dstPort: number, app: AppMessage): void {
    const eg = this.egressFor(deviceId, dst);
    if (!eg) return;
    const flow = this.newFlow(`${app.kind === 'syslog' ? 'Syslog' : 'SNMP trap'} ${this.name(deviceId)} → ${formatIpv4(dst)}`);
    this.routeAndSend(
      deviceId,
      {
        kind: 'ipv4',
        src: eg.srcIp,
        dst,
        ttl: 64,
        dscp: 0,
        protocol: 'udp',
        udp: { srcPort: dstPort === 514 ? 514 : 49999, dstPort, app },
        sizeBytes: 120,
      },
      flow,
      { originated: true },
    );
  }

  private log(deviceId: string, text: string): void {
    const l = this.logs.get(deviceId) ?? [];
    l.push({ at: this.now, text });
    if (l.length > 200) l.shift();
    this.logs.set(deviceId, l);
  }

  /** Link up/down messages to the local log, syslog hosts and SNMP trap receivers. */
  private logLinkChanges(old: PhysicalState): void {
    if (!old.ports.size) return;
    for (const d of this.topology.devices) {
      const role = roleOf(d.kind);
      if (role === 'host' || role === 'hub' || role === 'opaque') continue;
      const m = this.mgmt(d.id);
      for (const p of d.ports) {
        const before = old.ports.get(portKey(d.id, p.id));
        const now = this.phys.ports.get(portKey(d.id, p.id));
        if (!before || !now || before.operUp === now.operUp) continue;
        const st = now.operUp ? 'up' : 'down';
        const msgs = [
          `%LINK-3-UPDOWN: Interface ${longIfName(p.id)}, changed state to ${st}`,
          `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${longIfName(p.id)}, changed state to ${st}`,
        ];
        for (const t of msgs) this.log(d.id, t);
        for (const h of m.loggingHosts) {
          const ip = parseIpv4(h);
          if (ip !== null) for (const t of msgs) this.sendOneWay(d.id, ip, 514, { kind: 'syslog', text: `${d.name}: ${t}` });
        }
        if (m.snmpTraps)
          for (const th of m.snmpTrapHosts) {
            const ip = parseIpv4(th.ip);
            if (ip !== null)
              this.sendOneWay(d.id, ip, 162, {
                kind: 'snmp-trap',
                community: th.community,
                text: `${d.name}: ${now.operUp ? 'linkUp' : 'linkDown'} ${longIfName(p.id)}`,
              });
          }
      }
    }
  }

  private reply(deviceId: string, toward: number, from: number, pkt: Ipv4Packet, flowId: number): void {
    this.routeAndSend(deviceId, { ...pkt, src: from, dst: toward, ttl: 64 }, flowId, { originated: true });
  }

  /** UDP application messages: DNS, NTP, syslog, SNMP traps. */
  private localApp(deviceId: string, iface: L3Interface, pkt: Ipv4Packet, flowId: number): void {
    const app = pkt.udp!.app!;
    const kind = this.devices.get(deviceId)!.kind;
    const role = this.role(deviceId);
    const m = this.mgmt(deviceId);
    const notListening = (what: string) =>
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'drop',
        table: 'Host stack',
        detail: `UDP ${pkt.udp!.dstPort} (${what}) is not served by this device — dropped.`,
      });
    switch (app.kind) {
      case 'mpls-echo-request':
        return notListening('MPLS echo');
      case 'mpls-echo-reply': {
        const ls = this.lspSessions.get(app.id);
        const p = ls?.probes[app.seq];
        if (!ls || !p || ls.srcDeviceId !== deviceId || p.code !== 'pending') return;
        p.code = app.code;
        p.from = pkt.src;
        p.info = app.info;
        p.rttMs = this.now - p.sentAt;
        this.trace(flowId, {
          deviceId,
          iface: iface.name,
          action: 'deliver',
          table: 'LFIB',
          detail: `MPLS echo reply from ${formatIpv4(pkt.src)}: return code ${app.code}${app.info ? ` (${app.info})` : ''}.`,
        });
        this.afterLsp(ls);
        return;
      }
      case 'dns-query': {
        const isServer = kind === 'dns-dhcp' || ((role === 'router' || role === 'l3switch') && m.dnsServer);
        if (!isServer) return notListening('DNS');
        const n = app.name.toLowerCase();
        const hit = m.hosts[n] ?? (m.domainName ? m.hosts[n.split('.')[0]] : undefined);
        const address = hit ? (parseIpv4(hit) ?? undefined) : undefined;
        this.trace(flowId, {
          deviceId,
          iface: iface.name,
          action: 'reply',
          table: 'Host stack',
          detail: `DNS server: ${n} → ${hit ?? 'NXDOMAIN (no such record)'}.`,
        });
        this.reply(
          deviceId,
          pkt.src,
          pkt.dst,
          { ...pkt, udp: { srcPort: 53, dstPort: pkt.udp!.srcPort, app: { kind: 'dns-reply', id: app.id, name: n, address } } },
          flowId,
        );
        return;
      }
      case 'ntp-request': {
        const synced = this.ntpState.get(deviceId);
        const stratum = m.ntpMaster ?? (kind === 'dns-dhcp' ? 2 : synced ? synced.stratum : undefined);
        if (stratum === undefined) {
          this.trace(flowId, {
            deviceId,
            iface: iface.name,
            action: 'drop',
            table: 'Host stack',
            detail: 'NTP request ignored: this device has no reliable clock (not ntp master, not synchronised).',
          });
          return;
        }
        this.trace(flowId, { deviceId, iface: iface.name, action: 'reply', table: 'Host stack', detail: `NTP server reply, stratum ${stratum}.` });
        this.reply(
          deviceId,
          pkt.src,
          pkt.dst,
          { ...pkt, udp: { srcPort: 123, dstPort: 123, app: { kind: 'ntp-reply', id: app.id, stratum } } },
          flowId,
        );
        return;
      }
      case 'syslog':
      case 'snmp-trap': {
        if (kind !== 'nms') return notListening(app.kind === 'syslog' ? 'syslog' : 'SNMP trap');
        const list = this.inbox.get(deviceId) ?? [];
        list.push({
          at: this.now,
          from: pkt.src,
          kind: app.kind === 'syslog' ? 'syslog' : 'trap',
          text: app.text,
          community: app.kind === 'snmp-trap' ? app.community : undefined,
        });
        if (list.length > 500) list.shift();
        this.inbox.set(deviceId, list);
        this.trace(flowId, {
          deviceId,
          iface: iface.name,
          action: 'deliver',
          table: 'Host stack',
          detail: `NMS stored ${app.kind === 'syslog' ? 'syslog message' : 'SNMP trap'}.`,
        });
        this.changed();
        return;
      }
      case 'dns-reply':
      case 'ntp-reply': {
        const a = this.appSessions.get(app.id);
        if (!a || a.deviceId !== deviceId || a.status !== 'pending') return;
        if (app.kind === 'dns-reply') {
          if (app.address !== undefined)
            this.finishApp(a, 'ok', `${app.name} is ${formatIpv4(app.address)} (DNS server ${formatIpv4(pkt.src)})`, app.address);
          else this.finishApp(a, 'fail', `*** ${formatIpv4(pkt.src)} can't find ${app.name}: Non-existent domain`);
        } else {
          this.ntpState.set(deviceId, { server: pkt.src, stratum: Math.min(16, app.stratum + 1), at: this.now });
          this.finishApp(a, 'ok', `Clock is synchronized, stratum ${Math.min(16, app.stratum + 1)}, reference is ${formatIpv4(pkt.src)}`);
        }
        this.trace(flowId, { deviceId, iface: iface.name, action: 'deliver', table: 'Host stack', detail: a.result ?? '' });
        return;
      }
    }
  }

  /** TCP SYN to the SSH/Telnet vty lines, and the client side of the answer. */
  private localTcp(deviceId: string, iface: L3Interface, pkt: Ipv4Packet, flowId: number): void {
    const tcp = pkt.tcp!;
    if (tcp.flags !== 'SYN') {
      const a = this.appSessions.get(tcp.id);
      if (!a || a.deviceId !== deviceId || a.status !== 'pending') return;
      this.trace(flowId, { deviceId, iface: iface.name, action: 'deliver', table: 'Host stack', detail: tcp.note ?? tcp.flags });
      this.finishApp(a, tcp.flags === 'SYN-ACK' ? 'ok' : 'fail', tcp.note ?? (tcp.flags === 'RST' ? '% Connection refused by remote host' : 'Open'));
      return;
    }
    const proto = tcp.dstPort === 22 ? 'ssh' : tcp.dstPort === 23 ? 'telnet' : undefined;
    const role = this.role(deviceId);
    const answer = (flags: 'SYN-ACK' | 'RST', note: string, payload?: string) => {
      this.trace(flowId, { deviceId, iface: iface.name, action: 'reply', table: 'Host stack', detail: `${flags}: ${note}` });
      this.reply(
        deviceId,
        pkt.src,
        pkt.dst,
        { ...pkt, tcp: { srcPort: tcp.dstPort, dstPort: tcp.srcPort, flags, id: tcp.id, note, payload } },
        flowId,
      );
    };
    if (!proto || role === 'host' || role === 'hub' || role === 'opaque') return answer('RST', '% Connection refused by remote host (port closed)');
    const m = this.mgmt(deviceId);
    const vty = m.vty;
    if (vty.accessClass) {
      const acl = this.configs.get(deviceId)!.acls[vty.accessClass];
      if (!acl || !this.aclPermits(deviceId, vty.accessClass, pkt, flowId, 'vty', 'in'))
        return answer('RST', `% Connection refused by remote host (vty access-class ${vty.accessClass} denies ${formatIpv4(pkt.src)})`);
    }
    if (vty.transport === 'none' || (vty.transport !== 'all' && vty.transport !== proto))
      return answer('RST', `% Connection refused by remote host (transport input ${vty.transport})`);
    if (proto === 'ssh' && (!m.rsaModulus || !m.domainName))
      return answer('RST', '% Connection refused by remote host (SSH is not enabled: needs ip domain-name and crypto key generate rsa)');
    const a = this.appSessions.get(tcp.id);
    const user = a?.user;
    const wire = (secret: string) => (proto === 'telnet' ? `cleartext on the wire: ${secret}` : 'encrypted (SSH-2.0) — contents not readable');
    if (vty.login === 'none')
      return answer('SYN-ACK', 'Open — no login required (insecure: anyone can configure this device)', wire('session in cleartext'));
    if (vty.login === 'line') {
      if (!vty.passwordSet) return answer('SYN-ACK', 'Password required, but none set — connection closed by foreign host');
      return answer('SYN-ACK', 'Open — line password prompt (interactive session not simulated)', wire('Password: <line password visible>'));
    }
    const users = Object.keys(m.users);
    if (!users.length) return answer('SYN-ACK', '% Login invalid — login local is set but no usernames exist (nobody can log in)');
    if (!user) return answer('SYN-ACK', 'Open — Username: prompt (interactive session not simulated)', wire('Username/Password typed by the user'));
    if (!m.users[user]) return answer('SYN-ACK', `% Login invalid — no local user "${user}"`, wire(`Username: ${user}`));
    return answer(
      'SYN-ACK',
      `Logged in as ${user} (privilege ${m.users[user].privilege}) — interactive session not simulated; use this device's console`,
      wire(`Username: ${user} Password: <visible>`),
    );
  }

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
    const ip = ((169 << 24) | (254 << 16) | ((1 + ((h >> 8) % 254)) << 8) | (1 + ((h & 0xff) % 254))) >>> 0;
    c.state = 'apipa';
    c.lease = { ip, prefixLen: 16, obtainedAt: this.now, apipa: true };
    const flowId = this.newFlow(`DHCP ${this.name(deviceId)}: no server answered — APIPA`);
    this.trace(flowId, {
      deviceId,
      iface: ifName,
      action: 'learn',
      table: 'DHCP',
      detail: `No DHCP offer after ${c.attempts} attempts — self-assigned APIPA address ${formatIpv4(ip)}/16 (no gateway).`,
    });
    this.recompute();
  }

  /** Sends a DHCP message as an IP broadcast on an interface (client → servers, or relay/server → client). */
  private dhcpBroadcast(deviceId: string, iface: L3Interface, msg: DhcpMessage, srcPort: number, dstPort: number, src: number, flowId: number): void {
    const pkt: Ipv4Packet = {
      kind: 'ipv4',
      src,
      dst: 0xffffffff,
      ttl: 64,
      dscp: 48,
      protocol: 'udp',
      udp: { srcPort, dstPort, dhcp: msg },
      sizeBytes: 342,
    };
    const frame: Frame = { srcMac: iface.mac, dstMac: BROADCAST_MAC, payload: pkt, flowId };
    this.trace(
      flowId,
      {
        deviceId,
        iface: iface.name,
        action: 'send',
        table: 'DHCP',
        detail: `DHCP ${msg.op.toUpperCase()} broadcast (xid 0x${msg.xid.toString(16)}).`,
      },
      frame,
    );
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
          const relayed: Ipv4Packet = {
            kind: 'ipv4',
            src: iface.ip,
            dst,
            ttl: 64,
            dscp: 48,
            protocol: 'udp',
            udp: { srcPort: 67, dstPort: 67, dhcp: { ...msg, giaddr: iface.ip } },
            sizeBytes: 342,
          };
          this.trace(flowId, {
            deviceId,
            iface: iface.name,
            action: 'forward',
            table: 'DHCP',
            detail: `DHCP relay (ip helper-address): ${msg.op.toUpperCase()} unicast to ${h}, giaddr ${formatIpv4(iface.ip)}.`,
          });
          this.routeAndSend(deviceId, relayed, flowId, { originated: true });
        }
        return;
      }
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'drop',
        table: 'DHCP',
        detail: hasPools ? 'No DHCP pool matches this subnet.' : 'No DHCP server or relay (ip helper-address) on this interface.',
      });
      return;
    }

    // Server → client messages.
    if (msg.giaddr !== undefined && this.isLocalAddress(deviceId, msg.giaddr) && pkt.dst !== 0xffffffff) {
      // We are the relay: hand the reply to the client on the giaddr interface.
      const out = this.interfaces(deviceId).find((i) => i.ip === msg.giaddr && i.up);
      if (out) {
        this.trace(flowId, {
          deviceId,
          iface: out.name,
          action: 'forward',
          table: 'DHCP',
          detail: `DHCP relay: ${msg.op.toUpperCase()} from server delivered to client segment ${out.name}.`,
        });
        this.dhcpBroadcast(deviceId, out, msg, 67, 68, out.ip!, flowId);
      }
      return;
    }
    const c = this.dhcpClients.get(this.dhcpKey(deviceId, iface.name));
    if (!c || msg.chaddr !== iface.mac || msg.xid !== c.xid) return;
    if (msg.op === 'offer' && c.state === 'selecting') {
      c.state = 'requesting';
      c.offer = msg;
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'learn',
        table: 'DHCP',
        detail: `OFFER ${formatIpv4(msg.yiaddr!)} from server ${formatIpv4(msg.serverId ?? 0)} — sending REQUEST.`,
      });
      this.dhcpBroadcast(
        deviceId,
        iface,
        { op: 'request', xid: c.xid, chaddr: iface.mac, requestedIp: msg.yiaddr, serverId: msg.serverId },
        68,
        67,
        0,
        flowId,
      );
    } else if (msg.op === 'ack' && c.state === 'requesting') {
      c.state = 'bound';
      c.lease = {
        ip: msg.yiaddr!,
        prefixLen: maskToPrefix(formatIpv4(msg.mask ?? 0)) ?? 24,
        router: msg.router,
        dns: msg.dns,
        server: msg.serverId,
        obtainedAt: this.now,
        apipa: false,
      };
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'learn',
        table: 'DHCP',
        detail: `ACK — bound to ${formatIpv4(msg.yiaddr!)}${msg.router !== undefined ? `, gateway ${formatIpv4(msg.router)}` : ''}.`,
      });
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
        dns: pool.dnsServer ? (parseIpv4(pool.dnsServer) ?? undefined) : undefined,
        leaseSec: Math.round(pool.leaseDays * 86400),
      };
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'reply',
        table: 'DHCP',
        detail: `DHCP server pool ${poolName}: ${op.toUpperCase()}${yiaddr !== undefined ? ` ${formatIpv4(yiaddr)}` : ''}.`,
      });
      if (msg.giaddr) {
        const pkt: Ipv4Packet = {
          kind: 'ipv4',
          src: serverId,
          dst: msg.giaddr,
          ttl: 64,
          dscp: 48,
          protocol: 'udp',
          udp: { srcPort: 67, dstPort: 67, dhcp: out },
          sizeBytes: 342,
        };
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
      m.p.labels = icmp.mplsLabels;
    } else {
      m.p.outcome = 'unreachable';
      m.p.from = pkt.src;
      m.p.code = icmp.code;
    }
    m.p.rttMs = this.now - m.p.sentAt;
    this.trace(flowId, {
      deviceId,
      action: 'deliver',
      table: 'ICMP',
      detail: `ICMP ${icmp.type} from ${formatIpv4(pkt.src)} (RTT ${m.p.rttMs.toFixed(3)} ms).`,
    });
    this.afterProbe(m.s);
  }

  private sendIcmpError(
    deviceId: string,
    src: number,
    orig: Ipv4Packet,
    type: 'time-exceeded' | 'dest-unreachable',
    code: string,
    flowId: number,
  ): void {
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
    const via =
      r.route.protocol === 'C' || r.route.protocol === 'L'
        ? `directly connected via ${iface.name}`
        : `${r.route.protocol} route ${formatIpv4(r.route.network)}/${r.route.prefixLen} via ${formatIpv4(r.nextHop)} (${iface.name})`;
    this.trace(flowId, {
      deviceId,
      iface: iface.name,
      action: o.originated ? 'send' : 'forward',
      table: 'Routing table',
      detail: `${formatIpv4(pkt.dst)}: ${via}${o.originated ? '' : `, TTL now ${pkt.ttl}`}.`,
    });

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

    // MPLS imposition (FTN): push the label learned from the next hop's LSR for this prefix.
    const ftn = this.ldp.byFec
      .get(`${deviceId}|${prefixKey(r.route.network, r.route.prefixLen)}`)
      ?.find((e) => e.nextHop === r.nextHop && e.iface === iface.name);
    let mpls: MplsLabel[] | undefined;
    if (ftn && typeof ftn.out === 'number') {
      const propagate = this.configs.get(deviceId)!.mpls.propagateTtl;
      mpls = [{ label: ftn.out, tc: pkt.dscp >> 3, ttl: propagate ? pkt.ttl : 255 }];
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'forward',
        table: 'LFIB',
        detail: `MPLS push: label ${ftn.out} for FEC ${formatIpv4(ftn.network)}/${ftn.prefixLen} (learned by LDP from the next hop)${propagate ? '' : ', label TTL 255 (no propagate-ttl)'}.`,
      });
    }
    this.sendToNextHop(deviceId, iface, r.nextHop, pkt, mpls, flowId, o.originated);
  }

  /** ARP resolution + transmission towards a next hop (shared by IP routing and label switching). */
  private sendToNextHop(
    deviceId: string,
    iface: L3Interface,
    nextHop: number,
    pkt: Ipv4Packet,
    mpls: MplsLabel[] | undefined,
    flowId: number,
    originated: boolean,
  ): void {
    if (iface.ip === undefined) {
      this.trace(flowId, { deviceId, iface: iface.name, action: 'drop', table: 'Interface', detail: `${iface.name} has no IP address.` });
      return;
    }
    const r = { nextHop };
    const o = { originated };
    const rt = this.rt(deviceId);
    const arp = rt.arp.get(r.nextHop);
    if (arp && arp.iface === iface.name && this.now - arp.at <= ARP_TIMEOUT_MS) {
      const frame: Frame = { srcMac: iface.mac, dstMac: arp.mac, payload: pkt, flowId, mpls };
      this.trace(
        flowId,
        { deviceId, iface: iface.name, action: 'send', table: 'ARP cache', detail: `Next hop ${formatIpv4(r.nextHop)} is at ${arp.mac}.` },
        frame,
      );
      this.sendOnIface(deviceId, iface, frame);
      return;
    }

    // ARP needed.
    const pend = rt.pending.get(r.nextHop);
    // Locally generated management traffic (DNS, NTP, syslog, SNMP, SSH/Telnet) waits for ARP like a host;
    // transit packets and pings follow the IOS "drop the packet that triggers ARP" behaviour.
    const routing = routesPackets(this.devices.get(deviceId)!.kind, this.configs.get(deviceId)!) && !(o.originated && !pkt.icmp);
    if (!pend || this.now - pend.requestedAt >= ARP_RETRY_MS) {
      const arpFlow = this.newFlow(`ARP ${this.name(deviceId)}: who has ${formatIpv4(r.nextHop)}?`, flowId);
      const req: Frame = {
        srcMac: iface.mac,
        dstMac: BROADCAST_MAC,
        flowId: arpFlow,
        payload: { kind: 'arp', op: 'request', senderMac: iface.mac, senderIp: iface.ip, targetMac: '00:00:00:00:00:00', targetIp: r.nextHop },
      };
      this.trace(
        arpFlow,
        {
          deviceId,
          iface: iface.name,
          action: 'send',
          table: 'ARP cache',
          detail: `ARP request: who has ${formatIpv4(r.nextHop)}? Tell ${formatIpv4(iface.ip)}.`,
        },
        req,
      );
      rt.pending.set(r.nextHop, { iface: iface.name, requestedAt: this.now, queue: routing ? [] : (pend?.queue ?? []) });
      this.queue.push(this.now + ARP_QUEUE_HOLD_MS, { type: 'arp-expire', deviceId, ip: r.nextHop });
      this.sendOnIface(deviceId, iface, req);
    }
    if (routing) {
      // IOS drops the packet that triggers ARP resolution (the familiar ".!!!!").
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'drop',
        table: 'ARP cache',
        detail: `ARP entry for ${formatIpv4(r.nextHop)} incomplete — packet dropped (router behaviour).`,
      });
    } else {
      const p = rt.pending.get(r.nextHop)!;
      if (p.queue.length < 5) p.queue.push({ pkt, flowId, mpls, iface: iface.name });
      this.trace(flowId, {
        deviceId,
        iface: iface.name,
        action: 'queue',
        table: 'ARP cache',
        detail: `Waiting for ARP reply for ${formatIpv4(r.nextHop)} — packet queued.`,
      });
    }
  }

  private drainPending(deviceId: string, ip: number): void {
    const rt = this.rt(deviceId);
    const pend = rt.pending.get(ip);
    if (!pend) return;
    rt.pending.delete(ip);
    for (const q of pend.queue) {
      const out = q.iface ? this.interfaces(deviceId).find((i) => i.name === q.iface && i.up) : undefined;
      if (q.mpls && out) this.sendToNextHop(deviceId, out, ip, q.pkt, q.mpls, q.flowId, true);
      else this.routeAndSend(deviceId, q.pkt, q.flowId, { originated: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Frame view for the packet inspector
// ---------------------------------------------------------------------------

export function viewFrame(f: Frame): FrameView {
  const base = { srcMac: f.srcMac, dstMac: f.dstMac, vlanTag: f.vlanTag, etherType: etherTypeOf(f), mpls: f.mpls?.map((l) => ({ ...l })) };
  const p = f.payload;
  if (p.kind === 'arp') {
    const a = p as ArpPacket;
    return {
      ...base,
      summary:
        a.op === 'request'
          ? `ARP who-has ${formatIpv4(a.targetIp)} tell ${formatIpv4(a.senderIp)}`
          : `ARP ${formatIpv4(a.senderIp)} is-at ${a.senderMac}`,
      arp: { op: a.op, senderMac: a.senderMac, senderIp: formatIpv4(a.senderIp), targetMac: a.targetMac, targetIp: formatIpv4(a.targetIp) },
    };
  }
  const ip = p as Ipv4Packet;
  const dhcp = ip.udp?.dhcp;
  const app = ip.udp?.app;
  const appText = app ? describeApp(app) : '';
  const l4 = ip.icmp
    ? `${ip.icmp.type}${ip.icmp.code ? ` (${ip.icmp.code})` : ''} id=${ip.icmp.id} seq=${ip.icmp.seq}`
    : ip.tcp
      ? `TCP ${ip.tcp.srcPort} → ${ip.tcp.dstPort} [${ip.tcp.flags}]${ip.tcp.payload ? ` — ${ip.tcp.payload}` : ''}`
      : `UDP ${ip.udp?.srcPort} → ${ip.udp?.dstPort}${dhcp ? ` DHCP ${dhcp.op.toUpperCase()} xid=0x${dhcp.xid.toString(16)}${dhcp.yiaddr !== undefined ? ` yiaddr=${formatIpv4(dhcp.yiaddr)}` : ''}${dhcp.giaddr ? ` giaddr=${formatIpv4(dhcp.giaddr)}` : ''}` : ''}${appText ? ` ${appText}` : ''}`;
  return {
    ...base,
    summary:
      (f.mpls?.length ? `MPLS [${f.mpls.map((l) => l.label).join('/')}] ` : '') +
      (ip.icmp
        ? `ICMP ${ip.icmp.type} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)} TTL ${ip.ttl}`
        : ip.tcp
          ? `${ip.tcp.dstPort === 22 || ip.tcp.srcPort === 22 ? 'SSH' : ip.tcp.dstPort === 23 || ip.tcp.srcPort === 23 ? 'Telnet' : 'TCP'} ${ip.tcp.flags} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)}`
          : app
            ? `${appText} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)}`
            : `DHCP ${dhcp?.op.toUpperCase() ?? 'UDP'} ${formatIpv4(ip.src)} → ${formatIpv4(ip.dst)}`),
    ip: {
      src: formatIpv4(ip.src),
      dst: formatIpv4(ip.dst),
      ttl: ip.ttl,
      dscp: ip.dscp,
      protocol: ip.protocol === 'icmp' ? 'ICMP (1)' : ip.protocol === 'tcp' ? 'TCP (6)' : 'UDP (17)',
      icmp: l4,
      sizeBytes: ip.sizeBytes,
    },
  };
}

export function isInSubnetOf(iface: L3Interface, ip: number): boolean {
  return iface.network !== undefined && inSubnet(ip, iface.network, iface.prefixLen!);
}

function describeApp(a: AppMessage): string {
  switch (a.kind) {
    case 'dns-query':
      return `DNS query A? ${a.name}`;
    case 'dns-reply':
      return `DNS reply ${a.name} → ${a.address !== undefined ? formatIpv4(a.address) : 'NXDOMAIN'}`;
    case 'ntp-request':
      return 'NTP client request';
    case 'ntp-reply':
      return `NTP server reply (stratum ${a.stratum})`;
    case 'syslog':
      return `Syslog "${a.text}"`;
    case 'snmp-trap':
      return `SNMP trap (community ${a.community}) "${a.text}"`;
    case 'mpls-echo-request':
      return `MPLS echo request (LSP ping) FEC ${a.fec}`;
    case 'mpls-echo-reply':
      return `MPLS echo reply, return code ${a.code}${a.info ? ` (${a.info})` : ''}`;
  }
}
