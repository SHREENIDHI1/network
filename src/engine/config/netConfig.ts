import { z } from 'zod';
import type { Device, DeviceKind, Port } from '../../model/types';

/**
 * Per-device network configuration ("running-config"), stored in
 * device.config.net so it is saved and loaded with the topology file.
 *
 * Interface keys:
 *   physical port id      e.g. "Gi0/1", "Te0/1/0", "eth0"
 *   router subinterface   "<port>.<n>"  e.g. "Gi0/0.10"
 *   switch virtual iface  "Vlan<n>"     e.g. "Vlan10"
 */

export type DeviceRole = 'host' | 'switch' | 'l3switch' | 'router' | 'hub' | 'opaque';

const HOST_KINDS: DeviceKind[] = ['pc', 'uts-prs', 'fois', 'ip-phone', 'cctv', 'nvr', 'wifi-ap', 'nms', 'dns-dhcp', 'laptop', 'server'];
const ROUTER_KINDS: DeviceKind[] = [
  'router', 'firewall', 'ler', 'lsr', 'rr', 'ucpe', 'hybrid-agg',
  'neon-ler', 'neon-lsr', 'asr920', 'asr903', 'acx4000', 'mx104', 'sar8', 'ixr-r4',
];

export function roleOf(kind: DeviceKind): DeviceRole {
  if (kind === 'hub') return 'hub';
  if (HOST_KINDS.includes(kind)) return 'host';
  if (kind === 'l2-switch') return 'switch';
  if (kind === 'l3-switch') return 'l3switch';
  if (ROUTER_KINDS.includes(kind)) return 'router';
  return 'opaque'; // legacy TDM equipment: no packet forwarding
}

export const isBridgeRole = (r: DeviceRole) => r === 'switch' || r === 'l3switch';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const vlanId = z.number().int().min(1).max(4094);
const dotted = z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/);

const portSecuritySchema = z.object({
  enabled: z.boolean(),
  maximum: z.number().int().min(1).max(8192),
  violation: z.enum(['shutdown', 'restrict', 'protect']),
});

const fhrpSchema = z.object({
  protocol: z.enum(['hsrp', 'vrrp']),
  group: z.number().int().min(0).max(255),
  ip: dotted.optional(),
  priority: z.number().int().min(1).max(255).optional(),
  preempt: z.boolean().optional(),
  track: z.array(z.object({ iface: z.string(), decrement: z.number().int().min(1).max(255) })).default([]),
});

const interfaceSchema = z.object({
  shutdown: z.boolean().optional(),
  description: z.string().max(240).optional(),
  /** Switch ports only: false = routed port ("no switchport", L3 switch). */
  switchport: z.boolean().optional(),
  mode: z.enum(['access', 'trunk']).optional(),
  accessVlan: vlanId.optional(),
  trunkAllowed: z.union([z.literal('all'), z.array(vlanId)]).optional(),
  nativeVlan: vlanId.optional(),
  ip: z.object({ address: dotted, mask: dotted }).optional(),
  /** Subinterfaces: 802.1Q VLAN; native = send/receive untagged. */
  encapsulation: z.object({ vlan: vlanId, native: z.boolean() }).optional(),
  portSecurity: portSecuritySchema.optional(),
  /** Forced Ethernet speed in Mbit/s ("speed 10|100|1000|10000"); absent = auto (link speed). */
  speedMbps: z.number().int().positive().optional(),
  /** IP MTU in bytes ("ip mtu"); only checked by OSPF (MTU mismatch). */
  mtu: z.number().int().min(68).max(9216).optional(),
  ospfCost: z.number().int().min(1).max(65535).optional(),
  ospfHello: z.number().int().min(1).max(65535).optional(),
  ospfDead: z.number().int().min(1).max(65535).optional(),
  ospfPriority: z.number().int().min(0).max(255).optional(),
  natRole: z.enum(['inside', 'outside']).optional(),
  aclIn: z.string().optional(),
  aclOut: z.string().optional(),
  /** DHCP relay targets ("ip helper-address"). */
  helpers: z.array(dotted).optional(),
  /** Host NIC obtains its address by DHCP. */
  dhcpClient: z.boolean().optional(),
  fhrp: z.array(fhrpSchema).optional(),
  servicePolicyIn: z.string().optional(),
  servicePolicyOut: z.string().optional(),
});

