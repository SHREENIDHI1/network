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
  'router',
  'firewall',
  'ler',
  'lsr',
  'rr',
  'ucpe',
  'hybrid-agg',
  'neon-ler',
  'neon-lsr',
  'asr920',
  'asr903',
  'acx4000',
  'mx104',
  'sar8',
  'ixr-r4',
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
  /** Ethernet duplex on copper ports ("duplex auto|full|half"); absent = auto. */
  duplex: z.enum(['auto', 'full', 'half']).optional(),
  /** EtherChannel membership ("channel-group N mode on|active|passive"); L2 switchports only. */
  channelGroup: z.object({ id: z.number().int().min(1).max(64), mode: z.enum(['on', 'active', 'passive']) }).optional(),
  /** IP MTU in bytes ("ip mtu"); only checked by OSPF (MTU mismatch). */
  mtu: z.number().int().min(68).max(9216).optional(),
  /** "ip router isis": interface takes part in IS-IS. */
  isisEnabled: z.boolean().optional(),
  /** "isis metric N" (narrow metrics, default 10). */
  isisMetric: z.number().int().min(1).max(63).optional(),
  isisCircuitType: z.enum(['level-1', 'level-1-2', 'level-2-only']).optional(),
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
  /** "mpls ip": label switching + LDP link hellos on this interface. */
  mplsIp: z.boolean().optional(),
  /** "vrf forwarding NAME": interface belongs to this VRF (removes it from the global table). */
  vrf: z.string().optional(),
  /** Layer-2 interface MTU ("mtu N"); default 1500. Used as the pseudowire MTU of an xconnect. */
  l2Mtu: z.number().int().min(64).max(9216).optional(),
  /** "xconnect PEER VCID encapsulation mpls" (VPWS) or "xconnect vfi NAME" (VPLS attachment). */
  xconnect: z.union([z.object({ peer: dotted, vcId: z.number().int().min(1).max(4294967295) }), z.object({ vfi: z.string() })]).optional(),
  /** "mpls traffic-eng tunnels" on the interface: link takes part in MPLS TE. */
  teEnabled: z.boolean().optional(),
  /** "ip rsvp bandwidth [kbps]": reservable bandwidth; 'default' = 75% of the link speed (IOS default). */
  rsvpBandwidth: z.union([z.number().int().min(0).max(100_000_000), z.literal('default')]).optional(),
  /** "mpls traffic-eng backup-path TunnelN": FRR backup tunnel protecting this link. */
  teBackupPath: z.string().optional(),
});

/** "ip explicit-path name X enable": strict next hops and excluded addresses. */
const explicitPathSchema = z.object({
  entries: z.array(z.object({ kind: z.enum(['next', 'exclude']), address: dotted })).default([]),
});

/** "interface TunnelN" with "tunnel mode mpls traffic-eng". */
const teTunnelSchema = z.object({
  description: z.string().optional(),
  shutdown: z.boolean().optional(),
  unnumbered: z.string().optional(),
  mode: z.enum(['gre', 'mpls-te']).default('gre'),
  destination: dotted.optional(),
  /** "tunnel mpls traffic-eng bandwidth N" in kbit/s. */
  bandwidthKbps: z.number().int().min(0).max(100_000_000).default(0),
  pathOptions: z
    .array(z.object({ pref: z.number().int().min(1).max(1000), kind: z.enum(['explicit', 'dynamic']), name: z.string().optional() }))
    .default([]),
  autoroute: z.boolean().default(false),
  frr: z.boolean().default(false),
});

/** "l2 vfi NAME manual": VPLS forwarder with its "vpn id" and pseudowire "neighbor"s. */
const vfiSchema = z.object({
  vpnId: z.number().int().min(1).max(4294967295).optional(),
  neighbors: z.array(dotted).default([]),
});

