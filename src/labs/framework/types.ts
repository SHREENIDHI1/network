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

export type RouteProtocol = 'connected' | 'static' | 'ospf' | 'bgp';

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

export interface LdpNeighbor {
  device: string;
  neighbor: string;
  state: 'OPERATIONAL' | 'NON-EXISTENT' | 'INITIALIZED';
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
  // ospf (Phase 3)
  readonly ospfNeighbors?: readonly OspfNeighbor[];
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
  readonly pseudowires?: readonly PseudowireState[];
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
}

export interface Lab {
  id: string; // e.g. "L3.2"
  level: number; // 0..12
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
  solution?: LabSolution;
}
