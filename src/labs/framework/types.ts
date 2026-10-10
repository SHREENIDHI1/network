import type { OpticalStatus } from '../../engine/physical/opticalBudget';
import type { Topology } from '../../model/types';
import type { EngineModule } from './modules';

/**
 * Lab framework types. Checks receive a read-only SimSnapshot and must not
 * touch the UI or mutate anything.
 *
 * Snapshot sections for modules that are not built yet are `undefined`.
 * Their shapes below are the contract later phases must produce; the
 * checker helpers already read them, and report "needs module X" when absent.
 * Device-keyed maps use the device name (hostname), as a CLI would.
 */

// ---------------------------------------------------------------------------
// Snapshot sections
// ---------------------------------------------------------------------------

export interface OpticalLinkState {
  linkId: string;
  status: OpticalStatus;
  rxPowerDbm: number;
  marginDb: number;
}

export type SwitchportMode = 'access' | 'trunk' | 'routed';

export interface SwitchportState {
  mode: SwitchportMode;
  accessVlan?: number;
  allowedVlans?: number[];
  nativeVlan?: number;
  portSecurity?: { enabled: boolean; maxMac: number; violation: 'shutdown' | 'restrict' | 'protect'; errDisabled: boolean };
}

export interface VlanInfo {
  id: number;
  name: string;
}

export interface StpBridgeState {
  isRoot: boolean;
  priority: number;
  rootPort?: string;
  ports: Record<string, { role: 'root' | 'designated' | 'alternate' | 'disabled'; state: 'forwarding' | 'discarding' }>;
}

export interface EtherChannelInfo {
  name: string;
  protocol: 'LACP' | '-';
  up: boolean;
  members: Array<{ port: string; flag: 'P' | 'I' | 's' | 'D' }>;
}

export interface MacEntry {
  vlan: number;
  mac: string;
  port: string;
}

export type RouteProtocol = 'connected' | 'static' | 'ospf' | 'isis' | 'rip' | 'bgp';

export interface RouteEntry {
  prefix: string; // CIDR, e.g. "10.20.1.0/24"
  protocol: RouteProtocol;
  nextHop?: string;
  outInterface?: string;
  metric?: number;
}

export interface InterfaceIp {
  device: string;
  iface: string;
  address: string; // CIDR host address, e.g. "10.20.1.1/24"
  vrf?: string;
}

export type OspfState = 'DOWN' | 'INIT' | '2WAY' | 'EXSTART' | 'EXCHANGE' | 'LOADING' | 'FULL';

export interface OspfNeighbor {
  device: string;
  neighbor: string;
  state: OspfState;
  area: string;
}

export interface IsisAdjacencyInfo {
  device: string;
  neighbor: string;
  level: 1 | 2;
}

export interface FhrpGroupInfo {
  protocol: 'hsrp' | 'vrrp';
  group: number;
  vip?: string;
  active?: string;
  standby?: string;
  members: string[];
}

export interface AppResult {
  src: string;
  kind: 'dns' | 'ntp' | 'ssh' | 'telnet';
  /** Target device name when known, else the address / name. */
  target: string;
  status: 'ok' | 'fail' | 'pending';
  result: string;
}

export interface QosFlowInfo {
  src: string;
  dst: string;
  app: string;
  dscp: number;
  offeredMbps: number;
  deliveredMbps: number;
  lossPct: number;
  /** L3 hops: device, egress interface and the MPLS EXP when the packet leaves labelled. */
  hops?: Array<{ device: string; iface: string; exp?: number }>;
}

export interface SrSidInfo {
  device: string;
  prefix: string;
  index: number;
}

export interface TiLfaInfo {
  device: string;
  prefix: string;
  protected: boolean;
}

export interface NmsDeviceInfo {
  device: string;
  state: 'managed' | 'unreachable' | 'not-managed';
}

export interface NmsAlarmInfo {
  device: string;
  object?: string;
  type: string;
  severity: 'critical' | 'major' | 'minor' | 'warning';
  layer: 'root' | 'impact' | 'info';
}

export interface TeTunnelInfo {
  head: string;
  tunnel: string;
  state: 'up' | 'down';
  reason?: string;
  /** Device names along the LSP (head … tail). */
  path: string[];
  bandwidthKbps: number;
  frr: 'none' | 'ready' | 'active';
}

export interface AclBinding {
  device: string;
  iface: string;
  dir: 'in' | 'out';
  acl: string;
}

export interface LdpNeighbor {
  device: string;
  neighbor: string;
  state: 'OPERATIONAL' | 'NON-EXISTENT' | 'INITIALIZED';
}

export interface LspResult {
  src: string;
  /** "A.B.C.D/len" */
  fec: string;
  kind: 'ping' | 'trace';
  /** One IOS code per probe, e.g. "!!!!!" or "LL!". */
  codes: string;
  success: boolean;
}

export interface LfibEntry {
  device: string;
  inLabel: number | null;
  fec: string;
  /** 'pop' covers implicit-null (PHP) on the penultimate hop. */
  action: 'push' | 'swap' | 'pop';
  outLabel?: number;
  nextHop?: string;
}

