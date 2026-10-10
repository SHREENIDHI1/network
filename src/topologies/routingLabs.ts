import { Sim } from '../engine/sim';
import { configure, host, setIf } from '../engine/testing/fixtures';
import { applySolution } from '../labs/framework/solution';
import type { LabSolution } from '../labs/framework/types';
import type { Topology } from '../model/types';
import { buildTopology } from './builder';

/**
 * Starting topologies for the P3 labs (A9–A15). Pre-configuration is typed
 * through the same CLI the learner uses, so a starting config can never hold
 * something the CLI could not produce. Station codes follow the Jodhpur
 * division track map; the addressing is a teaching plan, not the real
 * NWR/RailTel network.
 */

function preconfig(t: Topology, sol: LabSolution): Topology {
  const res = applySolution(t, new Sim(t), sol);
  if (res.errors.length) throw new Error(`Topology pre-config failed:\n${res.errors.join('\n')}`);
  return res.topology;
}

const CONF = ['enable', 'configure terminal'];
const ifIp = (iface: string, ip: string, mask: string) => [`interface ${iface}`, `ip address ${ip} ${mask}`, 'no shutdown'];
const access = (iface: string, vlan: number) => [`interface ${iface}`, 'switchport mode access', `switchport access vlan ${vlan}`];

/** L9.1 — router-on-a-stick: one router, one trunk, two station VLANs; uplink to JU. */
export function mtdRouterOnAStick(): Topology {
  let t = buildTopology(
    'Lab A9: MTD router-on-a-stick',
    'MTD-SW1 already carries VLAN 10 (UTS) and VLAN 20 (PRS) on a trunk to MTD-R1 Gi0/0. MTD-R1 is factory default. JU-R1 (Jodhpur) is ready, with a route back to 10.52.0.0/16 and the JU server.',
    [
      { key: 'r', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 300, y: 0 },
      { key: 'sw', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 300, y: 180 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 160, y: 360 },
      { key: 'p', kind: 'uts-prs', name: 'MTD-PRS1', station: 'MTD', x: 440, y: 360 },
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 700, y: 0 },
      { key: 'srv', kind: 'server', name: 'JU-SRV', station: 'JU', x: 700, y: 180 },
    ],
    [
      { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'], label: 'Trunk (VLAN 10, 20)' },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['p', 'eth0'] },
      { kind: 'cat6', a: ['r', 'Gi0/1'], b: ['ju', 'Gi0/1'], label: 'MTD–JU uplink (teaching)' },
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['srv', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-UTS1', '10.52.10.11', '10.52.10.1');
  t = host(t, 'MTD-PRS1', '10.52.20.11', '10.52.20.1');
  t = host(t, 'JU-SRV', '10.1.1.10', '10.1.1.1');
  return preconfig(t, {
    cli: {
      'MTD-SW1': [
        ...CONF,
        'vlan 10',
        'name UTS',
        'vlan 20',
        'name PRS',
        'exit',
        ...access('gi0/1', 10),
        ...access('gi0/2', 20),
        'interface gi0/24',
        'switchport mode trunk',
        'end',
      ],
      'JU-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.1', '255.255.255.252'),
        'exit',
        'ip route 10.52.0.0 255.255.0.0 10.255.0.2',
        'end',
      ],
    },
  });
}

/** L10.1 — 4-router OSPF ring JU–BNO–JWL–AAS, addressed, no routing yet. */
export function ospfRing(): Topology {
  let t = buildTopology(
    'Lab A10: OSPF ring JU–BNO–JWL–AAS',
    'Four station routers in a ring (teaching links along the track map). All interfaces and loopbacks are addressed; no routing protocol yet. JU-SRV sits at Jodhpur, AAS-PC at the far end of the ring.',
    [
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 0, y: 0 },
      { key: 'bno', kind: 'router', name: 'BNO-R1', station: 'BNO', x: 400, y: 0 },
      { key: 'jwl', kind: 'router', name: 'JWL-R1', station: 'JWL', x: 400, y: 300 },
      { key: 'aas', kind: 'router', name: 'AAS-R1', station: 'AAS', x: 0, y: 300 },
      { key: 'srv', kind: 'server', name: 'JU-SRV', station: 'JU', x: -240, y: -80 },
      { key: 'pc', kind: 'pc', name: 'AAS-PC', station: 'AAS', x: -240, y: 380 },
    ],
    [
      { kind: 'cat6', a: ['ju', 'Gi0/1'], b: ['bno', 'Gi0/0'] },
      { kind: 'cat6', a: ['bno', 'Gi0/1'], b: ['jwl', 'Gi0/0'] },
      { kind: 'cat6', a: ['jwl', 'Gi0/1'], b: ['aas', 'Gi0/0'] },
      { kind: 'cat6', a: ['aas', 'Gi0/1'], b: ['ju', 'Gi0/2'], label: 'Backup link' },
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['srv', 'eth0'] },
      { kind: 'cat6', a: ['aas', 'Gi0/2'], b: ['pc', 'eth0'] },
    ],
  );
  t = host(t, 'JU-SRV', '10.1.1.10', '10.1.1.1');
  t = host(t, 'AAS-PC', '10.4.1.10', '10.4.1.1');
  const M30 = '255.255.255.252';
  const lo = (n: number) => ['interface loopback0', `ip address 10.0.0.${n} 255.255.255.255`];
  return preconfig(t, {
    cli: {
      'JU-R1': [
        ...CONF,
        ...lo(1),
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.1.1', M30),
        ...ifIp('gi0/2', '10.255.1.14', M30),
        'end',
      ],
      'BNO-R1': [...CONF, ...lo(2), ...ifIp('gi0/0', '10.255.1.2', M30), ...ifIp('gi0/1', '10.255.1.5', M30), 'end'],
      'JWL-R1': [...CONF, ...lo(3), ...ifIp('gi0/0', '10.255.1.6', M30), ...ifIp('gi0/1', '10.255.1.9', M30), 'end'],
      'AAS-R1': [
        ...CONF,
        ...lo(4),
        ...ifIp('gi0/0', '10.255.1.10', M30),
        ...ifIp('gi0/1', '10.255.1.13', M30),
        ...ifIp('gi0/2', '10.4.1.1', '255.255.255.0'),
        'end',
      ],
    },
  });
}

