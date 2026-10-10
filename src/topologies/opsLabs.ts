import { configure, host } from '../engine/testing/fixtures';
import * as ops from '../model/topologyOps';
import type { DeviceKind, Topology } from '../model/types';
import { ASN, lo, preconfig, rrLines, vrfLines, vrfNet } from './bgpLabs';
import { generateJodhpur } from './jodhpur/generate';
import { hostname } from './jodhpur/plan';

/**
 * Starting topologies for Operations & NMS, Automation and Inter-division
 * hand-off labs B11–B13 (P8). Teaching design on the track map. JP-ASBR is a
 * teaching stand-in for the Jaipur division's border router.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const PPR = hostname('PPR');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const FL = hostname('FL');

export const NMS_IP = '10.80.1.20';
export const DC_IP = '10.80.1.10';
export const NVR_IP = '10.84.1.10';
export const POLL = 'RAILNMS-RO';
export const OPS_LSRS = [JU, PPR, MTD, DNA];

function add(
  t: Topology,
  o: {
    kind: DeviceKind;
    name: string;
    station?: string;
    router: string;
    port: string;
    ip: string;
    gw: string;
    dx: number;
    dy: number;
    peerPort?: string;
  },
): Topology {
  const r = t.devices.find((d) => d.name === o.router)!;
  const res = ops.addDevice(t, o.kind, { x: r.position.x + o.dx, y: r.position.y + o.dy }, false);
  const topo = ops.updateDevice(res.topology, res.device.id, { name: o.name, station: o.station });
  const l = ops.addLink(topo, {
    kind: 'cat6',
    a: { deviceId: r.id, portId: o.port },
    b: { deviceId: res.device.id, portId: o.peerPort ?? res.device.ports[0].id },
  });
  if (!l.ok) throw new Error(`${o.name}: ${l.reason}`);
  return host(l.topology, o.name, o.ip, o.gw);
}

const gw = (port: string, ip: string) => [`interface ${port}`, `ip address ${ip} 255.255.255.0`, 'no shutdown'];

/**
 * LB11.1 / LB12.1 — JU, PPR, MTD, DNA with OSPF + LDP; NMS, data centre and NVR at JU; UTS, CCTV and the
 * MTD Data Logger (VPWS to JU). `fault`: PPR has "no mpls ip" towards JU (the NMS drill).
 * `managed`: JU and MTD already carry the SNMP baseline. `insecure`: DNA still has "snmp-server community public rw".
 */
