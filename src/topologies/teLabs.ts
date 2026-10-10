import { configure, host } from '../engine/testing/fixtures';
import * as ops from '../model/topologyOps';
import type { DeviceKind, Topology } from '../model/types';
import { preconfig } from './bgpLabs';
import { generateJodhpur } from './jodhpur/generate';
import { hostname } from './jodhpur/plan';

/**
 * Starting topologies for MPLS QoS and Traffic Engineering labs B9–B10 (P7).
 * Teaching design on the track map — not the real RailTel / NWR network.
 * The J1 core is a tree; the B10 ring adds a LEASED JU–DNA lambda as a
 * clearly-labelled teaching assumption so that a second path exists.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const PPR = hostname('PPR');
const MTD = hostname('MTD');
const DNA = hostname('DNA');

/** Station subnets (global table, teaching): 10.8x.<station>.0/24 per application. */
export const NET = {
  dc: '10.80.1',
  rtu: '10.81.13',
  phone: '10.82.13',
  uts: '10.83.13',
  camMtd: '10.84.13',
  nvr: '10.84.1',
  rnetMtd: '10.85.13',
  rnetJu: '10.85.1',
};
export const LEASE = { ju: '10.254.9.0', dna: '10.254.9.1' };

/** Adds a host-type device on a router port, with its address and optional traffic flows. */
function station(
  t: Topology,
  o: {
    kind: DeviceKind;
    name: string;
    station: string;
    router: string;
    port: string;
    net: string;
    dx: number;
    dy: number;
    traffic?: Array<{ app: string; dscp: number; rateMbps: number; dst: string }>;
  },
): Topology {
  const r = t.devices.find((d) => d.name === o.router)!;
  const res = ops.addDevice(t, o.kind, { x: r.position.x + o.dx, y: r.position.y + o.dy }, false);
  let topo = ops.updateDevice(res.topology, res.device.id, { name: o.name, station: o.station });
  const l = ops.addLink(topo, {
    kind: 'cat6',
    a: { deviceId: r.id, portId: o.port },
    b: { deviceId: res.device.id, portId: res.device.ports[0].id },
  });
  if (!l.ok) throw new Error(`station ${o.name}: ${l.reason}`);
  topo = host(l.topology, o.name, `${o.net}.10`, `${o.net}.1`);
  if (o.traffic) topo = configure(topo, o.name, (c) => void (c.traffic = o.traffic!.map((f, i) => ({ id: `${o.name}-${i}`, ...f }))));
  return topo;
}

const gw = (port: string, net: string) => [`interface ${port}`, `ip address ${net}.1 255.255.255.0`, 'no shutdown'];
const ospfLan = ['router ospf 1', 'network 10.80.0.0 0.15.255.255 area 0', 'exit'];