/** L10.2 — 3-router IS-IS triangle JU / MTD (area 49.0001) and DNA (area 49.0002). */
export function isisTriangle(): Topology {
  const t = buildTopology(
    'Lab A10: IS-IS triangle JU–MTD–DNA',
    'Three routers in a triangle. JU and MTD will be in IS-IS area 49.0001, DNA in area 49.0002. Interfaces and loopbacks are addressed; IS-IS is not configured yet.',
    [
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 0, y: 0 },
      { key: 'mtd', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 420, y: 0 },
      { key: 'dna', kind: 'router', name: 'DNA-R1', station: 'DNA', x: 210, y: 300 },
    ],
    [
      { kind: 'cat6', a: ['ju', 'Gi0/1'], b: ['mtd', 'Gi0/0'] },
      { kind: 'cat6', a: ['mtd', 'Gi0/1'], b: ['dna', 'Gi0/0'] },
      { kind: 'cat6', a: ['dna', 'Gi0/1'], b: ['ju', 'Gi0/2'] },
    ],
  );
  const M30 = '255.255.255.252';
  const lo = (n: number) => ['interface loopback0', `ip address 10.0.0.${n} 255.255.255.255`];
  return preconfig(t, {
    cli: {
      'JU-R1': [...CONF, ...lo(1), ...ifIp('gi0/1', '10.255.2.1', M30), ...ifIp('gi0/2', '10.255.2.10', M30), 'end'],
      'MTD-R1': [...CONF, ...lo(2), ...ifIp('gi0/0', '10.255.2.2', M30), ...ifIp('gi0/1', '10.255.2.5', M30), 'end'],
      'DNA-R1': [...CONF, ...lo(3), ...ifIp('gi0/0', '10.255.2.6', M30), ...ifIp('gi0/1', '10.255.2.9', M30), 'end'],
    },
  });
}

