import { Sim } from '../engine/sim';
import { configure, host } from '../engine/testing/fixtures';
import { applySolution } from '../labs/framework/solution';
import type { LabSolution } from '../labs/framework/types';
import * as ops from '../model/topologyOps';
import type { DeviceKind, Topology } from '../model/types';
import { generateJodhpur } from './jodhpur/generate';
import { hostname, ipPlan, VRFS } from './jodhpur/plan';

/**
 * Starting topologies for the BGP / L3VPN labs B5–B6 (P5): pieces of the J1
 * core with OSPF + LDP already running, plus CE routers, station hosts, the JU
 * firewall and a teaching ISP. Teaching design on the track map.
 */

export const ASN = 65000;
export const lo = (code: string) => ipPlan().loopbacks.get(code)!;
const vrfIndex = (vrf: string) => (VRFS as readonly string[]).indexOf(vrf);
/** RD = <PE loopback>:<100 + VRF index>; RT = 65000:<100 + VRF index> (division plan). */
export const rdOf = (code: string, vrf: string) => `${lo(code)}:${100 + vrfIndex(vrf)}`;
export const rtOf = (vrf: string) => `${ASN}:${100 + vrfIndex(vrf)}`;
/** Per-station VRF block from the IP plan, e.g. ("MTD", "UTS") → "10.100.13". */
export function vrfNet(code: string, vrf: string): string {
  const row = ipPlan().rows.find((r) => r.kind === 'vrf' && r.what === `${code} VRF ${vrf}`)!;
  return row.prefix.split('.').slice(0, 3).join('.');
}

export function preconfig(t: Topology, sol: LabSolution): Topology {
  const res = applySolution(t, new Sim(t), sol);
  if (res.errors.length) throw new Error(`Topology pre-config failed:\n${res.errors.join('\n')}`);
  return res.topology;
}

/** Adds a device next to `nearName` and cables it to a free port there. */
export function attach(
  t: Topology,
  o: {
    kind: DeviceKind;
    name: string;
    station?: string;
    near: string;
    nearPort: string;
    port: string;
    dx: number;
    dy: number;
    link?: 'cat6' | 'ofc';
    notes?: string;
  },
): Topology {
  const near = t.devices.find((d) => d.name === o.near)!;
  const res = ops.addDevice(t, o.kind, { x: near.position.x + o.dx, y: near.position.y + o.dy }, false);
  let topo = ops.updateDevice(res.topology, res.device.id, { name: o.name, station: o.station, notes: o.notes });
  const l = ops.addLink(topo, {
    kind: o.link ?? 'cat6',
    a: { deviceId: near.id, portId: o.nearPort },
    b: { deviceId: res.device.id, portId: o.port },
    lengthKm: o.link === 'ofc' ? 5 : undefined,
  });
  if (!l.ok) throw new Error(`attach ${o.name}: ${l.reason}`);
  topo = l.topology;
  return topo;
}

const CONF = ['enable', 'configure terminal'];

/** LB5.1 — JU, MTD, DNA, FL core (OSPF + LDP) and the Jaipur division router behind FL. */
export function b5Core(): Topology {
  let t = generateJodhpur({
    name: 'Lab B5: iBGP route reflector + eBGP at FL',
    description:
      'JU, MTD, DNA and FL from the J1 core with OSPF and LDP running. JP-R1 is a teaching stand-in for the Jaipur division (AS 65002) behind the Phulera hand-off.',
    sections: ['S1', 'S2', 'S3'],
    sites: ['JU', 'MTD', 'DNA', 'FL'],
    level: 'mpls',
  });
  t = attach(t, {
    kind: 'router',
    name: 'JP-R1',
    near: hostname('FL'),
    nearPort: 'Te0/0/1',
    port: 'Gi0/4',
    dx: 260,
    dy: 0,
    link: 'ofc',
    notes: 'Jaipur division edge (teaching stand-in), AS 65002',
  });
  return preconfig(t, {
    cli: {
      [hostname('FL')]: [
        ...CONF,
        'interface te0/0/1',
        'description Hand-off to Jaipur division',
        'ip address 192.0.2.1 255.255.255.252',
        'no shutdown',
        'end',
      ],
      'JP-R1': [
        ...CONF,
        'interface gi0/4',
        'ip address 192.0.2.2 255.255.255.252',
        'no shutdown',
        'interface loopback1',
        'description Jaipur division LAN (teaching)',
        'ip address 172.16.10.1 255.255.255.0',
        'exit',
        'ip route 10.0.0.0 255.0.0.0 192.0.2.1',
        `router bgp 65002`,
        `neighbor 192.0.2.1 remote-as ${ASN}`,
        'network 172.16.10.0 mask 255.255.255.0',
        'end',
      ],
    },
  });
}