const ospfSchema = z.object({
  processId: z.number().int().min(1).max(65535),
  routerId: dotted.optional(),
  networks: z.array(z.object({ address: dotted, wildcard: dotted, area: z.number().int().min(0) })).default([]),
  passive: z.array(z.string()).default([]),
  defaultOriginate: z.enum(['off', 'on', 'always']).default('off'),
  redistributeStatic: z.boolean().default(false),
  /** auto-cost reference-bandwidth, Mbit/s (IOS default 100). */
  referenceBandwidth: z.number().int().min(1).max(4294967).default(100),
});

const aclEntrySchema = z.object({
  action: z.enum(['permit', 'deny', 'remark']),
  protocol: z.enum(['ip', 'icmp', 'udp', 'tcp']).default('ip'),
  src: z.object({ address: dotted, wildcard: dotted }).optional(),
  dst: z.object({ address: dotted, wildcard: dotted }).optional(),
  dstPort: z.number().int().min(0).max(65535).optional(),
  icmpType: z.enum(['echo', 'echo-reply', 'unreachable', 'time-exceeded']).optional(),
  text: z.string().max(100).optional(),
});

const aclSchema = z.object({ kind: z.enum(['standard', 'extended']), entries: z.array(aclEntrySchema).default([]) });

const natSchema = z.object({
  statics: z.array(z.object({ local: dotted, global: dotted })).default([]),
  /** "ip nat inside source list ACL interface IF overload" */
  overload: z.array(z.object({ acl: z.string(), iface: z.string() })).default([]),
});

const dhcpPoolSchema = z.object({
  network: dotted.optional(),
  mask: dotted.optional(),
  defaultRouter: dotted.optional(),
  dnsServer: dotted.optional(),
  leaseDays: z.number().min(0).max(365).default(1),
});

const dhcpSchema = z.object({
  excluded: z.array(z.object({ from: dotted, to: dotted })).default([]),
  pools: z.record(dhcpPoolSchema).default({}),
});

const qosClassSchema = z.object({
  name: z.string(),
  priorityPercent: z.number().min(1).max(100).optional(),
  bandwidthPercent: z.number().min(1).max(100).optional(),
  setDscp: z.number().int().min(0).max(63).optional(),
});

const qosSchema = z.object({
  classMaps: z.record(z.object({ matchAll: z.boolean().default(false), dscp: z.array(z.number().int().min(0).max(63)).default([]) })).default({}),
  policyMaps: z.record(z.object({ classes: z.array(qosClassSchema).default([]) })).default({}),
});

const trafficSchema = z.object({
  id: z.string(),
  dst: dotted,
  app: z.string(),
  dscp: z.number().int().min(0).max(63),
  rateMbps: z.number().positive().max(100000),
});

const staticRouteSchema = z.object({
  prefix: dotted,
  mask: dotted,
  nextHop: dotted.optional(),
  exitInterface: z.string().optional(),
  distance: z.number().int().min(1).max(255).optional(),
});

const baseConfigSchema = z.object({
  interfaces: z.record(interfaceSchema).default({}),
  vlans: z.record(z.object({ name: z.string().max(32) })).default({}),
  ipRouting: z.boolean().default(false),
  staticRoutes: z.array(staticRouteSchema).default([]),
  defaultGateway: dotted.optional(),
  stpPriority: z.number().int().min(0).max(61440).default(32768),
  ospf: ospfSchema.optional(),
  acls: z.record(aclSchema).default({}),
  nat: natSchema.default({}),
  dhcp: dhcpSchema.default({}),
  qos: qosSchema.default({}),
  /** Application traffic this host offers (QoS analysis). */
  traffic: z.array(trafficSchema).default([]),
});

export const netConfigSchema = baseConfigSchema.extend({
  /** Saved copy from "write memory" / "copy running-config startup-config". */
  startup: baseConfigSchema.optional(),
});

export type InterfaceConfig = z.infer<typeof interfaceSchema>;
export type StaticRoute = z.infer<typeof staticRouteSchema>;
export type NetConfig = z.infer<typeof netConfigSchema>;
export type PortSecurityConfig = z.infer<typeof portSecuritySchema>;
export type OspfConfig = z.infer<typeof ospfSchema>;
export type AclConfig = z.infer<typeof aclSchema>;
export type AclEntry = z.infer<typeof aclEntrySchema>;
export type FhrpConfig = z.infer<typeof fhrpSchema>;
export type DhcpPool = z.infer<typeof dhcpPoolSchema>;
export type QosClass = z.infer<typeof qosClassSchema>;
export type TrafficFlowConfig = z.infer<typeof trafficSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultNetConfig(kind: DeviceKind): NetConfig {
  const role = roleOf(kind);
  return {
    interfaces: {},
    vlans: isBridgeRole(role) ? { '1': { name: 'default' } } : {},
    ipRouting: role === 'router',
    staticRoutes: [],
    stpPriority: 32768,
    acls: {},
    nat: { statics: [], overload: [] },
    dhcp: { excluded: [], pools: {} },
    qos: { classMaps: {}, policyMaps: {} },
    traffic: [],
  };
}