/** LB9.1 — JU, PPR, MTD; the MTD–PPR span is a 1 Gbit/s lambda carrying all of MTD's applications. */
export function b9Qos(): Topology {
  let t = generateJodhpur({
    name: 'Lab B9: MPLS QoS on the MTD–PPR span',
    description:
      'JU, PPR and MTD with OSPF and LDP. The MTD–PPR span runs at 1 Gbit/s (teaching assumption) and carries signalling, voice, UTS, CCTV and Railnet towards JU.',
    sections: ['S1'],
    sites: ['JU', 'PPR', 'MTD'],
    level: 'mpls',
  });
  const dst = { dc: `${NET.dc}.10`, nvr: `${NET.nvr}.10`, rnet: `${NET.rnetJu}.10` };
  t = station(t, { kind: 'server', name: 'JU-DC', station: 'JU', router: JU, port: 'Gi0/3/0', net: NET.dc, dx: -160, dy: 220 });
  t = station(t, { kind: 'nvr', name: 'JU-NVR', station: 'JU', router: JU, port: 'Gi0/3/4', net: NET.nvr, dx: 0, dy: 220 });
  t = station(t, { kind: 'server', name: 'JU-RAILNET-GW', station: 'JU', router: JU, port: 'Gi0/3/5', net: NET.rnetJu, dx: 160, dy: 220 });
  t = station(t, {
    kind: 'pc',
    name: 'MTD-RTU',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/0',
    net: NET.rtu,
    dx: -240,
    dy: 220,
    traffic: [{ app: 'signalling', dscp: 40, rateMbps: 5, dst: dst.dc }],
  });
  t = station(t, {
    kind: 'pc',
    name: 'MTD-PHONE',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/1',
    net: NET.phone,
    dx: -120,
    dy: 220,
    traffic: [{ app: 'voip', dscp: 46, rateMbps: 20, dst: dst.dc }],
  });
  t = station(t, {
    kind: 'uts-prs',
    name: 'MTD-UTS1',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/2',
    net: NET.uts,
    dx: 0,
    dy: 220,
    traffic: [{ app: 'uts', dscp: 26, rateMbps: 50, dst: dst.dc }],
  });
  t = station(t, {
    kind: 'cctv',
    name: 'MTD-CAM1',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/4',
    net: NET.camMtd,
    dx: 120,
    dy: 220,
    traffic: [{ app: 'cctv', dscp: 34, rateMbps: 600, dst: dst.nvr }],
  });
  t = station(t, {
    kind: 'pc',
    name: 'MTD-RAILNET-PC',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/5',
    net: NET.rnetMtd,
    dx: 240,
    dy: 220,
    traffic: [{ app: 'railnet', dscp: 0, rateMbps: 500, dst: dst.rnet }],
  });
  return preconfig(t, {
    cli: {
      [JU]: [...CONF, ...gw('gi0/3/0', NET.dc), ...gw('gi0/3/4', NET.nvr), ...gw('gi0/3/5', NET.rnetJu), 'exit', ...ospfLan, 'end'],
      [PPR]: [...CONF, 'interface te0/0/1', 'description MTD span: 1G lambda (teaching)', 'speed 1000', 'end'],
      [MTD]: [
        ...CONF,
        'interface te0/0/0',
        'description PPR span: 1G lambda (teaching)',
        'speed 1000',
        ...gw('gi0/3/0', NET.rtu),
        ...gw('gi0/3/1', NET.phone),
        ...gw('gi0/3/2', NET.uts),
        ...gw('gi0/3/4', NET.camMtd),
        ...gw('gi0/3/5', NET.rnetMtd),
        'exit',
        ...ospfLan,
        'end',
      ],
    },
  });
}

const teCore = (lsrIfs: string[]) => [
  'mpls traffic-eng tunnels',
  ...lsrIfs.flatMap((i) => [`interface ${i}`, 'mpls traffic-eng tunnels', 'ip rsvp bandwidth']),
  'exit',
  'router ospf 1',
  'mpls traffic-eng router-id loopback0',
  'mpls traffic-eng area 0',
  'exit',
];

