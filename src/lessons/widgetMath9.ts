import { pickSeeded } from '../labs/framework/tickets';

/** Maths behind the P9 (Segment Routing, grand capstone) lesson widgets. */

// ------------------------------------------------- B14: SID → label

export function srLabel(base: number, end: number, index: number): { label: number } | { error: string } {
  if (!Number.isInteger(base) || !Number.isInteger(end) || !Number.isInteger(index)) return { error: 'whole numbers only' };
  if (end < base) return { error: 'SRGB end is below its base' };
  if (index < 0) return { error: 'index cannot be negative' };
  const label = base + index;
  return label > end ? { error: `index ${index} is outside the SRGB (${end - base + 1} labels: index 0–${end - base})` } : { label };
}

// ------------------------------------------------- B14: TI-LFA on the ring

export type Edge = [string, string, number];

function dijkstra(edges: Edge[], src: string): Map<string, number> {
  const d = new Map<string, number>([[src, 0]]);
  const done = new Set<string>();
  for (;;) {
    let u: string | undefined;
    for (const [n, v] of d) if (!done.has(n) && (u === undefined || v < d.get(u)!)) u = n;
    if (u === undefined) return d;
    done.add(u);
    for (const [a, b, c] of edges) {
      const v = a === u ? b : b === u ? a : undefined;
      if (v !== undefined && d.get(u)! + c < (d.get(v) ?? Infinity)) d.set(v, d.get(u)! + c);
    }
  }
}

function path(edges: Edge[], src: string, dst: string): string[] | null {
  const dist = dijkstra(edges, dst);
  if (!dist.has(src)) return null;
  const p = [src];
  while (p[p.length - 1] !== dst) {
    const u = p[p.length - 1];
    const next = edges
      .map(([a, b, c]): [string, number] | null => (a === u ? [b, c] : b === u ? [a, c] : null))
      .filter((x): x is [string, number] => x !== null && dist.get(x[0]) !== undefined && dist.get(x[0])! + x[1] === dist.get(u))
      .map((x) => x[0])
      .sort()[0];
    p.push(next);
  }
  return p;
}

export interface TiLfaView {
  primary: string[];
  protectedLink: string;
  post: string[] | null;
  pSpace: string[];
  qSpace: string[];
  segments: string[];
}

/** TI-LFA at `src` for prefix `dst`: protect the first link of the primary path (link protection, node-SIDs + one adj-SID). */
export function tiLfa(edges: Edge[], src: string, dst: string, sid: (n: string) => number): TiLfaView | null {
  const primary = path(edges, src, dst);
  if (!primary || primary.length < 2) return null;
  const [x, y] = [primary[0], primary[1]];
  const cut = edges.filter(([a, b]) => !((a === x && b === y) || (a === y && b === x)));
  const nodes = [...new Set(edges.flatMap(([a, b]) => [a, b]))].sort();
  const all = dijkstra(edges, src);
  const allCut = dijkstra(cut, src);
  const pSpace = nodes.filter((n) => n !== src && all.get(n) === allCut.get(n));
  const toDst = dijkstra(edges, dst);
  const toDstCut = dijkstra(cut, dst);
  const qSpace = nodes.filter((n) => toDst.get(n) === toDstCut.get(n));
  const post = path(cut, src, dst);
  const segments: string[] = [];
  if (post) {
    let pi = 0;
    while (pi + 1 < post.length && pSpace.includes(post[pi + 1])) pi++;
    let qi = pi;
    while (qi < post.length && !qSpace.includes(post[qi])) qi++;
    if (pi > 0) segments.push(`node-SID ${post[pi]} (${sid(post[pi])})`);
    if (qi > pi) segments.push(`adj-SID ${post[pi]} → ${post[pi + 1]}`);
    if (qi > pi + 1) segments.push(`… more segments to reach ${post[qi]}`);
  }
  return { primary, protectedLink: `${x}–${y}`, post, pSpace, qSpace, segments };
}

export const ringEdges = (lease: number): Edge[] => [
  ['JU', 'PPR', 10],
  ['PPR', 'MTD', 10],
  ['MTD', 'DNA', 10],
  ['DNA', 'JU', lease],
];
export const RING_SID: Record<string, number> = { JU: 16001, PPR: 16002, MTD: 16003, DNA: 16004 };

// ------------------------------------------------- B15: seeded ticket draw

/** Short names of the LB15.1 fault catalog, in catalog order (kept in step with the lab by a test). */
export const GRAND_TICKET_TITLES = [
  'MTD lost LDP towards JOM',
  'DNA VRF UTS imports the wrong RT',
  'OSPF hello mismatch PPR–SWF',
  'IP MTU mismatch DNA–GCH',
  'BOW core port shut down',
  'Power failure at SBR',
  'Line card failure at JWL',
  'Data Logger VC-ID mismatch',
  'Data Logger MTU mismatch',
  'SNMP community removed on DNA',
  'SNMP community typo on GCH',
  'FL no longer an RR client',
  'DNA BGP update-source removed',
  'MTD UTS port left VRF UTS',
  'FL loopback not in OSPF',
  'FL BGP remote-as typo',
  'MTD syslog host removed',
  'ACL on the JU UTS server port',
  'Wrong gateway on DNA-UTS1',
  'Passive interface on RKB',
  'Duplex mismatch at FL counter',
  'NMS LAN missing from OSPF',
  'DNA lost LDP towards GCH',
];

export const drawTickets = (seed: number, n = 10) =>
  pickSeeded(
    GRAND_TICKET_TITLES.map((t, i) => ({ n: i + 1, t })),
    n,
    seed,
  );
