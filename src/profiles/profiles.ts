import type { DeviceProfile } from './types';

/**
 * IP-MPLS router profiles.
 *
 * NEON-LER / NEON-LSR specs are taken from CAMTECH SP37A p.35 as quoted by the
 * user (the PDF itself was not available to the build). NEON's real CLI is not
 * public, so these profiles use RailMPLS Lab's generic SP CLI (IOS-XE style).
 *
 * The Cisco / Juniper / Nokia entries are listed because the CAMTECH vendor
 * table (p.34–35) names them; their specs could not be read from the table,
 * so they carry no hardware numbers and use a generic placeholder port layout.
 */

export const GENERIC_CLI_BANNER = 'CLI syntax is generic (IOS-XE style), not official vendor syntax.';
const SRC_NEON = 'CAMTECH SP37A p.35 (as provided by user; PDF not available to verify)';

const MPLS_CAPS = ['Static/OSPF routing', 'MPLS (planned)', 'LDP (planned)', 'MP-BGP / L3VPN (planned)', 'L2VPN / pseudowire (planned)', 'RSVP-TE / FRR (planned)', 'QoS (DSCP, LLQ/CBWFQ)'];

export const PROFILES: DeviceProfile[] = [
  {
    id: 'neon-ler',
    label: 'NEON-LER',
    vendor: 'Team Engineers',
    model: 'NEON (station router profile)',
    role: 'LER',
    placement: 'Every non-junction station (wayside), as Label Edge Router / PE.',
    specs: [
      { param: '10G interfaces', value: '4 × 10GbE', source: SRC_NEON },
      { param: 'E1 interfaces', value: '16/32 × E1', source: SRC_NEON },
      { param: '1G interfaces', value: '16 × 1G combo (RJ45/SFP)', source: SRC_NEON },
      { param: 'WDM', value: 'Supported (STM-1/4/16/64)', source: SRC_NEON },
      { param: 'Slots', value: '12', source: SRC_NEON },
      { param: 'Height', value: '3RU', source: SRC_NEON },
      { param: 'Power consumption', value: '150 W', source: SRC_NEON },
      { param: 'Power input', value: '48 V DC (−40 to −57 V), dual 1+1', source: SRC_NEON },
      { param: 'Operating temperature', value: '−15 to 60 °C', source: SRC_NEON },
      { param: 'Handbook minimum for a station router', value: '2 × 10GbE, 12 × GbE, 32 E1, dual control card, redundant power', source: 'CAMTECH SP37A (as provided by user)' },
    ],
    ports: [
      { prefix: 'Te0/0/', count: 4, kind: 'sfp', speedsGbps: [1, 10], purpose: 'Ring/uplink to neighbouring POPs over OFC' },
      { prefix: 'Gi0/1/', count: 16, kind: 'combo', speedsGbps: [1], purpose: 'Station LAN / CE devices (copper or SFP)' },
      { prefix: 'E1-0/2/', count: 16, kind: 'e1', purpose: 'Legacy E1 circuits for TDM pseudowires (enabled in the TDM-PW phase)' },
    ],
    capabilities: MPLS_CAPS,
    cliDialect: 'generic-sp',
    cliBanner: 'CLI syntax is generic, not official NEON syntax.',
    specsVerified: true,
    genericPortLayout: false,
    notes: ['Interface names follow the generic SP CLI convention (slot/sub-slot/port), not NEON\'s own naming.', 'Only 16 of the 16/32 E1 options are modelled.'],
  },
  {
    id: 'neon-lsr',
    label: 'NEON-LSR',
    vendor: 'Team Engineers',
    model: 'NEON (junction router profile)',
    role: 'LSR',
    placement: 'Junction stations, as Label Switching Router / P (and aggregation).',
    specs: [
      { param: '10G interfaces', value: '28 × 10GbE', source: SRC_NEON },
      { param: '25G interfaces', value: '8 × 25GbE', source: SRC_NEON },
      { param: '100G interfaces', value: '1 × 100GbE', source: SRC_NEON },
      { param: 'E1 interfaces', value: '16/32 × E1', source: SRC_NEON },
      { param: '1G interfaces', value: '48 × 1G combo (RJ45/SFP)', source: SRC_NEON },
      { param: 'WDM', value: 'Supported, 8 paths each side', source: SRC_NEON },
      { param: 'Slots', value: '12', source: SRC_NEON },
      { param: 'Height', value: '3RU', source: SRC_NEON },
      { param: 'Power consumption', value: '300 W', source: SRC_NEON },
      { param: 'Switching capacity', value: '300 Gbps full duplex', source: SRC_NEON },
      { param: 'Handbook minimum for a junction router', value: '12 × 10GbE, 24 × GbE, 300 Gbps+', source: 'CAMTECH SP37A (as provided by user)' },
    ],
    ports: [
      { prefix: 'Te0/0/', count: 28, kind: 'sfp', speedsGbps: [1, 10], purpose: 'Core links to other junctions / stations' },
      { prefix: 'Twe0/1/', count: 8, kind: 'sfp', speedsGbps: [10, 25], purpose: 'High-capacity core links' },
      { prefix: 'Hu0/2/', count: 1, kind: 'sfp', speedsGbps: [100], purpose: 'Backbone / divisional HQ uplink' },
      { prefix: 'Gi0/3/', count: 48, kind: 'combo', speedsGbps: [1], purpose: 'Junction station LAN / CE devices' },
      { prefix: 'E1-0/4/', count: 16, kind: 'e1', purpose: 'Legacy E1 circuits for TDM pseudowires (enabled in the TDM-PW phase)' },
    ],
    capabilities: MPLS_CAPS,
    cliDialect: 'generic-sp',
    cliBanner: 'CLI syntax is generic, not official NEON syntax.',
    specsVerified: true,
    genericPortLayout: false,
    notes: ['Interface names follow the generic SP CLI convention, not NEON\'s own naming.', 'Power input and temperature were not quoted for the LSR; not shown.'],
  },
  ...(
    [
      ['asr920', 'Cisco ASR 920', 'Cisco', 'ASR 920', 'LER'],
      ['asr903', 'Cisco ASR 903', 'Cisco', 'ASR 903', 'LSR'],
      ['acx4000', 'Juniper ACX4000', 'Juniper', 'ACX4000', 'LER'],
      ['mx104', 'Juniper MX104', 'Juniper', 'MX104', 'LSR'],
      ['sar8', 'Nokia SAR 8', 'Nokia', 'SAR 8', 'LER'],
      ['ixr-r4', 'Nokia IXR R4', 'Nokia', 'IXR R4', 'LSR'],
    ] as const
  ).map(([id, label, vendor, model, role]): DeviceProfile => ({
    id,
    label,
    vendor,
    model,
    role,
    placement: role === 'LER' ? 'Station router option (CAMTECH vendor table)' : 'Junction router option (CAMTECH vendor table)',
    specs: [{ param: 'Hardware specification', value: 'Not available — the CAMTECH vendor table (p.34–35) could not be read for this build', source: 'unverified' }],
    ports:
      role === 'LER'
        ? [
            { prefix: 'Te0/0/', count: 4, kind: 'sfp', speedsGbps: [1, 10], purpose: 'Generic placeholder: uplinks' },
            { prefix: 'Gi0/1/', count: 8, kind: 'combo', speedsGbps: [1], purpose: 'Generic placeholder: LAN' },
          ]
        : [
            { prefix: 'Te0/0/', count: 12, kind: 'sfp', speedsGbps: [1, 10], purpose: 'Generic placeholder: core' },
            { prefix: 'Gi0/1/', count: 24, kind: 'combo', speedsGbps: [1], purpose: 'Generic placeholder: LAN' },
          ],
    capabilities: MPLS_CAPS,
    cliDialect: 'generic-sp',
    cliBanner: GENERIC_CLI_BANNER,
    specsVerified: false,
    genericPortLayout: true,
    notes: ['Port layout is a generic placeholder sized to the handbook minimums, not the vendor\'s real chassis.', 'Vendor CLI syntax is not emulated.'],
  })),
];

export function getProfile(id: string): DeviceProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}