/** "controller E1 x/y/z": logical E1 with its CEM groups and the CEM interface's xconnects. */
const e1ControllerSchema = z.object({
  shutdown: z.boolean().optional(),
  /** cem-group N unframed (SAToP, whole E1) or cem-group N timeslots a-b (CESoPSN). */
  cemGroups: z.record(z.object({ unframed: z.boolean(), timeslots: z.array(z.number().int().min(1).max(31)).default([]) })).default({}),
  /** "interface CEMx/y/z" → "cem N" → "xconnect PEER VCID encapsulation mpls". */
  xconnects: z.record(z.object({ peer: dotted, vcId: z.number().int().min(1).max(4294967295) })).default({}),
});

const ospfSchema = z.object({
  processId: z.number().int().min(1).max(65535),
  /** "mpls traffic-eng router-id IF" and "mpls traffic-eng area N": OSPF floods TE information. */
  teRouterId: z.string().optional(),
  teAreas: z.array(z.number().int().min(0)).optional(),
  /** "segment-routing mpls" under router ospf: advertise and use prefix SIDs. */
  segmentRouting: z.boolean().optional(),
  /** "fast-reroute per-prefix enable prefix-priority low" + "fast-reroute per-prefix ti-lfa". */
  frrPerPrefix: z.boolean().optional(),
  tiLfa: z.boolean().optional(),
  routerId: dotted.optional(),
  networks: z.array(z.object({ address: dotted, wildcard: dotted, area: z.number().int().min(0) })).default([]),
  passive: z.array(z.string()).default([]),
  defaultOriginate: z.enum(['off', 'on', 'always']).default('off'),
  redistributeStatic: z.boolean().default(false),
  /** auto-cost reference-bandwidth, Mbit/s (IOS default 100). */
  referenceBandwidth: z.number().int().min(1).max(4294967).default(100),
  /** "mpls ldp sync": max OSPF cost on links whose LDP session is not up. */
  ldpSync: z.boolean().default(false),
  /** "mpls ldp autoconfig": "mpls ip" on every OSPF interface. */
  ldpAutoconfig: z.boolean().default(false),
});

const mplsSchema = z.object({
  /** "mpls ldp router-id IF [force]": interface whose address is the LDP router-id. */
  ldpRouterId: z.string().optional(),
  /** "mpls ldp explicit-null": advertise label 0 instead of implicit-null (3) for own prefixes. */
  explicitNull: z.boolean().default(false),
  /** "mpls traffic-eng tunnels" (global): MPLS TE / RSVP on this router. */
  teTunnels: z.boolean().optional(),
  /** "no mpls ip propagate-ttl": hide the core from traceroute (label TTL 255). */
  propagateTtl: z.boolean().default(true),
});

const isisSchema = z.object({
  tag: z.string().optional(),
  /** Network Entity Title, e.g. 49.0001.0000.0000.0001.00 */
  net: z.string().optional(),
  isType: z.enum(['level-1', 'level-1-2', 'level-2-only']).default('level-1-2'),
  passive: z.array(z.string()).default([]),
});

const ripSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).default(1),
  /** Classful networks from "network A.B.C.D". */
  networks: z.array(dotted).default([]),
  passive: z.array(z.string()).default([]),
  autoSummary: z.boolean().default(false),
  defaultOriginate: z.boolean().default(false),
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
  /** "set mpls experimental imposition N": EXP on labels pushed at this PE. */
  setExpImposition: z.number().int().min(0).max(7).optional(),
  /** "set mpls experimental topmost N": rewrite the EXP of the top label. */
  setExpTopmost: z.number().int().min(0).max(7).optional(),
});

const qosSchema = z.object({
  classMaps: z
    .record(
      z.object({
        matchAll: z.boolean().default(false),
        dscp: z.array(z.number().int().min(0).max(63)).default([]),
        exp: z.array(z.number().int().min(0).max(7)).optional(),
      }),
    )
    .default({}),
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
  /** "ip route vrf NAME …": route in a VRF table instead of the global table. */
  vrf: z.string().optional(),
});

