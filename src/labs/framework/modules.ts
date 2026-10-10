/**
 * Engine module availability. Labs declare the modules they need; a lab whose
 * modules are not built is shown as locked instead of faking behaviour.
 *
 * Update BUILT_MODULES when a phase lands. Nothing else needs to change:
 * locks, check messages and the lab browser all read from here.
 */

export type EngineModule =
  | 'topology'
  | 'physical'
  | 'sim'
  | 'ethernet'
  | 'ip'
  | 'ospf'
  | 'services'
  | 'qos'
  | 'resilience'
  | 'pdh'
  | 'sdh'
  | 'mpls'
  | 'bgp'
  | 'l2vpn'
  | 'te'
  | 'faults'
  | 'nms'
  | 'migration';

export interface ModuleInfo {
  id: EngineModule;
  label: string;
  /** Build-plan phase that delivers this module. */
  phase: number;
}

export const MODULES: Record<EngineModule, ModuleInfo> = {
  topology: { id: 'topology', label: 'Topology model (devices, ports, links)', phase: 1 },
  physical: { id: 'physical', label: 'Physical layer (optical budget)', phase: 1 },
  sim: { id: 'sim', label: 'Discrete-event engine (step/play)', phase: 2 },
  ethernet: { id: 'ethernet', label: 'Ethernet / 802.1Q VLAN / RSTP / port security', phase: 2 },
  ip: { id: 'ip', label: 'IPv4, ARP, static routes, ping/traceroute', phase: 2 },
  ospf: { id: 'ospf', label: 'OSPF / IS-IS / RIP', phase: 3 },
  services: { id: 'services', label: 'DHCP, DNS, NAT, ACL, NTP, syslog, SNMP, SSH', phase: 3 },
  qos: { id: 'qos', label: 'QoS (DSCP/EXP, queues)', phase: 3 },
  resilience: { id: 'resilience', label: 'HSRP/VRRP first-hop redundancy', phase: 3 },
  pdh: { id: 'pdh', label: 'PD-Mux / E1 (G.704) timeslots', phase: 4 },
  sdh: { id: 'sdh', label: 'SDH mapping, cross-connects, alarms, protection', phase: 4 },
  mpls: { id: 'mpls', label: 'MPLS LDP / LFIB / PHP', phase: 4 },
  bgp: { id: 'bgp', label: 'VRF + MP-BGP VPNv4 + route reflector', phase: 5 },
  l2vpn: { id: 'l2vpn', label: 'VPWS / VPLS / E1 emulation', phase: 6 },
  te: { id: 'te', label: 'RSVP-TE + FRR', phase: 7 },
  faults: { id: 'faults', label: 'Fault injection', phase: 8 },
  nms: { id: 'nms', label: 'NMS dashboard, service status', phase: 8 },
  migration: { id: 'migration', label: 'SDH → IP-MPLS migration mode', phase: 6 },
};

/** Modules that actually exist in this build. */
export const BUILT_MODULES: ReadonlySet<EngineModule> = new Set<EngineModule>([
  'topology',
  'physical',
  'sim',
  'ethernet',
  'ip',
  'ospf',
  'services',
  'qos',
  'resilience',
  'mpls',
  'bgp',
]);

export function missingModules(required: readonly EngineModule[], built: ReadonlySet<EngineModule> = BUILT_MODULES): EngineModule[] {
  return required.filter((m) => !built.has(m));
}

/** Human-readable lock reason, or null if every required module is built. */
export function lockReason(required: readonly EngineModule[], built: ReadonlySet<EngineModule> = BUILT_MODULES): string | null {
  const missing = missingModules(required, built);
  if (!missing.length) return null;
  const phases = [...new Set(missing.map((m) => MODULES[m].phase))].sort((a, b) => a - b);
  return `Locked – needs ${missing.map((m) => MODULES[m].label).join(', ')} (Phase ${phases.join('/')})`;
}