/** L11.1 — JU HQ services: DNS/DHCP/NTP server, NMS, MTD client, ISP for NAT. */
export function juServices(): Topology {
  let t = buildTopology(
    'Lab A11: JU HQ network services',
    'JU-R1 connects the JU HQ LAN (DNS/DHCP/NTP server, NMS, admin PC), the MTD station router and a teaching "ISP" router. Addressing and static routes are ready; services are not.',
    [
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 300, y: 0 },
      { key: 'sw', kind: 'l2-switch', name: 'JU-SW1', station: 'JU', x: 300, y: 180 },
      { key: 'dns', kind: 'dns-dhcp', name: 'JU-DNS', station: 'JU', x: 80, y: 360 },
      { key: 'nms', kind: 'nms', name: 'JU-NMS', station: 'JU', x: 300, y: 360 },
      { key: 'adm', kind: 'pc', name: 'JU-ADMIN', station: 'JU', x: 520, y: 360 },
      { key: 'mtd', kind: 'router', name: 'MTD-R1', station: 'MTD', x: -160, y: 0 },
      { key: 'prs', kind: 'uts-prs', name: 'MTD-PRS1', station: 'MTD', x: -160, y: 200 },
      {
        key: 'isp',
        kind: 'router',
        name: 'ISP-R1',
        x: 720,
        y: 0,
        notes: 'Teaching stand-in for the Internet provider. Loopback0 198.51.100.10 = a public web server.',
      },
    ],
    [
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['dns', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['nms', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['adm', 'eth0'] },
      { kind: 'cat6', a: ['ju', 'Gi0/1'], b: ['mtd', 'Gi0/1'], label: 'MTD–JU uplink (teaching)' },
      { kind: 'cat6', a: ['mtd', 'Gi0/0'], b: ['prs', 'eth0'] },
      { kind: 'cat6', a: ['ju', 'Gi0/2'], b: ['isp', 'Gi0/0'], label: 'Internet (teaching)' },
    ],
  );
  t = host(t, 'JU-DNS', '10.1.1.53', '10.1.1.1');
  t = host(t, 'JU-NMS', '10.1.1.100', '10.1.1.1');
  t = host(t, 'JU-ADMIN', '10.1.1.20', '10.1.1.1');
  t = configure(t, 'JU-ADMIN', (c) => (c.mgmt.nameServers = ['10.1.1.53']));
  t = configure(t, 'JU-DNS', (c) => (c.mgmt.hosts = { 'ju-nms': '10.1.1.100', 'ju-r1': '10.1.1.1', 'uts-server': '10.1.1.10' }));
  t = configure(t, 'MTD-PRS1', (c) => setIf(c, 'eth0', { dhcpClient: true }));
  return preconfig(t, {
    cli: {
      'JU-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.1', '255.255.255.252'),
        ...ifIp('gi0/2', '203.0.113.2', '255.255.255.252'),
        'exit',
        'ip route 10.52.0.0 255.255.0.0 10.255.0.2',
        'ip route 0.0.0.0 0.0.0.0 203.0.113.1',
        'end',
      ],
      'MTD-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.52.20.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.2', '255.255.255.252'),
        'exit',
        'ip route 0.0.0.0 0.0.0.0 10.255.0.1',
        'end',
      ],
      'ISP-R1': [
        ...CONF,
        ...ifIp('gi0/0', '203.0.113.1', '255.255.255.252'),
        'interface loopback0',
        'ip address 198.51.100.10 255.255.255.255',
        'end',
      ],
    },
  });
}

