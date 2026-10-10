/** Maths behind the P7 (MPLS QoS / TE) lesson widgets. */

// ------------------------------------------------------ B9: DSCP → EXP

/** Default EXP at label imposition = IP precedence (top 3 bits of DSCP). */
export function dscpToExp(dscp: number): number | string {
  if (!Number.isInteger(dscp) || dscp < 0 || dscp > 63) return 'DSCP must be 0 – 63.';
  return dscp >> 3;
}

/** 6-bit DSCP and 3-bit EXP as binary strings, e.g. 46 → "101110", "101". */
export function expBits(dscp: number): { dscp: string; exp: string } | string {
  const e = dscpToExp(dscp);
  if (typeof e === 'string') return e;
  return { dscp: dscp.toString(2).padStart(6, '0'), exp: e.toString(2).padStart(3, '0') };
}

// ----------------------------------------------------------- B10: CSPF

export interface TeEdge {
  a: string;
  b: string;
  cost: number;
  /** Unreserved bandwidth (Mbit/s), same both ways in this widget. */
  freeMbps: number;
}

/** Constrained SPF: prune links with less than `bw` free, then shortest cost path; null if none. */
export function cspf(edges: TeEdge[], from: string, to: string, bw: number): { path: string[]; cost: number; pruned: string[] } | null {
  const usable = edges.filter((e) => e.freeMbps >= bw);
  const pruned = edges.filter((e) => e.freeMbps < bw).map((e) => `${e.a}–${e.b}`);
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    for (const [n, d] of dist) if (!done.has(n) && (cur === undefined || d < dist.get(cur)!)) cur = n;
    if (cur === undefined || cur === to) break;
    done.add(cur);
    for (const e of usable) {
      const other = e.a === cur ? e.b : e.b === cur ? e.a : undefined;
      if (!other || done.has(other)) continue;
      const nd = dist.get(cur)! + e.cost;
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        prev.set(other, cur);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return { path, cost: dist.get(to)!, pruned };
}
