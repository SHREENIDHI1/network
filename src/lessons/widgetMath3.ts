import { defaultNetConfig } from '../engine/config/netConfig';
import type { Ipv4Packet } from '../engine/core/types';
import { inSubnet, parseCidr, parseIpv4 } from '../engine/ip/ipv4';
import { allocate } from '../engine/qos/analysis';
import { evaluateAcl, parseAclLine, type AclKind } from '../engine/security/acl';

/** Maths behind the P3 lesson widgets. Reuses engine code where it exists so lessons and simulator agree. */

// ---------------------------------------------------------------- A9: LPM
export interface RouteRow {
  prefix: string;
  via: string;
  ad: number;
  metric: number;
}

/** Longest-prefix match, then lowest AD, then lowest metric. */
export function lpmPick(routes: RouteRow[], dst: string): { index: number; reason: string } | null {
  const d = parseIpv4(dst);
  if (d === null) return null;
  let best = -1;
  let reason = '';
  routes.forEach((r, i) => {
    const c = parseCidr(r.prefix);
    if (!c || !inSubnet(d, c.network, c.prefixLen)) return;
    if (best < 0) {
      best = i;
      reason = 'only matching route so far';
      return;
    }
    const b = parseCidr(routes[best].prefix)!;
    if (c.prefixLen > b.prefixLen) {
      best = i;
      reason = `longer prefix /${c.prefixLen} beats /${b.prefixLen}`;
    } else if (c.prefixLen === b.prefixLen && r.ad < routes[best].ad) {
      best = i;
      reason = `same prefix length — lower administrative distance ${r.ad} wins`;
    } else if (c.prefixLen === b.prefixLen && r.ad === routes[best].ad && r.metric < routes[best].metric) {
      best = i;
      reason = `same prefix and AD — lower metric ${r.metric} wins`;
    }
  });
  return best < 0 ? null : { index: best, reason: reason || 'longest matching prefix' };
}

// ---------------------------------------------------------------- A10: SPF
export interface Edge {
  a: string;
  b: string;
  cost: number;
}

/** Dijkstra from `root`; returns distance, previous hop and the order nodes were settled. */
export function spf(
  nodes: string[],
  edges: Edge[],
  root: string,
): { dist: Record<string, number>; prev: Record<string, string | undefined>; order: string[] } {
  const dist: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, Infinity]));
  const prev: Record<string, string | undefined> = {};
  const done = new Set<string>();
  const order: string[] = [];
  dist[root] = 0;
  for (;;) {
    let u: string | undefined;
    for (const n of nodes) if (!done.has(n) && dist[n] < Infinity && (u === undefined || dist[n] < dist[u])) u = n;
    if (u === undefined) break;
    done.add(u);
    order.push(u);
    for (const e of edges) {
      const v = e.a === u ? e.b : e.b === u ? e.a : undefined;
      if (!v || done.has(v) || e.cost <= 0) continue;
      if (dist[u] + e.cost < dist[v]) {
        dist[v] = dist[u] + e.cost;
        prev[v] = u;
      }
    }
  }
  return { dist, prev, order };
}

/** Path root → target following prev pointers. */
export function pathTo(prev: Record<string, string | undefined>, root: string, target: string): string[] {
  const p = [target];
  let cur = target;
  for (let i = 0; i < 64 && cur !== root; i++) {
    const n = prev[cur];
    if (!n) return [];
    p.unshift(n);
    cur = n;
  }
  return p;
}

// ---------------------------------------------------------------- A13: HSRP
export interface HsrpRouter {
  name: string;
  priority: number;
  up: boolean;
  /** Tracked uplink down → priority decremented by `decrement`. */
  trackDown?: boolean;
  decrement?: number;
  /** Interface IP for the tie-break (highest wins). */
  ip: string;
}