/** L12.1 — MTD L3 switch with UTS, Railnet and management VLANs, all routed (no filtering yet). */
export function mtdSecurity(): Topology {
  let t = buildTopology(
    'Lab A12: MTD security',
    'MTD-L3SW routes between VLAN 10 (UTS), VLAN 50 (Railnet office) and VLAN 99 (management, with the station NMS). Everything can reach everything — no ACLs yet, and the vty lines accept Telnet from anywhere.',
    [
      { key: 'l3', kind: 'l3-switch', name: 'MTD-L3SW', station: 'MTD', x: 300, y: 0 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 0, y: 220 },
      { key: 'r', kind: 'pc', name: 'MTD-RAILNET-PC', station: 'MTD', x: 200, y: 220 },
      { key: 'm', kind: 'laptop', name: 'MTD-MGMT-LT', station: 'MTD', x: 400, y: 220 },
      { key: 'n', kind: 'nms', name: 'MTD-NMS', station: 'MTD', x: 600, y: 220 },
    ],
    [
      { kind: 'cat6', a: ['l3', 'Gi1/0/1'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['l3', 'Gi1/0/2'], b: ['r', 'eth0'] },
      { kind: 'cat6', a: ['l3', 'Gi1/0/3'], b: ['m', 'eth0'] },
      { kind: 'cat6', a: ['l3', 'Gi1/0/4'], b: ['n', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-UTS1', '10.52.10.11', '10.52.10.1');
  t = host(t, 'MTD-RAILNET-PC', '10.52.50.11', '10.52.50.1');
  t = host(t, 'MTD-MGMT-LT', '10.52.99.11', '10.52.99.1');
  t = host(t, 'MTD-NMS', '10.52.99.100', '10.52.99.1');
  return preconfig(t, {
    cli: {
      'MTD-L3SW': [
        ...CONF,
        'ip routing',
        'vlan 10',
        'name UTS',
        'vlan 50',
        'name RAILNET',
        'vlan 99',
        'name MGMT',
        'exit',
        ...access('gi1/0/1', 10),
        ...access('gi1/0/2', 50),
        ...access('gi1/0/3', 99),
        ...access('gi1/0/4', 99),
        ...ifIp('vlan10', '10.52.10.1', '255.255.255.0'),
        ...ifIp('vlan50', '10.52.50.1', '255.255.255.0'),
        ...ifIp('vlan99', '10.52.99.1', '255.255.255.0'),
        'end',
      ],
    },
  });
}

/** L13.1 — two MTD routers on one station LAN, dual uplinks to JU, OSPF running. */
export function mtdHsrp(): Topology {
  let t = buildTopology(
    'Lab A13: MTD gateway redundancy',
    'MTD-R1 and MTD-R2 both sit on the UTS LAN (10.52.10.0/24) and each has its own uplink to JU-R1. OSPF is already running. The UTS terminal uses 10.52.10.1 as gateway — an address nobody owns yet.',
    [
      { key: 'r1', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 120, y: 0 },
      { key: 'r2', kind: 'router', name: 'MTD-R2', station: 'MTD', x: 480, y: 0 },
      { key: 'sw', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 300, y: 200 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 300, y: 380 },
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 300, y: -220 },
      { key: 'srv', kind: 'server', name: 'JU-SRV', station: 'JU', x: 620, y: -220 },
    ],
    [
      { kind: 'cat6', a: ['r1', 'Gi0/0'], b: ['sw', 'Gi0/23'] },
      { kind: 'cat6', a: ['r2', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['r1', 'Gi0/1'], b: ['ju', 'Gi0/1'], label: 'Uplink 1' },
      { kind: 'cat6', a: ['r2', 'Gi0/1'], b: ['ju', 'Gi0/2'], label: 'Uplink 2' },
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['srv', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-UTS1', '10.52.10.11', '10.52.10.1');
  t = host(t, 'JU-SRV', '10.1.1.10', '10.1.1.1');
  const M30 = '255.255.255.252';
  const ospf = ['router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'end'];
  return preconfig(t, {
    cli: {
      'MTD-R1': [...CONF, ...ifIp('gi0/0', '10.52.10.2', '255.255.255.0'), ...ifIp('gi0/1', '10.255.0.2', M30), 'exit', ...ospf],
      'MTD-R2': [...CONF, ...ifIp('gi0/0', '10.52.10.3', '255.255.255.0'), ...ifIp('gi0/1', '10.255.0.6', M30), 'exit', ...ospf],
      'JU-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.1', M30),
        ...ifIp('gi0/2', '10.255.0.5', M30),
        'exit',
        ...ospf,
      ],
    },
  });
}

/** L14.1 — congested 10 Mb/s MTD–JU uplink with voice, UTS and CCTV traffic. */
export function mtdQos(): Topology {
  let t = buildTopology(
    'Lab A14: QoS on the MTD–JU uplink',
    'The MTD–JU uplink is limited to 10 Mb/s (speed 10, a teaching value). The control phone (EF), UTS terminal (AF31) and CCTV camera (AF41) send traffic to JU at the same time — together more than the link can carry. Open the QoS tab to see the flows.',
    [
      { key: 'r', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 300, y: 0 },
      { key: 'sw', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 300, y: 180 },
      { key: 'ph', kind: 'ip-phone', name: 'MTD-PHONE1', station: 'MTD', x: 80, y: 360 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 300, y: 360 },
      { key: 'c', kind: 'cctv', name: 'MTD-CAM1', station: 'MTD', x: 520, y: 360 },
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 760, y: 0 },
      { key: 'jsw', kind: 'l2-switch', name: 'JU-SW1', station: 'JU', x: 760, y: 180 },
      { key: 'srv', kind: 'server', name: 'JU-SRV', station: 'JU', x: 660, y: 360 },
      { key: 'nvr', kind: 'nvr', name: 'JU-NVR', station: 'JU', x: 880, y: 360 },
    ],
    [
      { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['ph', 'LAN'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['c', 'eth0'] },
      { kind: 'cat6', a: ['r', 'Gi0/1'], b: ['ju', 'Gi0/1'], label: 'Uplink, speed 10 (teaching)' },
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['jsw', 'Gi0/24'] },
      { kind: 'cat6', a: ['jsw', 'Gi0/1'], b: ['srv', 'eth0'] },
      { kind: 'cat6', a: ['jsw', 'Gi0/2'], b: ['nvr', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-PHONE1', '10.52.10.21', '10.52.10.1', '255.255.255.0', 'LAN');
  t = host(t, 'MTD-UTS1', '10.52.10.11', '10.52.10.1');
  t = host(t, 'MTD-CAM1', '10.52.10.41', '10.52.10.1');
  t = host(t, 'JU-SRV', '10.1.1.10', '10.1.1.1');
  t = host(t, 'JU-NVR', '10.1.1.40', '10.1.1.1');
  t = configure(t, 'MTD-PHONE1', (c) => (c.traffic = [{ id: 'voice', dst: '10.1.1.10', app: 'voip', dscp: 46, rateMbps: 1 }]));
  t = configure(t, 'MTD-UTS1', (c) => (c.traffic = [{ id: 'uts', dst: '10.1.1.10', app: 'uts', dscp: 26, rateMbps: 2 }]));
  t = configure(t, 'MTD-CAM1', (c) => (c.traffic = [{ id: 'cctv', dst: '10.1.1.40', app: 'cctv', dscp: 34, rateMbps: 8 }]));
  const M30 = '255.255.255.252';
  return preconfig(t, {
    cli: {
      'MTD-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.52.10.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.2', M30),
        'speed 10',
        'exit',
        'ip route 0.0.0.0 0.0.0.0 10.255.0.1',
        'end',
      ],
      'JU-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.1', M30),
        'speed 10',
        'exit',
        'ip route 10.52.0.0 255.255.0.0 10.255.0.2',
        'end',
      ],
    },
  });
}

/** L15.1 — capstone: MTD station (access + L3 switch) and JU HQ (router, servers, ISP). */
export function capstone(): Topology {
  let t = buildTopology(
    'Lab A15: MTD + JU capstone',
    'MTD: access switch (UTS VLAN 10, PRS VLAN 20, Railnet VLAN 50) trunked to the MTD L3 switch, which has a routed uplink to JU-R1. JU: HQ LAN with the DNS/DHCP/NTP server and NMS, plus the teaching ISP. L2 and addressing are done; routing, relay, NAT and logging are not.',
    [
      { key: 'sw', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 0, y: 200 },
      { key: 'l3', kind: 'l3-switch', name: 'MTD-L3SW', station: 'MTD', x: 0, y: 0 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: -200, y: 380 },
      { key: 'p', kind: 'uts-prs', name: 'MTD-PRS1', station: 'MTD', x: 0, y: 380 },
      { key: 'rn', kind: 'pc', name: 'MTD-RAILNET-PC', station: 'MTD', x: 200, y: 380 },
      { key: 'ju', kind: 'router', name: 'JU-R1', station: 'JU', x: 420, y: 0 },
      { key: 'jsw', kind: 'l2-switch', name: 'JU-SW1', station: 'JU', x: 420, y: 200 },
      { key: 'dns', kind: 'dns-dhcp', name: 'JU-DNS', station: 'JU', x: 320, y: 380 },
      { key: 'nms', kind: 'nms', name: 'JU-NMS', station: 'JU', x: 540, y: 380 },
      {
        key: 'isp',
        kind: 'router',
        name: 'ISP-R1',
        x: 780,
        y: 0,
        notes: 'Teaching stand-in for the Internet provider. Loopback0 198.51.100.10 = a public web server.',
      },
    ],
    [
      { kind: 'cat6', a: ['sw', 'Gi0/24'], b: ['l3', 'Gi1/0/24'], label: 'Trunk 10,20,50' },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['p', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['rn', 'eth0'] },
      { kind: 'cat6', a: ['l3', 'Gi1/0/1'], b: ['ju', 'Gi0/1'], label: 'MTD–JU uplink (teaching)' },
      { kind: 'cat6', a: ['ju', 'Gi0/0'], b: ['jsw', 'Gi0/24'] },
      { kind: 'cat6', a: ['jsw', 'Gi0/1'], b: ['dns', 'eth0'] },
      { kind: 'cat6', a: ['jsw', 'Gi0/2'], b: ['nms', 'eth0'] },
      { kind: 'cat6', a: ['ju', 'Gi0/2'], b: ['isp', 'Gi0/0'], label: 'Internet (teaching)' },
    ],
  );
  t = host(t, 'MTD-RAILNET-PC', '10.52.50.11', '10.52.50.1');
  t = host(t, 'JU-DNS', '10.1.1.53', '10.1.1.1');
  t = host(t, 'JU-NMS', '10.1.1.100', '10.1.1.1');
  for (const h of ['MTD-UTS1', 'MTD-PRS1']) t = configure(t, h, (c) => setIf(c, 'eth0', { dhcpClient: true }));
  t = configure(t, 'JU-DNS', (c) => {
    c.mgmt.hosts = { 'ju-nms': '10.1.1.100', 'uts-server': '10.1.1.10' };
    c.dhcp.pools['MTD-UTS'] = { network: '10.52.10.0', mask: '255.255.255.0', defaultRouter: '10.52.10.1', dnsServer: '10.1.1.53', leaseDays: 1 };
    c.dhcp.pools['MTD-PRS'] = { network: '10.52.20.0', mask: '255.255.255.0', defaultRouter: '10.52.20.1', dnsServer: '10.1.1.53', leaseDays: 1 };
  });
  return preconfig(t, {
    cli: {
      'MTD-SW1': [
        ...CONF,
        'vlan 10',
        'name UTS',
        'vlan 20',
        'name PRS',
        'vlan 50',
        'name RAILNET',
        'exit',
        ...access('gi0/1', 10),
        ...access('gi0/2', 20),
        ...access('gi0/3', 50),
        'interface gi0/24',
        'switchport mode trunk',
        'switchport trunk allowed vlan 10,20,50',
        'end',
      ],
      'MTD-L3SW': [
        ...CONF,
        'ip routing',
        'vlan 10',
        'name UTS',
        'vlan 20',
        'name PRS',
        'vlan 50',
        'name RAILNET',
        'exit',
        'interface gi1/0/24',
        'switchport mode trunk',
        'switchport trunk allowed vlan 10,20,50',
        ...ifIp('vlan10', '10.52.10.1', '255.255.255.0'),
        ...ifIp('vlan20', '10.52.20.1', '255.255.255.0'),
        ...ifIp('vlan50', '10.52.50.1', '255.255.255.0'),
        'interface gi1/0/1',
        'no switchport',
        'ip address 10.255.0.2 255.255.255.252',
        'no shutdown',
        'end',
      ],
      'JU-R1': [
        ...CONF,
        ...ifIp('gi0/0', '10.1.1.1', '255.255.255.0'),
        ...ifIp('gi0/1', '10.255.0.1', '255.255.255.252'),
        ...ifIp('gi0/2', '203.0.113.2', '255.255.255.252'),
        'exit',
        'ip route 0.0.0.0 0.0.0.0 203.0.113.1',
        'end',
      ],
      'ISP-R1': [
        ...CONF,
        ...ifIp('gi0/0', '203.0.113.1', '255.255.255.252'),
        'interface loopback0',
        'ip address 198.51.100.10 255.255.255.255',
        'end',
      ],
    },
  });
}