const vrfLines = (code: string, vrf: string, imports: string[] = [rtOf(vrf)]) => [
  `vrf definition ${vrf}`,
  `rd ${rdOf(code, vrf)}`,
  'address-family ipv4',
  `route-target export ${rtOf(vrf)}`,
  ...imports.map((r) => `route-target import ${r}`),
  'exit-address-family',
  'exit',
];

/** JU as VPNv4 route reflector for the given client loopbacks. */
const rrLines = (clients: string[]) => [
  `router bgp ${ASN}`,
  'no bgp default ipv4-unicast',
  ...clients.flatMap((c) => [`neighbor ${lo(c)} remote-as ${ASN}`, `neighbor ${lo(c)} update-source loopback0`]),
  'address-family vpnv4',
  ...clients.flatMap((c) => [`neighbor ${lo(c)} activate`, `neighbor ${lo(c)} send-community extended`, `neighbor ${lo(c)} route-reflector-client`]),
  'exit-address-family',
];

/** LB6.1 — JU (RR + UTS server + Railnet firewall), PPR (P), MTD and DNA PEs with station hosts. */
export function b6Vpn(): Topology {
  let t = generateJodhpur({
    name: 'Lab B6: UTS and Railnet VRFs',
    description:
      'JU, PPR, MTD and DNA from the J1 core with OSPF + LDP. JU is the VPNv4 route reflector and hosts the UTS server and the Railnet internet breakout (firewall + teaching ISP). PPR is a pure P router (no BGP).',
    sections: ['S1', 'S2'],
    sites: ['JU', 'PPR', 'MTD', 'DNA'],
    level: 'mpls',
  });
  const JU = hostname('JU');
  const MTD = hostname('MTD');
  const DNA = hostname('DNA');
  t = attach(t, { kind: 'server', name: 'JU-UTS-SRV', station: 'JU', near: JU, nearPort: 'Gi0/3/0', port: 'eth0', dx: -200, dy: 180 });
  t = attach(t, {
    kind: 'firewall',
    name: 'JU-FW',
    station: 'JU',
    near: JU,
    nearPort: 'Gi0/3/1',
    port: 'inside',
    dx: 0,
    dy: 220,
    notes: 'Railnet internet breakout (teaching)',
  });
  t = attach(t, {
    kind: 'router',
    name: 'ISP-R1',
    near: 'JU-FW',
    nearPort: 'outside',
    port: 'Gi0/0',
    dx: 0,
    dy: 180,
    notes: 'Teaching stand-in for the Internet provider. Loopback0 198.51.100.10 = a public web server.',
  });
  for (const code of ['MTD', 'DNA']) {
    t = attach(t, {
      kind: 'uts-prs',
      name: `${code}-UTS1`,
      station: code,
      near: hostname(code),
      nearPort: 'Gi0/3/0',
      port: 'eth0',
      dx: -120,
      dy: 200,
    });
    t = attach(t, {
      kind: 'pc',
      name: `${code}-RAILNET-PC`,
      station: code,
      near: hostname(code),
      nearPort: 'Gi0/3/1',
      port: 'eth0',
      dx: 120,
      dy: 200,
    });
    t = host(t, `${code}-UTS1`, `${vrfNet(code, 'UTS')}.11`, `${vrfNet(code, 'UTS')}.1`);
    t = host(t, `${code}-RAILNET-PC`, `${vrfNet(code, 'RAILNET')}.11`, `${vrfNet(code, 'RAILNET')}.1`);
  }
  t = host(t, 'JU-UTS-SRV', `${vrfNet('JU', 'UTS')}.10`, `${vrfNet('JU', 'UTS')}.1`);
  const fwIn = `${vrfNet('JU', 'RAILNET')}.2`;
  t = configure(t, 'JU-FW', (c) => {
    c.interfaces.inside = { shutdown: false, ip: { address: fwIn, mask: '255.255.255.0' }, natRole: 'inside' };
    c.interfaces.outside = { shutdown: false, ip: { address: '203.0.113.2', mask: '255.255.255.252' }, natRole: 'outside' };
    c.acls['1'] = { kind: 'standard', entries: [{ action: 'permit', protocol: 'ip', src: { address: '10.0.0.0', wildcard: '0.255.255.255' } }] };
    c.nat.overload = [{ acl: '1', iface: 'outside' }];
    c.staticRoutes = [
      { prefix: '10.0.0.0', mask: '255.0.0.0', nextHop: `${vrfNet('JU', 'RAILNET')}.1` },
      { prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.1' },
    ];
  });
  return preconfig(t, {
    cli: {
      'ISP-R1': [
        ...CONF,
        'interface gi0/0',
        'ip address 203.0.113.1 255.255.255.252',
        'no shutdown',
        'interface loopback0',
        'ip address 198.51.100.10 255.255.255.255',
        'end',
      ],
      [JU]: [
        ...CONF,
        ...vrfLines('JU', 'UTS'),
        ...vrfLines('JU', 'RAILNET'),
        'interface gi0/3/0',
        'vrf forwarding UTS',
        `ip address ${vrfNet('JU', 'UTS')}.1 255.255.255.0`,
        'no shutdown',
        'interface gi0/3/1',
        'vrf forwarding RAILNET',
        `ip address ${vrfNet('JU', 'RAILNET')}.1 255.255.255.0`,
        'no shutdown',
        'exit',
        `ip route vrf RAILNET 0.0.0.0 0.0.0.0 ${fwIn}`,
        ...rrLines(['MTD', 'DNA']),
        'address-family ipv4 vrf UTS',
        'redistribute connected',
        'exit-address-family',
        'address-family ipv4 vrf RAILNET',
        'redistribute connected',
        'redistribute static',
        'end',
      ],
      // MTD and DNA: hosts are cabled; the PE side is the learner's job.
      [MTD]: [...CONF, 'interface gi0/3/0', 'no shutdown', 'interface gi0/3/1', 'no shutdown', 'end'],
      [DNA]: [...CONF, 'interface gi0/3/0', 'no shutdown', 'interface gi0/3/1', 'no shutdown', 'end'],
    },
  });
}

/** LB6.2 — JU (RR, SCADA server, NMS) and MTD (PE) with a SCADA CE router on eBGP. */
export function b6Scada(): Topology {
  let t = generateJodhpur({
    name: 'Lab B6: SCADA CE on eBGP + shared NMS',
    description:
      'JU and MTD from the J1 core (OSPF + LDP; the express path runs through RKB and PPR, shown as one logical link). JU is the VPNv4 route reflector with the SCADA server and the divisional NMS; the MTD traction-substation SCADA site has its own CE router (AS 65201).',
    sections: ['S1'],
    sites: ['JU', 'MTD'],
    level: 'mpls',
  });
  const JU = hostname('JU');
  const MTD = hostname('MTD');
  t = attach(t, { kind: 'server', name: 'JU-SCADA-SRV', station: 'JU', near: JU, nearPort: 'Gi0/3/0', port: 'eth0', dx: -200, dy: 180 });
  t = attach(t, { kind: 'nms', name: 'JU-NMS', station: 'JU', near: JU, nearPort: 'Gi0/3/1', port: 'eth0', dx: 120, dy: 200 });
  t = attach(t, {
    kind: 'router',
    name: 'MTD-SCADA-CE',
    station: 'MTD',
    near: MTD,
    nearPort: 'Gi0/3/0',
    port: 'Gi0/0',
    dx: 0,
    dy: 220,
    notes: 'SCADA site CE router (AS 65201)',
  });
  t = host(t, 'JU-SCADA-SRV', `${vrfNet('JU', 'SCADA')}.10`, `${vrfNet('JU', 'SCADA')}.1`);
  t = host(t, 'JU-NMS', `${vrfNet('JU', 'NMS-MGMT')}.100`, `${vrfNet('JU', 'NMS-MGMT')}.1`);
  const ceLink = `${vrfNet('MTD', 'SCADA')}`;
  return preconfig(t, {
    cli: {
      'MTD-SCADA-CE': [
        ...CONF,
        'interface gi0/0',
        `ip address ${ceLink}.2 255.255.255.252`,
        'no shutdown',
        'interface loopback1',
        'description SCADA RTU LAN (teaching)',
        `ip address ${ceLink}.129 255.255.255.128`,
        'exit',
        'router bgp 65201',
        `neighbor ${ceLink}.1 remote-as ${ASN}`,
        `network ${ceLink}.128 mask 255.255.255.128`,
        'end',
      ],
      [JU]: [
        ...CONF,
        ...vrfLines('JU', 'SCADA'),
        ...vrfLines('JU', 'NMS-MGMT'),
        'interface gi0/3/0',
        'vrf forwarding SCADA',
        `ip address ${vrfNet('JU', 'SCADA')}.1 255.255.255.0`,
        'no shutdown',
        'interface gi0/3/1',
        'vrf forwarding NMS-MGMT',
        `ip address ${vrfNet('JU', 'NMS-MGMT')}.1 255.255.255.0`,
        'no shutdown',
        'exit',
        ...rrLines(['MTD']),
        'address-family ipv4 vrf SCADA',
        'redistribute connected',
        'exit-address-family',
        'address-family ipv4 vrf NMS-MGMT',
        'redistribute connected',
        'end',
      ],
      [MTD]: [
        ...CONF,
        ...vrfLines('MTD', 'SCADA'),
        'interface gi0/3/0',
        'vrf forwarding SCADA',
        `ip address ${ceLink}.1 255.255.255.252`,
        'no shutdown',
        'exit',
        `router bgp ${ASN}`,
        'no bgp default ipv4-unicast',
        `neighbor ${lo('JU')} remote-as ${ASN}`,
        `neighbor ${lo('JU')} update-source loopback0`,
        'address-family vpnv4',
        `neighbor ${lo('JU')} activate`,
        `neighbor ${lo('JU')} send-community extended`,
        'exit-address-family',
        'end',
      ],
    },
  });
}