export function hsrpElect(
  routers: HsrpRouter[],
  preempt: boolean,
  currentActive?: string,
): { active?: string; standby?: string; effective: Record<string, number> } {
  const eff: Record<string, number> = {};
  for (const r of routers) eff[r.name] = Math.max(0, r.priority - (r.trackDown ? (r.decrement ?? 10) : 0));
  const alive = routers.filter((r) => r.up);
  const rank = [...alive].sort((a, b) => eff[b.name] - eff[a.name] || (parseIpv4(b.ip) ?? 0) - (parseIpv4(a.ip) ?? 0));
  let active = rank[0]?.name;
  // Without preempt, a still-alive Active keeps its role even if someone better appears.
  if (!preempt && currentActive && alive.some((r) => r.name === currentActive)) active = currentActive;
  const standby = rank.find((r) => r.name !== active)?.name;
  return { active, standby, effective: eff };
}

// ---------------------------------------------------------------- A12: ACL
export interface TestPacket {
  protocol: 'icmp' | 'udp' | 'tcp';
  src: string;
  dst: string;
  dstPort?: number;
}

/** Evaluates ACL lines (as typed after "access-list N") against a packet, first match wins. */
export function aclEvaluate(
  kind: AclKind,
  lines: string[],
  p: TestPacket,
): { verdict: 'permit' | 'deny'; line?: number; implicit: boolean; error?: string } {
  const entries = [];
  for (const [i, l] of lines.entries()) {
    if (!l.trim()) continue;
    const e = parseAclLine(kind, l.trim().split(/\s+/));
    if (typeof e === 'string') return { verdict: 'deny', implicit: false, error: `Line ${i + 1}: ${e}` };
    entries.push(e);
  }
  const src = parseIpv4(p.src);
  const dst = parseIpv4(p.dst);
  if (src === null || dst === null) return { verdict: 'deny', implicit: false, error: 'Invalid packet address' };
  const pkt: Ipv4Packet = {
    kind: 'ipv4',
    src,
    dst,
    ttl: 64,
    dscp: 0,
    protocol: p.protocol,
    icmp: p.protocol === 'icmp' ? { type: 'echo-request', id: 1, seq: 1 } : undefined,
    udp: p.protocol === 'udp' ? { srcPort: 50000, dstPort: p.dstPort ?? 0 } : undefined,
    tcp: p.protocol === 'tcp' ? { srcPort: 50000, dstPort: p.dstPort ?? 0, flags: 'SYN', id: 1 } : undefined,
    sizeBytes: 64,
  };
  const v = evaluateAcl({ kind, entries }, pkt);
  return { verdict: v.permit ? 'permit' : 'deny', line: v.index >= 0 ? v.index + 1 : undefined, implicit: v.index < 0 };
}

// ---------------------------------------------------------------- A14: queues
export interface QueueFlow {
  name: string;
  rateMbps: number;
  dscp: number;
}
export interface QueueClassCfg {
  name: string;
  dscp: number[];
  priorityPercent?: number;
  bandwidthPercent?: number;
}

/** One congested link: FIFO, or LLQ/CBWFQ classes (same allocator the simulator uses). */
export function queueSim(
  capacityMbps: number,
  flows: QueueFlow[],
  classes: QueueClassCfg[] | null,
): Array<{ name: string; deliveredMbps: number; lossPct: number }> {
  const cfg = defaultNetConfig('router');
  let policy: string | undefined;
  if (classes && classes.length) {
    policy = 'WIDGET';
    cfg.qos.policyMaps[policy] = { classes: [] };
    for (const c of classes) {
      cfg.qos.classMaps[c.name] = { matchAll: false, dscp: c.dscp };
      cfg.qos.policyMaps[policy].classes.push({ name: c.name, priorityPercent: c.priorityPercent, bandwidthPercent: c.bandwidthPercent });
    }
  }
  const r = allocate(
    capacityMbps,
    flows.map((f, i) => ({ flow: i, hop: 0, rate: f.rateMbps, dscp: f.dscp })),
    cfg,
    policy,
  );
  return flows.map((f, i) => ({
    name: f.name,
    deliveredMbps: r.delivered[i],
    lossPct: f.rateMbps > 0 ? (1 - r.delivered[i] / f.rateMbps) * 100 : 0,
  }));
}