export interface VrfRoute {
  device: string;
  vrf: string;
  prefix: string;
  protocol: RouteProtocol;
}

export interface VrfDefinition {
  device: string;
  vrf: string;
  rd: string;
  importRts: string[];
  exportRts: string[];
}

export interface BgpSessionInfo {
  device: string;
  /** Set for PE–CE sessions inside a VRF. */
  vrf?: string;
  neighbor: string;
  /** Device on the other end, when found. */
  peer?: string;
  state: string;
  ibgp: boolean;
  afs: string[];
}

export interface BgpVpnv4Route {
  device: string;
  rd: string;
  prefix: string;
  nextHop: string;
  rts: string[];
  label: number;
  best: boolean;
}

export interface PseudowireState {
  a: string;
  b: string;
  vcId: number;
  type: 'vpws-eth' | 'satop' | 'cesopsn' | 'vpls';
  status: 'UP' | 'DOWN';
  /** Why the VC is down (engine reason). */
  reason?: string;
}

export interface SdhXconnect {
  device: string;
  /** VC-12 position as K-L-M (TUG-3, TUG-2, TU-12), e.g. "1-1-1". */
  vc12: string;
  from: string;
  to: string;
}

export type AlarmType =
  | 'LOS'
  | 'LOF'
  | 'AIS'
  | 'RDI'
  | 'MS-AIS'
  | 'MS-RDI'
  | 'TU-AIS'
  | 'LP-RDI'
  | 'LINK-DOWN'
  | 'LDP-DOWN'
  | 'BGP-DOWN'
  | 'PW-DOWN'
  | 'ERR-DISABLED';

export interface Alarm {
  device: string;
  port?: string;
  type: AlarmType;
  severity: 'critical' | 'major' | 'minor' | 'warning';
}

export interface ServiceState {
  /** Railway circuit name, e.g. "Block MTD–GOTN". */
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  carriedBy: 'sdh' | 'mpls' | 'ip';
}

export interface PingResult {
  src: string;
  dst: string; // IP address
  vrf?: string;
  success: boolean;
  hops?: string[];
}

export interface QosMapping {
  device: string;
  dscp: number;
  exp: number;
}