/** LB10.x — ring JU–PPR–MTD–DNA plus the leased JU–DNA lambda. `congested`: JU–PPR at 1 Gbit/s with MTD traffic; `teOnMtd`: TE pre-enabled on MTD too. */
export function b10Ring(o: { congested: boolean; teOnMtd: boolean; sr?: boolean }): Topology {
  let t = generateJodhpur({
    name: o.sr ? 'Lab B14: Segment Routing on the ring' : o.congested ? 'Lab B10: TE around a busy span' : 'Lab B10: fast reroute on the ring',
    description:
      'JU, PPR, MTD and DNA with OSPF and LDP, closed into a ring by a LEASED JU–DNA 10G lambda (teaching assumption: the J1 core is a tree, so a second path is added for TE / FRR practice).',
    sections: ['S1', 'S2'],
    sites: ['JU', 'PPR', 'MTD', 'DNA'],
    level: 'mpls',
  });
  const ju = t.devices.find((d) => d.name === JU)!;
  const dna = t.devices.find((d) => d.name === DNA)!;
  const l = ops.addLink(t, { kind: 'ofc', a: { deviceId: ju.id, portId: 'Te0/0/1' }, b: { deviceId: dna.id, portId: 'Te0/0/1' }, lengthKm: 20 });
  if (!l.ok) throw new Error(`lease: ${l.reason}`);
  t = ops.updateLink(l.topology, l.link.id, { label: 'LEASED 10G lambda JU–DNA (teaching assumption)' }).topology;
  t = station(t, { kind: 'nvr', name: 'JU-NVR', station: 'JU', router: JU, port: 'Gi0/3/4', net: NET.nvr, dx: -80, dy: 220 });
  t = station(t, {
    kind: 'cctv',
    name: 'MTD-CAM1',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/4',
    net: NET.camMtd,
    dx: -80,
    dy: 220,
    traffic: o.congested ? [{ app: 'cctv', dscp: 34, rateMbps: 600, dst: `${NET.nvr}.10` }] : undefined,
  });
  if (o.congested) {
    t = station(t, { kind: 'server', name: 'JU-RAILNET-GW', station: 'JU', router: JU, port: 'Gi0/3/5', net: NET.rnetJu, dx: 80, dy: 220 });
    t = station(t, {
      kind: 'pc',
      name: 'MTD-RAILNET-PC',
      station: 'MTD',
      router: MTD,
      port: 'Gi0/3/5',
      net: NET.rnetMtd,
      dx: 80,
      dy: 220,
      traffic: [{ app: 'railnet', dscp: 0, rateMbps: 500, dst: `${NET.rnetJu}.10` }],
    });
  }
  const lease = (ip: string) => [
    'interface te0/0/1',
    'description LEASED lambda JU–DNA (teaching)',
    `ip address ${ip} 255.255.255.254`,
    'ip ospf cost 50',
    'mpls ip',
    'no shutdown',
  ];
  const leaseOspf = (ip: string) => ['router ospf 1', `network ${ip} 0.0.0.0 area 0`, 'exit'];
  // LB14.1 starts from the same ring with LDP only (no TE): the learner migrates it to SR.
  const te = (ifs: string[]) => (o.sr ? [] : teCore(ifs));
  return preconfig(t, {
    cli: {
      [JU]: [
        ...CONF,
        ...lease(LEASE.ju),
        ...gw('gi0/3/4', NET.nvr),
        ...(o.congested ? gw('gi0/3/5', NET.rnetJu) : []),
        ...(o.congested ? ['interface te0/0/0', 'description PPR span: 1G lambda (teaching)', 'speed 1000', 'ip ospf cost 10'] : []),
        'exit',
        ...leaseOspf(LEASE.ju),
        ...ospfLan,
        ...te(['te0/0/0', 'te0/0/1']),
        'end',
      ],
      [DNA]: [...CONF, ...lease(LEASE.dna), 'exit', ...leaseOspf(LEASE.dna), ...te(['te0/0/0', 'te0/0/1']), 'end'],
      [PPR]: [
        ...CONF,
        // The planners pinned the OSPF cost of the span, so the IGP keeps using it although it is only 1G.
        ...(o.congested ? ['interface te0/0/0', 'description JU span: 1G lambda (teaching)', 'speed 1000', 'ip ospf cost 10', 'exit'] : []),
        ...te(['te0/0/0', 'te0/0/1']),
        'end',
      ],
      [MTD]: [
        ...CONF,
        ...gw('gi0/3/4', NET.camMtd),
        ...(o.congested ? gw('gi0/3/5', NET.rnetMtd) : []),
        'exit',
        ...ospfLan,
        ...(o.teOnMtd ? teCore(['te0/0/0', 'te0/0/1']) : []),
        'end',
      ],
    },
  });
}
