import type { DeviceCategory, DeviceKind, Port, PortKind, StmLevel, VfRole } from './types';

/**
 * Device palette catalog. Each template describes how a new device of that
 * kind looks (icon key, label) and which physical ports it ships with.
 * Port names follow common vendor conventions so the CLI in later phases
 * can refer to them (e.g. "Gi0/1", "E1-1", "STM1-E").
 */

export type IconKey =
  | 'mux'
  | 'sdh'
  | 'cwdm'
  | 'phone'
  | 'block'
  | 'bpac'
  | 'logger'
  | 'gate'
  | 'exchange'
  | 'pc'
  | 'ticket'
  | 'freight'
  | 'ipphone'
  | 'camera'
  | 'nvr'
  | 'wifi'
  | 'switch'
  | 'l3switch'
  | 'router'
  | 'firewall'
  | 'nms'
  | 'server'
  | 'ler'
  | 'lsr'
  | 'rr'
  | 'hybrid'
  | 'ucpe';

export interface DeviceTemplate {
  kind: DeviceKind;
  label: string;
  category: DeviceCategory;
  /** Prefix used for auto-generated names, e.g. "PDMUX" -> "PDMUX-1". */
  prefix: string;
  icon: IconKey;
  description: string;
  buildPorts: () => Port[];
}

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  legacy: 'Legacy (PDH / SDH / VF)',
  lan: 'LAN / IP',
  mpls: 'IP-MPLS',
};

// ---------------------------------------------------------------------------
// Port builders
// ---------------------------------------------------------------------------

interface PortOpts {
  speedsGbps?: number[];
  stmLevel?: StmLevel;
  vfRole?: VfRole;
  lambdaNm?: number;
}

function port(name: string, kind: PortKind, opts: PortOpts = {}): Port {
  return { id: name, name, kind, ...opts };
}

/** Builds `count` ports named `${prefix}${start..}`. */
function range(prefix: string, start: number, count: number, kind: PortKind, opts: PortOpts = {}): Port[] {
  return Array.from({ length: count }, (_, i) => port(`${prefix}${start + i}`, kind, opts));
}

const GE = { speedsGbps: [1] };
const SFP_1G = { speedsGbps: [1] };
const SFP_1_10G = { speedsGbps: [1, 10] };
const SFP_10_25G = { speedsGbps: [10, 25] };
const SFP_100G = { speedsGbps: [100] };

/** ITU-T G.694.2 CWDM grid, upper 8 channels commonly used on G.652 fibre. */
export const CWDM_CHANNELS_NM = [1471, 1491, 1511, 1531, 1551, 1571, 1591, 1611];

