import type { Topology } from '../model/types';
import { buildTopology } from './builder';

/**
 * Networking-only demo: a small station LAN at GOTN with application end
 * devices, an L3 distribution switch, an LER uplink and a fibre span to a
 * junction LSR at MTD. Span length is illustrative, not a surveyed distance.
 */
export function demoNetworking(): Topology {
  return buildTopology(
    'Demo: GOTN station LAN + MPLS uplink',
    'Station LAN at GOTN (UTS, FOIS, IP phone, CCTV, Wi-Fi) on an access switch, an L3 switch for inter-VLAN routing, an LER as the station PE router and a 10G fibre uplink to the MTD junction LSR. Span length is illustrative.',
    [
      { key: 'lsr', kind: 'lsr', name: 'MTD-LSR', station: 'MTD', x: 620, y: 40 },
      { key: 'ler', kind: 'ler', name: 'GOTN-LER', station: 'GOTN', x: 320, y: 40 },
      { key: 'l3', kind: 'l3-switch', name: 'GOTN-L3SW', station: 'GOTN', x: 320, y: 200 },
      { key: 'sw', kind: 'l2-switch', name: 'GOTN-SW1', station: 'GOTN', x: 320, y: 360 },
      { key: 'uts', kind: 'uts-prs', name: 'GOTN-UTS1', station: 'GOTN', x: 0, y: 520 },
      { key: 'fois', kind: 'fois', name: 'GOTN-FOIS1', station: 'GOTN', x: 180, y: 520 },
      { key: 'ph', kind: 'ip-phone', name: 'GOTN-SM-PHONE', station: 'GOTN', x: 360, y: 520 },
      { key: 'cam', kind: 'cctv', name: 'GOTN-CAM1', station: 'GOTN', x: 540, y: 520 },
      { key: 'ap', kind: 'wifi-ap', name: 'GOTN-AP1', station: 'GOTN', x: 720, y: 520 },
    ],
    [
      { kind: 'ofc', a: ['ler', 'Te0/1/0'], b: ['lsr', 'Te0/0/0'], lengthKm: 18, label: 'GOTN–MTD (illustrative)' },
      { kind: 'sfp-10g', a: ['ler', 'Te0/1/1'], b: ['l3', 'Te1/1/1'] },
      { kind: 'sfp-1g', a: ['l3', 'Te1/1/2'], b: ['sw', 'Gi0/25'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['uts', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['fois', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['ph', 'LAN'] },
      { kind: 'cat6', a: ['sw', 'Gi0/4'], b: ['cam', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/5'], b: ['ap', 'eth0'] },
    ],
  );
}