/** "vrf definition NAME" / "ip vrf NAME". */
const vrfSchema = z.object({
  /** Route distinguisher, "ASN:nn" or "A.B.C.D:nn". */
  rd: z.string().optional(),
  importRts: z.array(z.string()).default([]),
  exportRts: z.array(z.string()).default([]),
  description: z.string().optional(),
});

const bgpNeighborSchema = z.object({
  remoteAs: z.number().int().min(1).max(4294967295),
  updateSource: z.string().optional(),
  description: z.string().optional(),
  ebgpMultihop: z.number().int().min(1).max(255).optional(),
  shutdown: z.boolean().optional(),
  /** IPv4 unicast activation; undefined = "bgp default ipv4-unicast" decides. */
  ipv4: z.boolean().optional(),
  /** "address-family vpnv4 / neighbor X activate". */
  vpnv4: z.boolean().optional(),
  nextHopSelf: z.boolean().optional(),
  /** "neighbor X route-reflector-client" in address-family ipv4 / vpnv4. */
  rrClient: z.boolean().optional(),
  rrClientVpnv4: z.boolean().optional(),
});

const bgpNetworkSchema = z.object({ prefix: dotted, mask: dotted });

/** "address-family ipv4 vrf NAME" under router bgp: PE–CE routing and what the VRF exports. */
const bgpVrfSchema = z.object({
  neighbors: z.record(z.object({ remoteAs: z.number().int().min(1).max(4294967295), activate: z.boolean().default(true) })).default({}),
  networks: z.array(bgpNetworkSchema).default([]),
  redistributeConnected: z.boolean().default(false),
  redistributeStatic: z.boolean().default(false),
});

const bgpSchema = z.object({
  asn: z.number().int().min(1).max(4294967295),
  routerId: dotted.optional(),
  /** "no bgp default ipv4-unicast". */
  noDefaultIpv4: z.boolean().default(false),
  neighbors: z.record(bgpNeighborSchema).default({}),
  networks: z.array(bgpNetworkSchema).default([]),
  redistributeConnected: z.boolean().default(false),
  redistributeStatic: z.boolean().default(false),
  vrfs: z.record(bgpVrfSchema).default({}),
});

const vtySchema = z.object({
  /** "transport input ssh|telnet|all|none" (IOS classic default: all). */
  transport: z.enum(['all', 'ssh', 'telnet', 'none']).default('all'),
  /** "login" (line password), "login local" (usernames) or "no login". IOS default: login. */
  login: z.enum(['line', 'local', 'none']).default('line'),
  passwordSet: z.boolean().default(false),
  /** Standard ACL applied with "access-class N in". */
  accessClass: z.string().optional(),
});

const mgmtSchema = z.object({
  domainName: z.string().optional(),
  domainLookup: z.boolean().default(true),
  /** "ip name-server" (routers) / DNS server field (hosts). */
  nameServers: z.array(dotted).default([]),
  /** "ip host NAME A.B.C.D" static table; on a DNS server device these are its records. */
  hosts: z.record(dotted).default({}),
  /** "ip dns server": router answers DNS queries from its host table. */
  dnsServer: z.boolean().default(false),
  rsaModulus: z.number().int().min(360).max(4096).optional(),
  sshVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  users: z.record(z.object({ privilege: z.number().int().min(0).max(15).default(1) })).default({}),
  vty: vtySchema.default({}),
  ntpServers: z.array(dotted).default([]),
  /** "ntp master N": authoritative clock with this stratum. */
  ntpMaster: z.number().int().min(1).max(15).optional(),
  loggingHosts: z.array(dotted).default([]),
  snmpCommunities: z.record(z.enum(['ro', 'rw'])).default({}),
  snmpTrapHosts: z.array(z.object({ ip: dotted, community: z.string() })).default([]),
  snmpTraps: z.boolean().default(false),
});

