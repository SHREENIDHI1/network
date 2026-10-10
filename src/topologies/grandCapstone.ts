import { configure, host } from '../engine/testing/fixtures';
import type { Topology } from '../model/types';
import { attach, lo, preconfig, rrLines, vrfLines, vrfNet } from './bgpLabs';
import { j2 } from './jodhpur/generate';
import { hostname } from './jodhpur/plan';
import { NMS_IP, POLL } from './opsLabs';

/**
 * LB15.1 grand capstone (P9): J2 JU–MTD–DNA–FL, every POP, OSPF + LDP running.
 * JU is the VPNv4 route reflector with the UTS server, the divisional NMS and
 * the Data Logger server. Teaching design on the track map — not the real
 * RailTel / NWR network. One inherited fault: KXG-LER lost "mpls ip" towards GOTN.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const FL = hostname('FL');
/** [station code, PE router, UTS port, NMS service name]. */
export const CAP_PES: Array<[string, string, string, string]> = [
  ['MTD', MTD, 'Gi0/3/0', 'UTS MTD → JU'],
  ['DNA', DNA, 'Gi0/3/0', 'UTS DNA → JU'],
  ['FL', FL, 'Gi0/1/0', 'UTS FL → JU'],
];
export const UTS_SRV = `${vrfNet('JU', 'UTS')}.10`;
export const DL_VC = 1301;
export const DL_SERVICE = 'Data Logger MTD ↔ JU (VPWS)';

export function grandCapstone(): Topology {
  let t = j2('mpls');
  t = { ...t, meta: { ...t.meta, name: 'Lab B15: Jodhpur division backbone (grand capstone)' } };
  t = configure(t, hostname('KXG'), (c) => {
    delete c.interfaces['Te0/0/1'].mplsIp;
  });
  t = attach(t, { kind: 'nms', name: 'JU-NMS', station: 'JU', near: JU, nearPort: 'Gi0/3/0', port: 'eth0', dx: -260, dy: 200 });
  t = attach(t, { kind: 'server', name: 'JU-UTS-SRV', station: 'JU', near: JU, nearPort: 'Gi0/3/1', port: 'eth0', dx: -120, dy: 220 });
  t = attach(t, { kind: 'server', name: 'JU-DL-SRV', station: 'JU', near: JU, nearPort: 'Gi0/3/2', port: 'eth0', dx: 20, dy: 220 });
  t = host(t, 'JU-NMS', NMS_IP, '10.80.1.1');
  t = host(t, 'JU-UTS-SRV', UTS_SRV, `${vrfNet('JU', 'UTS')}.1`);
  t = host(t, 'JU-DL-SRV', '10.210.13.10', '10.210.13.1');
  for (const [code, pe, port] of CAP_PES) {
    t = attach(t, { kind: 'uts-prs', name: `${code}-UTS1`, station: code, near: pe, nearPort: port, port: 'eth0', dx: -60, dy: 200 });
    t = host(t, `${code}-UTS1`, `${vrfNet(code, 'UTS')}.11`, `${vrfNet(code, 'UTS')}.1`);
  }
  t = attach(t, { kind: 'pc', name: 'MTD-DL', station: 'MTD', near: MTD, nearPort: 'Gi0/3/2', port: 'eth0', dx: 80, dy: 200 });
  t = host(t, 'MTD-DL', '10.210.13.20', '10.210.13.1');
  t = configure(t, 'JU-NMS', (c) => {
    c.nms = {
      pollCommunity: POLL,
      services: [
        ...CAP_PES.map(([code, , , name]) => ({
          name,
          kind: 'path' as const,
          src: `${code}-UTS1`,
          dst: UTS_SRV,
        })),
        { name: DL_SERVICE, kind: 'pw' as const, a: MTD, vcId: DL_VC, safety: true },
      ],
    };
  });
  return preconfig(t, {
    cli: {
      [JU]: [
        ...CONF,
        'interface gi0/3/0',
        'description Divisional NMS LAN',
        'ip address 10.80.1.1 255.255.255.0',
        'no shutdown',
        'exit',
        ...vrfLines('JU', 'UTS'),
        'interface gi0/3/1',
        'vrf forwarding UTS',
        `ip address ${vrfNet('JU', 'UTS')}.1 255.255.255.0`,
        'no shutdown',
        'interface gi0/3/2',
        'description Data Logger (VPWS to MTD)',
        `xconnect ${lo('MTD')} ${DL_VC} encapsulation mpls`,
        'no shutdown',
        'exit',
        'router ospf 1',
        'network 10.80.1.0 0.0.0.255 area 0',
        'exit',
        'ntp master 3',
        ...rrLines(['MTD', 'DNA', 'FL']),
        'address-family ipv4 vrf UTS',
        'redistribute connected',
        'end',
      ],
      // PEs: station ports are cabled and enabled; the PE side is the learner's job.
      ...Object.fromEntries(CAP_PES.map(([, pe, port]) => [pe, [...CONF, `interface ${port}`, 'no shutdown', 'end']])),
      [MTD]: [...CONF, 'interface gi0/3/0', 'no shutdown', 'interface gi0/3/2', 'description Data Logger', 'no shutdown', 'end'],
    },
  });
}