export function opsDivision(o: { fault: boolean; managed: boolean; insecure: boolean; name: string }): Topology {
  let t = generateJodhpur({
    name: o.name,
    description:
      'JU, PPR, MTD and DNA with OSPF and LDP. JU hosts the NMS, the data centre and the CCTV NVR. Railway services are watched by the NMS.',
    sections: ['S1', 'S2'],
    sites: ['JU', 'PPR', 'MTD', 'DNA'],
    level: 'mpls',
  });
  t = add(t, { kind: 'nms', name: 'JU-NMS', station: 'JU', router: JU, port: 'Gi0/3/0', ip: NMS_IP, gw: '10.80.1.1', dx: -200, dy: 220 });
  const nms = t.devices.find((d) => d.name === 'JU-NMS')!;
  t = add(t, {
    kind: 'server',
    name: 'JU-DC',
    station: 'JU',
    router: JU,
    port: 'Gi0/3/1',
    ip: DC_IP.replace('10.80.1', '10.80.2'),
    gw: '10.80.2.1',
    dx: -60,
    dy: 220,
  });
  t = add(t, { kind: 'nvr', name: 'JU-NVR', station: 'JU', router: JU, port: 'Gi0/3/4', ip: NVR_IP, gw: '10.84.1.1', dx: 80, dy: 220 });
  t = add(t, {
    kind: 'server',
    name: 'JU-DL-SRV',
    station: 'JU',
    router: JU,
    port: 'Gi0/3/2',
    ip: '10.210.13.10',
    gw: '10.210.13.1',
    dx: 220,
    dy: 220,
  });
  t = add(t, {
    kind: 'uts-prs',
    name: 'MTD-UTS1',
    station: 'MTD',
    router: MTD,
    port: 'Gi0/3/0',
    ip: '10.83.13.10',
    gw: '10.83.13.1',
    dx: -80,
    dy: 220,
  });
  t = add(t, { kind: 'pc', name: 'MTD-DL', station: 'MTD', router: MTD, port: 'Gi0/3/2', ip: '10.210.13.20', gw: '10.210.13.1', dx: 80, dy: 220 });
  t = add(t, { kind: 'cctv', name: 'DNA-CAM1', station: 'DNA', router: DNA, port: 'Gi0/3/4', ip: '10.84.6.10', gw: '10.84.6.1', dx: 0, dy: 220 });
  t = configure(t, nms.name, (c) => {
    c.nms = {
      pollCommunity: POLL,
      services: [
        { name: 'UTS MTD → JU data centre', kind: 'path', src: 'MTD-UTS1', dst: '10.80.2.10' },
        { name: 'CCTV DNA → JU NVR', kind: 'path', src: 'DNA-CAM1', dst: NVR_IP },
        { name: 'Data Logger MTD ↔ JU (VPWS)', kind: 'pw', a: MTD, vcId: 1301, safety: true },
      ],
    };
  });
  const baseline = [
    'logging host ' + NMS_IP,
    `snmp-server community ${POLL} ro`,
    `snmp-server host ${NMS_IP} version 2c ${POLL}`,
    'snmp-server enable traps',
    `ntp server ${lo('JU')}`,
  ];
  const lanOspf = ['router ospf 1', 'network 10.80.0.0 0.15.255.255 area 0', 'exit'];
  return preconfig(t, {
    cli: {
      [JU]: [
        ...CONF,
        ...gw('gi0/3/0', '10.80.1.1'),
        ...gw('gi0/3/1', '10.80.2.1'),
        ...gw('gi0/3/4', '10.84.1.1'),
        'interface gi0/3/2',
        'description Data Logger (VPWS)',
        `xconnect ${lo('MTD')} 1301 encapsulation mpls`,
        'no shutdown',
        'exit',
        ...lanOspf,
        'ntp master 3',
        ...(o.managed ? baseline.filter((l) => !l.startsWith('ntp server')) : []),
        'end',
      ],
      [MTD]: [
        ...CONF,
        ...gw('gi0/3/0', '10.83.13.1'),
        'interface gi0/3/2',
        'description Data Logger (VPWS)',
        `xconnect ${lo('JU')} 1301 encapsulation mpls`,
        'no shutdown',
        'exit',
        ...lanOspf,
        ...(o.managed ? baseline : []),
        'end',
      ],
      [DNA]: [...CONF, ...gw('gi0/3/4', '10.84.6.1'), 'exit', ...lanOspf, ...(o.insecure ? ['snmp-server community public rw'] : []), 'end'],
      [PPR]: [...CONF, ...(o.fault ? ['interface te0/0/0', 'no mpls ip'] : []), 'end'],
    },
  });
}

export const B11 = () => opsDivision({ fault: true, managed: true, insecure: false, name: 'Lab B11: NMS drill on the JU–DNA core' });
export const B12 = () => opsDivision({ fault: false, managed: false, insecure: true, name: 'Lab B12: automate the management baseline' });

// ---------------------------------------------------------------------------
// LB13.1 — Inter-AS Option A at Phulera
// ---------------------------------------------------------------------------

export const JP = { asn: 65002, uts: '10.150.1', fois: '10.152.1', uLink: '172.31.101', fLink: '172.31.102' };