const baseConfigSchema = z.object({
  interfaces: z.record(interfaceSchema).default({}),
  vlans: z.record(z.object({ name: z.string().max(32) })).default({}),
  ipRouting: z.boolean().default(false),
  staticRoutes: z.array(staticRouteSchema).default([]),
  defaultGateway: dotted.optional(),
  stpPriority: z.number().int().min(0).max(61440).default(32768),
  ospf: ospfSchema.optional(),
  isis: isisSchema.optional(),
  rip: ripSchema.optional(),
  mgmt: mgmtSchema.default({}),
  mpls: mplsSchema.default({}),
  vrfs: z.record(vrfSchema).default({}),
  bgp: bgpSchema.optional(),
  vfis: z.record(vfiSchema).default({}),
  e1Controllers: z.record(e1ControllerSchema).default({}),
  explicitPaths: z.record(explicitPathSchema).default({}),
  /** "segment-routing mpls": SRGB and connected-prefix-sid-map entries. */
  sr: z
    .object({
      enabled: z.boolean().default(false),
      srgbBase: z.number().int().min(16).max(1048575).default(16000),
      srgbEnd: z.number().int().min(16).max(1048575).default(23999),
      prefixSids: z.array(z.object({ prefix: z.string(), index: z.number().int().min(0).max(1048575) })).default([]),
    })
    .optional(),
  /** NMS server settings (device kind "nms"): SNMP polling community and monitored railway services. */
  nms: z
    .object({
      pollCommunity: z.string().optional(),
      services: z
        .array(
          z.object({
            name: z.string(),
            kind: z.enum(['path', 'pw']),
            /** path: source device name and destination address. */
            src: z.string().optional(),
            dst: dotted.optional(),
            /** pw: the two PEs (device names) and the VC ID. */
            a: z.string().optional(),
            b: z.string().optional(),
            vcId: z.number().int().optional(),
            /** Safety-related circuit: its outage is a critical alarm. */
            safety: z.boolean().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
  teTunnels: z.record(teTunnelSchema).default({}),
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
export type IsisConfig = z.infer<typeof isisSchema>;
export type RipConfig = z.infer<typeof ripSchema>;
export type MgmtConfig = z.infer<typeof mgmtSchema>;
export type MplsConfig = z.infer<typeof mplsSchema>;
export type VrfConfig = z.infer<typeof vrfSchema>;
export type BgpConfig = z.infer<typeof bgpSchema>;
export type BgpNeighborConfig = z.infer<typeof bgpNeighborSchema>;
export type BgpVrfConfig = z.infer<typeof bgpVrfSchema>;
export type VfiConfig = z.infer<typeof vfiSchema>;
export type E1ControllerConfig = z.infer<typeof e1ControllerSchema>;
export type TeTunnelConfig = z.infer<typeof teTunnelSchema>;
export type NmsConfig = NonNullable<NetConfig['nms']>;
export type NmsServiceConfig = NmsConfig['services'][number];
export type ExplicitPathConfig = z.infer<typeof explicitPathSchema>;
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
    mgmt: mgmtSchema.parse({}),
    mpls: mplsSchema.parse({}),
    vrfs: {},
    vfis: {},
    e1Controllers: {},
    explicitPaths: {},
    teTunnels: {},
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
  ['Po', 'Port-channel'],
  ['Lo', 'Loopback'],
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
  const lo = /^lo(?:o(?:p(?:b(?:a(?:c(?:k)?)?)?)?)?)?(\d+)$/i.exec(t);
  if (lo) return `Loopback${Number(lo[1])}`;
  const po = /^po(?:r(?:t(?:-?c(?:h(?:a(?:n(?:n(?:e(?:l)?)?)?)?)?)?)?)?)?(\d+)$/i.exec(t);
  if (po) return `Po${Number(po[1])}`;
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

/** "Loopback0" → 0 for loopback interface names, else null. */
export function loopbackId(name: string): number | null {
  const m = /^Loopback(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** "Po3" → 3 for port-channel interface names, else null. */
export function portChannelId(name: string): number | null {
  const m = /^Po(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
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
