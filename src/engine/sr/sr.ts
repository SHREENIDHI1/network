import type { Topology } from '../../model/types';
import type { NetConfig } from '../config/netConfig';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, parseCidr } from '../ip/ipv4';
import { resolve, type Route } from '../ip/routing';
import { prefixKey } from '../mpls/ldp';
import type { OspfResult } from '../ospf/ospf';

/**
 * Segment Routing over MPLS with OSPF (RFC 8402 / 8665), simplified.
 *
 *  - A router runs SR with "segment-routing mpls" (global) and "segment-routing
 *    mpls" under router ospf. Its SRGB defaults to 16000–23999.
 *  - Prefix SIDs come from "connected-prefix-sid-map": a SID is advertised for a
 *    local, up, OSPF prefix; two prefixes with the same index are both rejected.
 *  - Label for prefix P at router R = R's SRGB base + index; the next hop's SRGB
 *    gives the outgoing label; the router just before the owner pops (PHP).
 *  - When LDP has a label for the same prefix, LDP is preferred (IOS default),
 *    so SR takes over once LDP is removed.
 *  - TI-LFA: for each prefix the post-convergence path without the primary link
 *    is computed, and the repair segment list from P-space / Q-space (node SIDs;
 *    adjacency SIDs are shown but not modelled). Convergence after a failure is
 *    instant in this simulator, so TI-LFA is shown as computed protection.
 */

export interface SrSid {
  owner: string;
  network: number;
  prefixLen: number;
  index: number;
}

export interface SrEntry {
  deviceId: string;
  inLabel: number;
  sid: SrSid;
  /** Outgoing label, 'pop' (next hop owns the prefix) or 'none' (next hop does not run SR). */
  out: number | 'pop' | 'none';
  nextHop: number;
  iface: string;
  nextHopDeviceId?: string;
}

export interface TiLfa {
  deviceId: string;
  prefix: string;
  protectedIface: string;
  /** Post-convergence path (device ids) without the protected link. */
  path: string[];
  /** Repair segment list in words, e.g. ["node-SID JU (16001)"]; empty = the next hop is already safe (plain LFA). */
  segments: string[];
  /** Labels pushed for the repair (node SIDs only). */
  labels: number[];
  reason?: string;
}

export interface SrResult {
  routers: Map<string, { base: number; end: number }>;
  sids: SrSid[];
  entries: SrEntry[];
  byInLabel: Map<string, SrEntry>;
  /** "deviceId|net/len" → entry (imposition). */
  byFec: Map<string, SrEntry>;
  /** Interfaces that forward MPLS because SR runs over them ("deviceId|iface"). */
  mplsIfaces: Set<string>;
  tiLfa: TiLfa[];
  problems: Array<{ deviceId: string; text: string }>;
}

export const emptySr = (): SrResult => ({
  routers: new Map(),
  sids: [],
  entries: [],
  byInLabel: new Map(),
  byFec: new Map(),
  mplsIfaces: new Set(),
  tiLfa: [],
  problems: [],
});