function admPorts(level: StmLevel): Port[] {
  const agg = `STM${level}`;
  const ports: Port[] = [
    port(`${agg}-E`, 'stm', { stmLevel: level }),
    port(`${agg}-W`, 'stm', { stmLevel: level }),
  ];
  if (level === 4) ports.push(...range('STM1-T', 1, 4, 'stm', { stmLevel: 1 }));
  if (level === 16) {
    ports.push(...range('STM4-T', 1, 2, 'stm', { stmLevel: 4 }));
    ports.push(...range('STM1-T', 1, 4, 'stm', { stmLevel: 1 }));
  }
  // 21 E1 on STM-1 tributary card, 63 E1 on larger ADMs.
  ports.push(...range('E1-', 1, level === 1 ? 21 : 63, 'e1'));
  ports.push(...range('FE-', 1, 4, 'rj45', GE));
  return ports;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  // ----------------------------- Legacy ------------------------------------
  {
    kind: 'pdmux',
    label: 'PD-Mux',
    category: 'legacy',
    prefix: 'PDMUX',
    icon: 'mux',
    description:
      'Primary digital multiplexer: 30 voice/data channels on one E1 (G.704). VF cards FXS/FXO/E&M/2W/4W; omnibus control channel.',
    buildPorts: () => [
      ...range('E1-', 1, 2, 'e1'),
      ...range('FXS-', 1, 4, 'vf2w', { vfRole: 'FXS' }),
      ...range('FXO-', 1, 2, 'vf2w', { vfRole: 'FXO' }),
      ...range('2W-', 1, 4, 'vf2w', { vfRole: '2W' }),
      ...range('4W-', 1, 4, 'vf4w', { vfRole: '4W' }),
      ...range('EM-', 1, 2, 'vf4w', { vfRole: 'E&M' }),
      port('MGMT', 'rj45', GE),
    ],
  },
  {
    kind: 'adm-stm1',
    label: 'STM-1 ADM',
    category: 'legacy',
    prefix: 'ADM1',
    icon: 'sdh',
    description: 'SDH add-drop multiplexer, 155.52 Mbit/s line (G.707). East/West aggregates, 21 x E1 tributaries.',
    buildPorts: () => admPorts(1),
  },
  {
    kind: 'adm-stm4',
    label: 'STM-4 ADM',
    category: 'legacy',
    prefix: 'ADM4',
    icon: 'sdh',
    description: 'SDH ADM, 622.08 Mbit/s line. STM-1 optical tributaries + 63 x E1.',
    buildPorts: () => admPorts(4),
  },
  {
    kind: 'adm-stm16',
    label: 'STM-16 ADM',
    category: 'legacy',
    prefix: 'ADM16',
    icon: 'sdh',
    description: 'SDH ADM, 2488.32 Mbit/s line. STM-4/STM-1 tributaries + 63 x E1.',
    buildPorts: () => admPorts(16),
  },
  {
    kind: 'cwdm-mux',
    label: 'CWDM Mux/Demux',
    category: 'legacy',
    prefix: 'CWDM',
    icon: 'cwdm',
    description:
      'Passive CWDM (G.694.2) 8-channel mux/demux. Lets SDH and IP-MPLS share the same fibre (migration Option 1).',
    buildPorts: () => [
      port('LINE', 'cwdm-line'),
      ...CWDM_CHANNELS_NM.map((nm) => port(`CH${nm}`, 'cwdm-ch', { lambdaNm: nm })),
    ],
  },
  {
    kind: 'control-phone',
    label: 'Control Phone',
    category: 'legacy',
    prefix: 'CTRLPH',
    icon: 'phone',
    description: 'Section Control / TPC / TLC way-station phone (DTMF selective calling on omnibus channel).',
    buildPorts: () => [port('LINE', 'vf2w', { vfRole: 'TERM' })],
  },
  {
    kind: 'block-instrument',
    label: 'Block Instrument',
    category: 'legacy',
    prefix: 'BLOCK',
    icon: 'block',
    description: 'Block instrument line circuit between adjacent stations (safety-critical).',
    buildPorts: () => [port('LINE', 'vf2w', { vfRole: 'TERM' })],
  },
  {
    kind: 'bpac',
    label: 'BPAC Unit',
    category: 'legacy',
    prefix: 'BPAC',
    icon: 'bpac',
    description: 'Block Proving by Axle Counter: evaluator communicates over 4-wire VF modem channels.',
    buildPorts: () => [port('MODEM-1', 'vf4w', { vfRole: 'TERM' }), port('MODEM-2', 'vf4w', { vfRole: 'TERM' })],
  },
  {
    kind: 'data-logger',
    label: 'Data Logger',
    category: 'legacy',
    prefix: 'DL',
    icon: 'logger',
    description: 'Station data logger: reports to central server over 4W VF modem or Ethernet.',
    buildPorts: () => [port('MODEM', 'vf4w', { vfRole: 'TERM' }), port('LAN', 'rj45', GE)],
  },
  {
    kind: 'lc-gate-phone',
    label: 'LC Gate Phone',
    category: 'legacy',
    prefix: 'LCPH',
    icon: 'gate',
    description: 'Level-crossing gate telephone to the station master.',
    buildPorts: () => [port('LINE', 'vf2w', { vfRole: 'TERM' })],
  },
  {
    kind: 'exchange',
    label: 'Exchange (ISDN/IP-PBX)',
    category: 'legacy',
    prefix: 'EXCH',
    icon: 'exchange',
    description: 'Railway auto exchange: E1/PRI trunks, E&M trunks, FXS subscriber lines, IP-PBX LAN.',
    buildPorts: () => [
      ...range('E1-', 1, 4, 'e1'),
      ...range('SUB-', 1, 8, 'vf2w', { vfRole: 'FXS' }),
      ...range('EM-', 1, 2, 'vf4w', { vfRole: 'E&M' }),
      port('LAN', 'rj45', GE),
    ],
  },

  // ----------------------------- LAN / IP ----------------------------------
  {
    kind: 'pc',
    label: 'PC',
    category: 'lan',
    prefix: 'PC',
    icon: 'pc',
    description: 'General-purpose host (Railnet user, SM office PC).',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },
  {
    kind: 'uts-prs',
    label: 'UTS/PRS Terminal',
    category: 'lan',
    prefix: 'UTS',
    icon: 'ticket',
    description: 'Unreserved / Passenger Reservation System booking terminal.',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },
  {
    kind: 'fois',
    label: 'FOIS Terminal',
    category: 'lan',
    prefix: 'FOIS',
    icon: 'freight',
    description: 'Freight Operations Information System terminal.',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },
  {
    kind: 'ip-phone',
    label: 'IP Phone',
    category: 'lan',
    prefix: 'IPPH',
    icon: 'ipphone',
    description: 'VoIP phone with PC pass-through port (voice VLAN capable).',
    buildPorts: () => [port('LAN', 'rj45', GE), port('PC', 'rj45', GE)],
  },
  {
    kind: 'cctv',
    label: 'CCTV Camera',
    category: 'lan',
    prefix: 'CAM',
    icon: 'camera',
    description: 'IP camera (video surveillance at stations).',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },
  {
    kind: 'nvr',
    label: 'NVR',
    category: 'lan',
    prefix: 'NVR',
    icon: 'nvr',
    description: 'Network video recorder for CCTV streams.',
    buildPorts: () => [port('eth0', 'rj45', GE), port('eth1', 'rj45', GE)],
  },
  {
    kind: 'wifi-ap',
    label: 'Wi-Fi AP',
    category: 'lan',
    prefix: 'AP',
    icon: 'wifi',
    description: 'Station Wi-Fi access point (wired uplink only in this simulator).',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },
  {
    kind: 'l2-switch',
    label: 'L2 Switch',
    category: 'lan',
    prefix: 'SW',
    icon: 'switch',
    description: '24 x GE copper + 2 x SFP uplinks. VLANs, trunks, RSTP.',
    buildPorts: () => [...range('Gi0/', 1, 24, 'rj45', GE), ...range('Gi0/', 25, 2, 'sfp', SFP_1G)],
  },
  {
    kind: 'l3-switch',
    label: 'L3 Switch',
    category: 'lan',
    prefix: 'L3SW',
    icon: 'l3switch',
    description: '24 x GE copper + 4 x 1/10G SFP. SVIs, inter-VLAN routing, OSPF.',
    buildPorts: () => [...range('Gi1/0/', 1, 24, 'rj45', GE), ...range('Te1/1/', 1, 4, 'sfp', SFP_1_10G)],
  },
  {
    kind: 'router',
    label: 'Router',
    category: 'lan',
    prefix: 'R',
    icon: 'router',
    description: 'Branch router: 4 x GE, 2 x SFP, 2 x E1 WAN (channelised E1 / leased line).',
    buildPorts: () => [
      ...range('Gi0/', 0, 4, 'rj45', GE),
      ...range('Gi0/', 4, 2, 'sfp', SFP_1G),
      ...range('E1-0/', 0, 2, 'e1'),
    ],
  },
  {
    kind: 'firewall',
    label: 'Firewall',
    category: 'lan',
    prefix: 'FW',
    icon: 'firewall',
    description: 'Stateful firewall between Railnet / Internet / application zones.',
    buildPorts: () => [
      port('outside', 'rj45', GE),
      port('inside', 'rj45', GE),
      port('dmz', 'rj45', GE),
      port('mgmt', 'rj45', GE),
    ],
  },
  {
    kind: 'nms',
    label: 'NMS Server',
    category: 'lan',
    prefix: 'NMS',
    icon: 'nms',
    description: 'Network management server (SNMP, Syslog, NTP collector).',
    buildPorts: () => [port('eth0', 'rj45', GE), port('eth1', 'rj45', GE)],
  },
  {
    kind: 'dns-dhcp',
    label: 'DNS/DHCP/NTP Server',
    category: 'lan',
    prefix: 'SRV',
    icon: 'server',
    description: 'DNS, DHCP and NTP services for station LANs.',
    buildPorts: () => [port('eth0', 'rj45', GE)],
  },

  // ----------------------------- MPLS --------------------------------------
  {
    kind: 'ler',
    label: 'LER / PE Router',
    category: 'mpls',
    prefix: 'LER',
    icon: 'ler',
    description: 'Label Edge Router at stations: customer-facing VRFs, pseudowires, label push/pop.',
    buildPorts: () => [...range('Gi0/0/', 0, 4, 'rj45', GE), ...range('Te0/1/', 0, 4, 'sfp', SFP_1_10G)],
  },
  {
    kind: 'lsr',
    label: 'LSR / P Router',
    category: 'mpls',
    prefix: 'LSR',
    icon: 'lsr',
    description: 'Label Switch Router at junctions / core: label swap only, no customer VRFs.',
    buildPorts: () => [...range('Te0/0/', 0, 8, 'sfp', SFP_10_25G), ...range('Hu0/1/', 0, 2, 'sfp', SFP_100G)],
  },
  {
    kind: 'rr',
    label: 'Route Reflector',
    category: 'mpls',
    prefix: 'RR',
    icon: 'rr',
    description: 'MP-BGP VPNv4 route reflector (control plane only).',
    buildPorts: () => [...range('Gi0/', 0, 2, 'rj45', GE), ...range('Te0/1/', 0, 2, 'sfp', SFP_1_10G)],
  },
  {
    kind: 'hybrid-agg',
    label: 'Hybrid Agg (MPLS+PD-Mux)',
    category: 'mpls',
    prefix: 'HAGG',
    icon: 'hybrid',
    description:
      'Hybrid aggregation box (TANSY-like): MPLS router with built-in E1 and VF cards for legacy circuits (CESoPSN/SAToP).',
    buildPorts: () => [
      ...range('Te0/', 0, 4, 'sfp', SFP_1_10G),
      ...range('Gi1/', 0, 4, 'rj45', GE),
      ...range('E1-', 1, 8, 'e1'),
      ...range('FXS-', 1, 4, 'vf2w', { vfRole: 'FXS' }),
      ...range('2W-', 1, 2, 'vf2w', { vfRole: '2W' }),
      ...range('4W-', 1, 2, 'vf4w', { vfRole: '4W' }),
      ...range('EM-', 1, 2, 'vf4w', { vfRole: 'E&M' }),
    ],
  },
  {
    kind: 'ucpe',
    label: 'uCPE',
    category: 'mpls',
    prefix: 'UCPE',
    icon: 'ucpe',
    description: 'Universal CPE: small edge box with virtual router/firewall functions.',
    buildPorts: () => [...range('Gi0/', 0, 4, 'rj45', GE), ...range('Gi0/', 4, 2, 'sfp', SFP_1_10G)],
  },
];

const TEMPLATE_BY_KIND = new Map<DeviceKind, DeviceTemplate>(DEVICE_TEMPLATES.map((t) => [t.kind, t]));

export function getTemplate(kind: DeviceKind): DeviceTemplate {
  const t = TEMPLATE_BY_KIND.get(kind);
  if (!t) throw new Error(`Unknown device kind: ${kind}`);
  return t;
}

export function isDeviceKind(value: string): value is DeviceKind {
  return TEMPLATE_BY_KIND.has(value as DeviceKind);
}
