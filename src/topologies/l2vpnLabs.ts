import { host } from '../engine/testing/fixtures';
import type { Topology } from '../model/types';
import { attach, lo, preconfig } from './bgpLabs';
import { generateJodhpur } from './jodhpur/generate';
import { hostname } from './jodhpur/plan';

/**
 * Starting topologies for the L2VPN / TDM pseudowire labs B7–B8 (P6): pieces
 * of the Jodhpur core with OSPF + LDP running, plus the station equipment that
 * needs a layer-2 or E1 circuit. Teaching design on the track map — not the
 * real RailTel / NWR network. E1 controllers are logical (networking-only mode).
 */

const CONF = ['enable', 'configure terminal'];
/** Teaching subnets that are stretched at layer 2 (outside the routed IP plan). */
export const DL_NET = '10.210.13';
export const CCTV_NET = '10.220.0';

/** LB7.1 — JU, PPR, MTD; central Data Logger server at JU, MTD Data Logger's Ethernet port. */
export function b7Vpws(): Topology {
  let t = generateJodhpur({
    name: 'Lab B7: VPWS for the MTD Data Logger',
    description:
      'JU, PPR and MTD from the J1 core with OSPF and LDP running. The MTD Data Logger must sit in the same LAN as the central server at JU.',
    sections: ['S1'],
    sites: ['JU', 'PPR', 'MTD'],
    level: 'mpls',
  });
  t = attach(t, {
    kind: 'server',
    name: 'JU-DL-SRV',
    station: 'JU',
    near: hostname('JU'),
    nearPort: 'Gi0/3/2',
    port: 'eth0',
    dx: -40,
    dy: 220,
    notes: 'Central Data Logger server (teaching)',
  });
  t = attach(t, {
    kind: 'pc',
    name: 'MTD-DL',
    station: 'MTD',
    near: hostname('MTD'),
    nearPort: 'Gi0/3/2',
    port: 'eth0',
    dx: 40,
    dy: 220,
    notes: 'Ethernet port of the MTD Data Logger (the logger itself is legacy equipment; simulated as a host)',
  });
  t = host(t, 'JU-DL-SRV', `${DL_NET}.10`, `${DL_NET}.1`);
  t = host(t, 'MTD-DL', `${DL_NET}.20`, `${DL_NET}.1`);
  return t;
}

const CAM_SITES = ['MTD', 'DNA', 'FL'] as const;
/** Station LAN port for the camera: Gi0/3/4 on a junction LSR, Gi0/1/4 on a station LER. */
export const camPort = (t: Topology, code: string) => (t.devices.find((d) => d.name === hostname(code))?.kind === 'neon-ler' ? 'Gi0/1/4' : 'Gi0/3/4');

/** LB7.2 — JU, MTD, DNA, FL; NVR at JU, one camera per station, VFI ready on JU. */
export function b7Vpls(): Topology {
  let t = generateJodhpur({
    name: 'Lab B7: VPLS for station CCTV',
    description: 'JU, MTD, DNA and FL with OSPF and LDP running. Cameras at MTD, DNA and FL and the NVR at JU must share one layer-2 segment.',
    sections: ['S1', 'S2', 'S3'],
    sites: ['JU', 'MTD', 'DNA', 'FL'],
    level: 'mpls',
  });
  t = attach(t, { kind: 'nvr', name: 'JU-NVR', station: 'JU', near: hostname('JU'), nearPort: 'Gi0/3/4', port: 'eth0', dx: 0, dy: 220 });
  t = host(t, 'JU-NVR', `${CCTV_NET}.10`, `${CCTV_NET}.1`);
  CAM_SITES.forEach((code, i) => {
    t = attach(t, {
      kind: 'cctv',
      name: `${code}-CAM1`,
      station: code,
      near: hostname(code),
      nearPort: camPort(t, code),
      port: 'eth0',
      dx: 0,
      dy: 220,
    });
    t = host(t, `${code}-CAM1`, `${CCTV_NET}.${21 + i}`, `${CCTV_NET}.1`);
  });
  return preconfig(t, {
    cli: {
      [hostname('JU')]: [
        ...CONF,
        'l2 vfi CCTV manual',
        'vpn id 104',
        ...CAM_SITES.map((c) => `neighbor ${lo(c)} encapsulation mpls`),
        'exit',
        'interface gi0/3/4',
        'description CCTV NVR',
        'xconnect vfi CCTV',
        'no shutdown',
        'end',
      ],
    },
  });
}

/** LB8.1 — MTD, KQW, REN, JAC, DNA; E1 circuits for BPAC (KQW–REN) and section control (MTD–JAC). */
export function b8Tdm(): Topology {
  const t = generateJodhpur({
    name: 'Lab B8: E1 pseudowires for BPAC and control',
    description:
      'MTD–DNA section (S2) with OSPF and LDP running. The BPAC E1 between KQW and REN and the control E1 (timeslots 1–4) between MTD and JAC move from SDH to IP-MPLS. E1 controllers are logical: the TDM equipment behind them is not simulated.',
    sections: ['S2'],
    sites: ['MTD', 'KQW', 'REN', 'JAC', 'DNA'],
    level: 'mpls',
  });
  return preconfig(t, {
    cli: {
      [hostname('KQW')]: [
        ...CONF,
        'controller E1 0/2/0',
        'cem-group 0 unframed',
        'exit',
        'interface CEM0/2/0',
        'cem 0',
        `xconnect ${lo('REN')} 2101 encapsulation mpls`,
        'end',
      ],
      [hostname('MTD')]: [
        ...CONF,
        'controller E1 0/4/0',
        'cem-group 0 timeslots 1-4',
        'exit',
        'interface CEM0/4/0',
        'cem 0',
        `xconnect ${lo('JAC')} 2102 encapsulation mpls`,
        'end',
      ],
    },
  });
}