/**
 * Effective settings of a physical port, applying IOS-like defaults:
 * switch ports are "switchport mode access, vlan 1, no shutdown";
 * router ports are shut down until "no shutdown"; host NICs are up.
 */
export function effectivePort(role: DeviceRole, cfg: InterfaceConfig | undefined): Required<Pick<InterfaceConfig, 'shutdown'>> & InterfaceConfig {
  const c = cfg ?? {};
  if (isBridgeRole(role)) {
    const switchport = c.switchport ?? true;
    return {
      ...c,
      shutdown: c.shutdown ?? false,
      switchport,
      mode: switchport ? (c.mode ?? 'access') : undefined,
      accessVlan: c.accessVlan ?? 1,
      nativeVlan: c.nativeVlan ?? 1,
      trunkAllowed: c.trunkAllowed ?? 'all',
    };
  }
  if (role === 'router') return { ...c, shutdown: c.shutdown ?? true, switchport: false };
  return { ...c, shutdown: c.shutdown ?? false, switchport: false };
}

/** Reads and validates device.config.net, falling back to defaults. */
export function getNetConfig(device: Device): NetConfig {
  const raw = (device.config as { net?: unknown }).net;
  if (raw === undefined) return defaultNetConfig(device.kind);
  const parsed = netConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultNetConfig(device.kind);
}

/** Validation for file loading: returns error strings for an invalid stored config. */
export function validateStoredNetConfig(device: Device): string[] {
  const raw = (device.config as { net?: unknown }).net;
  if (raw === undefined) return [];
  const parsed = netConfigSchema.safeParse(raw);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${device.name} config.net.${i.path.join('.')}: ${i.message}`);
}

export function withNetConfig(device: Device, net: NetConfig): Device {
  return { ...device, config: { ...device.config, net } };
}

// ---------------------------------------------------------------------------
// Interface naming
// ---------------------------------------------------------------------------

const LONG_NAMES: Array<[short: string, long: string]> = [
  ['Gi', 'GigabitEthernet'],
  ['Te', 'TenGigabitEthernet'],
  ['Twe', 'TwentyFiveGigE'],
  ['Hu', 'HundredGigE'],
  ['Fa', 'FastEthernet'],
];

/** "Gi0/1" -> "GigabitEthernet0/1", "Vlan10" stays, "eth0" stays. */
export function longIfName(name: string): string {
  for (const [s, l] of LONG_NAMES) if (name.startsWith(s) && /\d/.test(name.charAt(s.length))) return l + name.slice(s.length);
  return name;
}

/**
 * Resolves what a user typed ("gi0/1", "GigabitEthernet 0/1", "g0/0.10",
 * "vlan 10", "te1/1/1") to an interface key on this device. Returns null when
 * it does not name a valid interface for the device.
 */
export function resolveIfName(typed: string, ports: Port[]): string | null {
  const t = typed.replace(/\s+/g, '');
  const vlan = /^vl(?:an?)?(\d+)$/i.exec(t);
  if (vlan) return `Vlan${Number(vlan[1])}`;
  const m = /^([a-z-]+?)(\d[\d/]*)(?:\.(\d+))?$/i.exec(t);
  for (const p of ports) {
    if (p.name.toLowerCase() === t.toLowerCase()) return p.id;
  }
  if (!m) return null;
  const [, word, nums, sub] = m;
  for (const p of ports) {
    const pm = /^([A-Za-z]+)(\d[\d/]*)$/.exec(p.name);
    if (!pm || pm[2] !== nums) continue;
    const short = pm[1];
    const long = longIfName(p.name).slice(0, -pm[2].length);
    const w = word.toLowerCase();
    if (short.toLowerCase().startsWith(w) || long.toLowerCase().startsWith(w)) return sub ? `${p.id}.${Number(sub)}` : p.id;
  }
  return null;
}

export function isSubinterface(name: string): boolean {
  return /\.\d+$/.test(name);
}

export function parentOf(name: string): string {
  return name.replace(/\.\d+$/, '');
}

export function sviVlan(name: string): number | null {
  const m = /^Vlan(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}