export function b13Handoff(): Topology {
  let t = generateJodhpur({
    name: 'Lab B13: inter-division hand-off at Phulera (Option A)',
    description:
      'JU, MTD, DNA and FL with OSPF, LDP and an MP-BGP VPN core (JU = route reflector, FL = PE). JP-ASBR is a teaching stand-in for the Jaipur division border router (AS 65002) with UTS and FOIS VRFs.',
    sections: ['S1', 'S2', 'S3'],
    sites: ['JU', 'MTD', 'DNA', 'FL'],
    level: 'mpls',
  });
  const fl = t.devices.find((d) => d.name === FL)!;
  const res = ops.addDevice(t, 'router', { x: fl.position.x + 260, y: fl.position.y }, false);
  t = ops.updateDevice(res.topology, res.device.id, { name: 'JP-ASBR', notes: 'Jaipur division border router (teaching stand-in), AS 65002' });
  const l = ops.addLink(t, { kind: 'cat6', a: { deviceId: fl.id, portId: 'Gi0/1/0' }, b: { deviceId: res.device.id, portId: 'Gi0/0' } });
  if (!l.ok) throw new Error(l.reason);
  t = l.topology;
  t = add(t, {
    kind: 'uts-prs',
    name: 'JU-UTS-SRV',
    station: 'JU',
    router: JU,
    port: 'Gi0/3/0',
    ip: `${vrfNet('JU', 'UTS')}.10`,
    gw: `${vrfNet('JU', 'UTS')}.1`,
    dx: -80,
    dy: 220,
  });
  t = add(t, {
    kind: 'fois',
    name: 'JU-FOIS-SRV',
    station: 'JU',
    router: JU,
    port: 'Gi0/3/1',
    ip: `${vrfNet('JU', 'FOIS')}.10`,
    gw: `${vrfNet('JU', 'FOIS')}.1`,
    dx: 80,
    dy: 220,
  });
  t = add(t, { kind: 'server', name: 'JP-UTS-SRV', router: 'JP-ASBR', port: 'Gi0/1', ip: `${JP.uts}.10`, gw: `${JP.uts}.1`, dx: -60, dy: 200 });
  t = add(t, { kind: 'server', name: 'JP-FOIS-SRV', router: 'JP-ASBR', port: 'Gi0/2', ip: `${JP.fois}.10`, gw: `${JP.fois}.1`, dx: 60, dy: 200 });
  const peVrf = (code: string) => [...vrfLines(code, 'UTS'), ...vrfLines(code, 'FOIS')];
  const jpVrf = (v: string, n: number) => [
    `vrf definition ${v}`,
    `rd ${JP.asn}:${n}`,
    'address-family ipv4',
    `route-target both ${JP.asn}:${n}`,
    'exit-address-family',
    'exit',
  ];
  return preconfig(t, {
    cli: {
      [JU]: [
        ...CONF,
        ...peVrf('JU'),
        'interface gi0/3/0',
        'vrf forwarding UTS',
        `ip address ${vrfNet('JU', 'UTS')}.1 255.255.255.0`,
        'no shutdown',
        'interface gi0/3/1',
        'vrf forwarding FOIS',
        `ip address ${vrfNet('JU', 'FOIS')}.1 255.255.255.0`,
        'no shutdown',
        'exit',
        ...rrLines(['FL']),
        'address-family ipv4 vrf UTS',
        'redistribute connected',
        'exit-address-family',
        'address-family ipv4 vrf FOIS',
        'redistribute connected',
        'end',
      ],
      [FL]: [
        ...CONF,
        ...peVrf('FL'),
        'interface gi0/1/0',
        'description Hand-off to Jaipur division (Option A, one VLAN per VRF)',
        'no shutdown',
        'exit',
        `router bgp ${ASN}`,
        'no bgp default ipv4-unicast',
        `neighbor ${lo('JU')} remote-as ${ASN}`,
        `neighbor ${lo('JU')} update-source loopback0`,
        'address-family vpnv4',
        `neighbor ${lo('JU')} activate`,
        `neighbor ${lo('JU')} send-community extended`,
        'end',
      ],
      'JP-ASBR': [
        ...CONF,
        ...jpVrf('UTS', 100),
        ...jpVrf('FOIS', 102),
        'interface loopback0',
        'description BGP router-ID (global table)',
        'ip address 172.16.255.2 255.255.255.255',
        'interface gi0/0',
        'no shutdown',
        'interface gi0/0.101',
        'encapsulation dot1Q 101',
        'vrf forwarding UTS',
        `ip address ${JP.uLink}.2 255.255.255.252`,
        'interface gi0/0.102',
        'encapsulation dot1Q 102',
        'vrf forwarding FOIS',
        `ip address ${JP.fLink}.2 255.255.255.252`,
        'interface gi0/1',
        'vrf forwarding UTS',
        `ip address ${JP.uts}.1 255.255.255.0`,
        'no shutdown',
        'interface gi0/2',
        'vrf forwarding FOIS',
        `ip address ${JP.fois}.1 255.255.255.0`,
        'no shutdown',
        'exit',
        `router bgp ${JP.asn}`,
        'address-family ipv4 vrf UTS',
        `neighbor ${JP.uLink}.1 remote-as ${ASN}`,
        `neighbor ${JP.uLink}.1 activate`,
        'redistribute connected',
        'exit-address-family',
        'address-family ipv4 vrf FOIS',
        `neighbor ${JP.fLink}.1 remote-as ${ASN}`,
        `neighbor ${JP.fLink}.1 activate`,
        'redistribute connected',
        'end',
      ],
    },
  });
}