export function computeSr(
  topo: Topology,
  configs: Map<string, NetConfig>,
  l3: Map<string, L3Interface[]>,
  routes: Map<string, Route[]>,
  ospf: OspfResult,
): SrResult {
  const res = emptySr();
  const name = (id: string) => topo.devices.find((d) => d.id === id)?.name ?? id;
  for (const d of topo.devices) {
    const c = configs.get(d.id);
    if (!c?.sr?.enabled || !c.ospf?.segmentRouting) continue;
    res.routers.set(d.id, { base: c.sr.srgbBase, end: c.sr.srgbEnd });
    for (const oi of ospf.interfaces) if (oi.deviceId === d.id) res.mplsIfaces.add(`${d.id}|${oi.iface}`);
  }

  // Prefix SIDs: local, up, in OSPF; index conflicts reject both.
  const cand: SrSid[] = [];
  for (const [dev] of res.routers) {
    const c = configs.get(dev)!;
    for (const ps of c.sr!.prefixSids) {
      const cidr = parseCidr(ps.prefix);
      if (!cidr) continue;
      const local = (l3.get(dev) ?? []).find((i) => i.up && i.ip !== undefined && i.network === cidr.network && i.prefixLen === cidr.prefixLen);
      const inOspf = local && ospf.interfaces.some((o) => o.deviceId === dev && o.iface === local.name);
      if (!local || !inOspf) {
        res.problems.push({ deviceId: dev, text: `prefix-SID for ${ps.prefix} not advertised: not a local, up OSPF prefix` });
        continue;
      }
      const size = c.sr!.srgbEnd - c.sr!.srgbBase + 1;
      if (ps.index >= size) {
        res.problems.push({ deviceId: dev, text: `prefix-SID index ${ps.index} for ${ps.prefix} is outside the SRGB` });
        continue;
      }
      cand.push({ owner: dev, network: cidr.network, prefixLen: cidr.prefixLen, index: ps.index });
    }
  }
  for (const s of cand) {
    const clash = cand.filter((x) => x.index === s.index && (x.network !== s.network || x.prefixLen !== s.prefixLen));
    if (clash.length) {
      res.problems.push({
        deviceId: s.owner,
        text: `SID index ${s.index} conflict: ${formatIpv4(s.network)}/${s.prefixLen} (${name(s.owner)}) and ${clash.map((x) => `${formatIpv4(x.network)}/${x.prefixLen} (${name(x.owner)})`).join(', ')} — not used`,
      });
      continue;
    }
    res.sids.push(s);
  }

  const owner = (ip: number) => {
    for (const [dev, ifs] of l3) if (ifs.some((i) => i.ip === ip && i.up)) return dev;
    return undefined;
  };

  for (const [dev, gb] of res.routers) {
    for (const s of res.sids) {
      if (s.owner === dev) continue;
      const g = resolve(routes.get(dev) ?? [], s.network);
      if (!g || g.route.network !== s.network || g.route.prefixLen !== s.prefixLen) continue;
      const nh = owner(g.nextHop);
      const nhSr = nh ? res.routers.get(nh) : undefined;
      const out: SrEntry['out'] = !nhSr ? 'none' : nh === s.owner ? 'pop' : nhSr.base + s.index;
      const e: SrEntry = { deviceId: dev, inLabel: gb.base + s.index, sid: s, out, nextHop: g.nextHop, iface: g.iface, nextHopDeviceId: nh };
      res.entries.push(e);
      res.byInLabel.set(`${dev}|${e.inLabel}`, e);
      res.byFec.set(`${dev}|${prefixKey(s.network, s.prefixLen)}`, e);
    }
  }

  // ---------------------------------------------------------------- TI-LFA
  type Edge = { from: string; to: string; iface: string; cost: number };
  const edges: Edge[] = [];
  for (const n of ospf.neighbors) {
    if (n.state !== 'FULL') continue;
    const cost = ospf.interfaces.find((i) => i.deviceId === n.deviceId && i.iface === n.iface)?.cost ?? 1;
    edges.push({ from: n.deviceId, to: n.neighborDeviceId, iface: n.iface, cost });
  }
  const spf = (src: string, skip?: { dev: string; iface: string; peer: string }, reverse = false) => {
    const dist = new Map<string, number>([[src, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    for (;;) {
      let cur: string | undefined;
      for (const [d, v] of dist) if (!done.has(d) && (cur === undefined || v < dist.get(cur)!)) cur = d;
      if (cur === undefined) break;
      done.add(cur);
      for (const e of edges) {
        const a = reverse ? e.to : e.from;
        const b = reverse ? e.from : e.to;
        if (a !== cur) continue;
        if (skip && ((e.from === skip.dev && e.iface === skip.iface) || (e.from === skip.peer && e.to === skip.dev))) continue;
        const nd = dist.get(cur)! + e.cost;
        if (nd < (dist.get(b) ?? Infinity)) {
          dist.set(b, nd);
          prev.set(b, cur);
        }
      }
    }
    return { dist, prev };
  };
  const nodeSid = (dev: string) => {
    const s = res.sids.find((x) => x.owner === dev && x.prefixLen === 32);
    return s ? { label: (res.routers.get(dev)?.base ?? 16000) + s.index, s } : undefined;
  };
  for (const [dev] of res.routers) {
    if (!configs.get(dev)?.ospf?.tiLfa || !configs.get(dev)?.ospf?.frrPerPrefix) continue;
    const full = spf(dev);
    for (const e of res.entries.filter((x) => x.deviceId === dev && x.out !== 'none')) {
      const dest = e.sid.owner;
      const peer = e.nextHopDeviceId!;
      const skip = { dev, iface: e.iface, peer };
      const prefix = `${formatIpv4(e.sid.network)}/${e.sid.prefixLen}`;
      const post = spf(dev, skip);
      if (!post.dist.has(dest)) {
        res.tiLfa.push({
          deviceId: dev,
          prefix,
          protectedIface: e.iface,
          path: [],
          segments: [],
          labels: [],
          reason: 'no alternate path without this link',
        });
        continue;
      }
      const path = [dest];
      while (path[0] !== dev) path.unshift(post.prev.get(path[0])!);
      const toDestFull = spf(dest, undefined, true).dist;
      const toDestSkip = spf(dest, skip, true).dist;
      const inQ = (x: string) => toDestFull.get(x) === toDestSkip.get(x);
      const inP = (x: string) => full.dist.get(x) === post.dist.get(x);
      const qi = path.findIndex((x, i) => i > 0 && inQ(x));
      const q = path[qi];
      let pi = qi;
      while (pi > 0 && !inP(path[pi])) pi--;
      const p = path[pi];
      const segs: string[] = [];
      const labels: number[] = [];
      if (q !== dest || pi !== qi) {
        if (pi > 0) {
          const ns = nodeSid(p);
          segs.push(ns ? `node-SID ${name(p)} (${ns.label})` : `node-SID ${name(p)} (none configured)`);
          if (ns) labels.push(ns.label);
        }
        if (pi !== qi) segs.push(`adj-SID ${name(p)} → ${name(path[pi + 1])} (adjacency SIDs not modelled)`);
      }
      res.tiLfa.push({ deviceId: dev, prefix, protectedIface: e.iface, path, segments: segs, labels });
    }
  }
  return res;
}