export interface TimeslotMapping {
  device: string;
  e1: string;
  timeslot: number; // 1..31, TS0 = framing, TS16 = CAS signalling
  channel: string;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface SimSnapshot {
  readonly topology: Topology;
  readonly modules: ReadonlySet<EngineModule>;
  // physical (Phase 1)
  readonly optical?: readonly OpticalLinkState[];
  // ethernet (Phase 2)
  readonly switchports?: Readonly<Record<string, Readonly<Record<string, SwitchportState>>>>;
  readonly macTables?: Readonly<Record<string, readonly MacEntry[]>>;
  readonly vlans?: Readonly<Record<string, readonly VlanInfo[]>>;
  readonly stp?: Readonly<Record<string, StpBridgeState>>;
  readonly etherChannels?: Readonly<Record<string, readonly EtherChannelInfo[]>>;
  /** Links whose two ends ended up with different duplex, as "DEV port". */
  readonly duplexMismatches?: readonly string[];
  /** Default gateway of each host (device name → IP). */
  readonly hostGateways?: Readonly<Record<string, string>>;
  // ip (Phase 2)
  readonly interfaceIps?: readonly InterfaceIp[];
  readonly routingTables?: Readonly<Record<string, readonly RouteEntry[]>>;
  readonly pings?: readonly PingResult[];
  // ospf / IS-IS / services (Phase 3)
  readonly ospfNeighbors?: readonly OspfNeighbor[];
  readonly isisAdjacencies?: readonly IsisAdjacencyInfo[];
  readonly fhrpGroups?: readonly FhrpGroupInfo[];
  readonly natTranslations?: Readonly<Record<string, readonly { insideLocal: string; insideGlobal: string }[]>>;
  readonly dhcpStates?: Readonly<Record<string, string>>;
  readonly aclBindings?: readonly AclBinding[];
  readonly ntp?: Readonly<Record<string, { synced: boolean; stratum?: number }>>;
  readonly nmsInbox?: Readonly<Record<string, { syslog: number; traps: number }>>;
  readonly vty?: Readonly<Record<string, { transport: string; login: string; sshEnabled: boolean; accessClass?: string }>>;
  readonly appResults?: readonly AppResult[];
  readonly qosFlows?: readonly QosFlowInfo[];
  readonly teTunnels?: readonly TeTunnelInfo[];
  readonly nmsDevices?: readonly NmsDeviceInfo[];
  readonly srSids?: readonly SrSidInfo[];
  readonly srRouters?: readonly string[];
  readonly tiLfa?: readonly TiLfaInfo[];
  readonly nmsAlarms?: readonly NmsAlarmInfo[];
  /** Running-config text of routers and switches (automation / compliance checks). */
  readonly runningConfigs?: ReadonlyArray<{ device: string; text: string }>;
  /** Links cut with "Cut fibre/cable", as [device A, device B] names. */
  readonly cutLinks?: ReadonlyArray<readonly [string, string]>;
  // qos (Phase 3)
  readonly qosMaps?: readonly QosMapping[];
  // pdh / sdh (Phase 4)
  readonly timeslots?: readonly TimeslotMapping[];
  readonly sdhXconnects?: readonly SdhXconnect[];
  readonly alarms?: readonly Alarm[];
  // mpls / bgp / l2vpn (Phase 5)
  readonly ldpNeighbors?: readonly LdpNeighbor[];
  readonly lfib?: readonly LfibEntry[];
  readonly vrfs?: readonly VrfDefinition[];
  readonly vrfRoutes?: readonly VrfRoute[];
  readonly bgpVpnv4?: readonly BgpVpnv4Route[];
  readonly bgpSessions?: readonly BgpSessionInfo[];
  readonly pseudowires?: readonly PseudowireState[];
  /** Completed LSP pings / traces (ping mpls ipv4, traceroute mpls ipv4). */
  readonly lspResults?: readonly LspResult[];
  // nms (Phase 6)
  readonly services?: readonly ServiceState[];
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

export interface CheckResult {
  pass: boolean;
  /** Explains WHAT is missing. Must never reveal the full answer. */
  detail: string;
}

export type Check = (snap: SimSnapshot) => CheckResult;

export interface Task {
  id: string;
  text: string;
  check: Check;
  points: number;
}

export interface QuizQuestion {
  id: string;
  /** 'practical' questions are answered by looking at the simulator. */
  kind: 'mcq' | 'practical';
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** A fault injected after the main tasks pass; the learner must find and fix it. */
export interface BreakFix {
  /** Field complaint in Hinglish, using real stations. */
  complaint: string;
  /** Changes the learner's working topology to create the fault. */
  apply: (topology: Topology) => Topology;
  /** Passes when the fault is fixed and the service is back. */
  check: Check;
  hints: string[];
  /** Reference fix (tests prove it passes the check). */
  fix: LabSolution;
}

/** Reference solution, used by tests and shown after completion. */
export interface LabSolution {
  /** IOS-like CLI lines per device name. */
  cli?: Record<string, string[]>;
  /** Host NIC settings per device name (done in the properties panel). */
  hosts?: Record<string, { ip: string; mask: string; gateway?: string }>;
  /** Pings to run at the end, [source device, destination IP]. */
  pings?: Array<[string, string]>;
  /** Cables to connect, [device, port, device, port]. */
  links?: Array<[string, string, string, string]>;
  /** DHCP pools to add on DNS/DHCP server devices (properties panel). */
  pools?: Record<string, Array<{ name: string; network: string; mask: string; gateway?: string; dns?: string }>>;
  /** Links to cut (fibre-cut simulation), [device A, device B]. Applied before the pings. */
  cuts?: Array<[string, string]>;
  /** Interfaces to bounce (shutdown, then no shutdown) after the CLI, [device, interface] — e.g. to raise syslog/traps. */
  flaps?: Array<[string, string]>;
  /** Hosts that run "ipconfig /renew" after the configuration. */
  renew?: string[];
  /** LSP pings to run after the pings, [source router, FEC "A.B.C.D/len"]. */
  lsp?: Array<[string, string]>;
  /** MPLS traceroutes to run after the LSP pings, [source router, FEC]. */
  lspTrace?: Array<[string, string]>;
  /** Host command-prompt lines (nslookup, ssh, telnet…) run last, per device name. */
  hostCli?: Record<string, string[]>;
  /** Devices whose injected hardware faults (power, cards) are repaired first. */
  repair?: string[];
}

export interface Lab {
  id: string; // e.g. "L3.2" (Part A) or "LB3.1" (Part B)
  /** Curriculum part; default 'A'. */
  part?: 'A' | 'B';
  level: number; // lesson number within the part (A9 → 9, B3 → 3)
  order: number; // position within level
  title: string;
  /** Hinglish, railway-realistic. */
  scenario: string;
  objectives: string[];
  topologyId: string;
  requiredModules: EngineModule[];
  tasks: Task[];
  /** hints[i] = progressive hints for tasks[i]. */
  hints: string[][];
  quiz: QuizQuestion[];
  estMinutes: number;
  fieldNote: string;
  /** Hidden from the lab browser (e.g. reference solutions). */
  hidden?: boolean;
  /** Concept in 5–10 lines + railway analogy (Hinglish). */
  concept?: string;
  /** Address / VLAN plan table shown with the tasks. */
  plan?: { headers: string[]; rows: string[][] };
  /** Lesson this lab practises, e.g. "A7". */
  lessonId?: string;
  breakFix?: BreakFix;
  /** Several faults in sequence (capstone fault tickets); used instead of breakFix. */
  tickets?: BreakFix[];
  /** Draw only this many tickets per run, in an order fixed by the run's seed (the rest stay in the catalog). */
  ticketDraw?: number;
  solution?: LabSolution;
}
