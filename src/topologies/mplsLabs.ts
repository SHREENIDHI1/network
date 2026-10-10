import { configure } from '../engine/testing/fixtures';
import type { Topology } from '../model/types';
import { JODHPUR, type JodhpurData } from './data/jodhpur';
import { generateJodhpur, j1Core, j2 } from './jodhpur/generate';
import { hostname, ipPlan } from './jodhpur/plan';

/**
 * Starting topologies for the IP-MPLS labs B1–B4 (P4), cut from the
 * generated Jodhpur division topologies. Teaching design on the track map.
 */

/** Jodhpur data with only the first `n` stops of one section. */
function slice(sectionId: string, n: number): JodhpurData {
  const sec = JODHPUR.sections.find((s) => s.id === sectionId)!;
  return { ...JODHPUR, sections: [{ ...sec, stops: sec.stops.slice(0, n) }] };
}

export const loopbackOf = (code: string) => ipPlan().loopbacks.get(code)!;

/** LB1.1 — JU, RKB, BNO, JWL on the S1 trunk; BNO-LER is factory default. */
export function b1Station(): Topology {
  const d = slice('S1', 4);
  let t = generateJodhpur({
    name: 'Lab B1: commission BNO-LER',
    description:
      'First four POPs of the JU–MTD trunk. JU, RKB and JWL routers are addressed per the division IP plan; the new BNO station router is factory default.',
    sections: ['S1'],
    level: 'ip',
    d,
  });
  t = configure(t, hostname('BNO', d), (c) => {
    c.interfaces = {};
  });
  return t;
}

const WEST = ['LN', 'SMR', 'BME', 'MJ', 'BLDI'];

/** LB2.1 — J1 core with OSPF everywhere except the West / LN side. */
export function b2Core(): Topology {
  let t = j1Core('ospf');
  for (const code of WEST) t = configure(t, hostname(code), (c) => delete c.ospf);
  return { ...t, meta: { ...t.meta, name: 'Lab B2: IGP for the J1 core' } };
}

/** LB3.1 — J1 core with OSPF converged, no MPLS yet. */
export function b3Core(): Topology {
  const t = j1Core('ospf');
  return { ...t, meta: { ...t.meta, name: 'Lab B3: first LSP JU → DNA' } };
}

/** LB4.1 — J2 with MPLS/LDP and two field faults already present. */
export function b4J2(): Topology {
  let t = j2('mpls');
  // Fault 1: GOTN-LER lost "mpls ip" on its link towards JOM (second core port).
  t = configure(t, hostname('GOTN'), (c) => {
    delete c.interfaces['Te0/0/1'].mplsIp;
  });
  // Fault 2: KQW-LER's loopback is not advertised in OSPF → its LDP router-ID is unreachable.
  t = configure(t, hostname('KQW'), (c) => {
    c.ospf!.networks = c.ospf!.networks.filter((n) => n.address !== loopbackOf('KQW'));
  });
  return { ...t, meta: { ...t.meta, name: 'Lab B4: LDP troubleshooting on J2' } };
}
