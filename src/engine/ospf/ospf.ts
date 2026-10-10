import type { Device, Topology } from '../../model/types';
import { roleOf, type NetConfig } from '../config/netConfig';
import type { Segment } from '../ethernet/segments';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { routesPackets, type Route } from '../ip/routing';
import { portKey, type PhysicalState } from '../physical/linkState';

/**
 * OSPFv2 (RFC 2328), simplified.
 *
 * The simulator computes the converged OSPF state directly from the topology
 * and configuration instead of exchanging Hello/DBD/LSU packets with timers:
 * neighbour formation and its failure reasons (area, subnet, hello/dead,
 * duplicate router-id, MTU), DR/BDR election, per-area Dijkstra SPF over
 * router and transit-network nodes, inter-area summaries via ABRs (O IA),
 * and external type-2 routes from ASBRs (default-information originate,
 * redistribute static). See Model Limitations.
 */

export type OspfNbrState = 'FULL' | '2WAY' | 'EXSTART';
export type DrRole = 'DR' | 'BDR' | 'DROTHER';

export interface OspfInterface {
  deviceId: string;
  iface: string;
  area: number;
  ip: number;
  network: number;
  prefixLen: number;
  cost: number;
  passive: boolean;
  hello: number;
  dead: number;
  priority: number;
  mtu: number;
  segmentId: number;
  role: DrRole;
  /** Neighbour count (all states) on this interface. */
  neighbors: number;
  fullNeighbors: number;
}

export interface OspfNeighbor {
  deviceId: string;
  iface: string;
  neighborDeviceId: string;
  neighborRid: number;
  neighborIp: number;
  neighborPriority: number;
  neighborRole: DrRole;
  state: OspfNbrState;
  area: number;
}

export interface OspfProblem {
  deviceId: string;
  iface?: string;
  text: string;
}

export interface OspfLsaSummary {
  type: 'router' | 'network' | 'summary' | 'external';
  area?: number;
  linkId: number;
  advRouter: number;
  detail: string;
}

export interface OspfResult {
  routerIds: Map<string, number>;
  interfaces: OspfInterface[];
  neighbors: OspfNeighbor[];
  routes: Map<string, Route[]>;
  problems: OspfProblem[];
  lsdb: OspfLsaSummary[];
  abrs: Set<string>;
  asbrs: Set<string>;
}

export const OSPF_AD = 110;
const DEFAULT_HELLO = 10;
const DEFAULT_DEAD = 40;
const SVI_BW_MBPS = 1000;

interface Path {
  nextHop: number;
  iface: string;
}

interface PrefixEntry {
  network: number;
  prefixLen: number;
  cost: number;
  paths: Path[];
}

function wildcardMatch(ip: number, address: string, wildcard: string): { ok: boolean; specificity: number } {
  const a = parseIpv4(address);
  const w = parseIpv4(wildcard);
  if (a === null || w === null) return { ok: false, specificity: -1 };
  const care = ~w >>> 0;
  let bits = 0;
  for (let i = 0; i < 32; i++) if ((care >>> i) & 1) bits++;
  return { ok: ((ip & care) >>> 0) === ((a & care) >>> 0), specificity: bits };
}

const pKey = (n: number, l: number) => `${n}/${l}`;

function mergePaths(a: Path[], b: Path[]): Path[] {
  const out = [...a];
  for (const p of b) if (!out.some((x) => x.nextHop === p.nextHop && x.iface === p.iface)) out.push(p);
  return out.slice(0, 4); // IOS default maximum-paths 4
}

export function computeOspf(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  l3: ReadonlyMap<string, L3Interface[]>,
  phys: PhysicalState,
  segments: Segment[],
  /** Routing tables without OSPF (connected + static), to decide default-information originate. */
  baseRoutes: ReadonlyMap<string, Route[]>,
): OspfResult {
  const result: OspfResult = {
    routerIds: new Map(),
    interfaces: [],
    neighbors: [],
    routes: new Map(),
    problems: [],
    lsdb: [],
    abrs: new Set(),
    asbrs: new Set(),
  };
  const segOf = new Map<string, number>();
  for (const s of segments) for (const m of s.members) segOf.set(`${m.deviceId}|${m.iface}`, s.id);

  // ---------------------------------------------------------------- 1. interfaces + router IDs
  const routers: Device[] = [];
  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg?.ospf || !routesPackets(d.kind, cfg) || roleOf(d.kind) === 'opaque') continue;
    const ifs = (l3.get(d.id) ?? []).filter((i) => i.up && i.ip !== undefined);
    let rid = cfg.ospf.routerId ? parseIpv4(cfg.ospf.routerId) : null;
    // IOS: highest loopback address first, else highest address of an up interface.
    const loops = ifs.filter((i) => i.kind === 'loop');
    if (rid === null && ifs.length) rid = Math.max(...(loops.length ? loops : ifs).map((i) => i.ip!));
    if (rid === null) {
      result.problems.push({ deviceId: d.id, text: '%OSPF-4-NORTRID: OSPF process cannot pick a router-id (no up interface with an IP address).' });
      continue;
    }
    result.routerIds.set(d.id, rid);
    routers.push(d);
    for (const i of ifs) {
      let best: { area: number; spec: number } | undefined;
      for (const n of cfg.ospf.networks) {
        const m = wildcardMatch(i.ip!, n.address, n.wildcard);
        if (m.ok && (!best || m.specificity > best.spec)) best = { area: n.area, spec: m.specificity };
      }
      if (!best) continue;
      const ic = cfg.interfaces[i.name];
      const portForBw = i.kind === 'svi' || i.kind === 'loop' ? undefined : i.port;
      const loop = i.kind === 'loop';
      const bwMbps = portForBw ? (phys.ports.get(portKey(d.id, portForBw))?.speedGbps ?? 1) * 1000 : SVI_BW_MBPS;
      result.interfaces.push({
        deviceId: d.id,
        iface: i.name,
        area: best.area,
        ip: i.ip!,
        // OSPF advertises a loopback as a /32 host route with cost 1 (IOS default network type LOOPBACK).
        network: loop ? i.ip! : i.network!,
        prefixLen: loop ? 32 : i.prefixLen!,
        cost: ic?.ospfCost ?? (loop ? 1 : Math.max(1, Math.floor(cfg.ospf.referenceBandwidth / Math.max(bwMbps, 0.001)))),
        passive: loop || cfg.ospf.passive.includes(i.name),
        hello: ic?.ospfHello ?? DEFAULT_HELLO,
        dead: ic?.ospfDead ?? (ic?.ospfHello ? ic.ospfHello * 4 : DEFAULT_DEAD),
        priority: ic?.ospfPriority ?? 1,
        mtu: ic?.mtu ?? 1500,
        segmentId: segOf.get(`${d.id}|${i.name}`) ?? -1,
        role: 'DROTHER',
        neighbors: 0,
        fullNeighbors: 0,
      });
    }
  }
  const rid = (devId: string) => result.routerIds.get(devId)!;

  // Duplicate router IDs.
  const byRid = new Map<number, string[]>();
  for (const [dev, r] of result.routerIds) byRid.set(r, [...(byRid.get(r) ?? []), dev]);
  for (const [r, devs] of byRid)
    if (devs.length > 1)
      for (const d of devs) result.problems.push({ deviceId: d, text: `%OSPF-4-DUP_RTRID: Detected router with duplicate router ID ${formatIpv4(r)}.` });

  // ---------------------------------------------------------------- 2. neighbours + DR/BDR
  const bySeg = new Map<number, OspfInterface[]>();
  for (const oi of result.interfaces) if (!oi.passive && oi.segmentId >= 0) bySeg.set(oi.segmentId, [...(bySeg.get(oi.segmentId) ?? []), oi]);

  type Cand = { a: OspfInterface; b: OspfInterface; mtuMismatch: boolean };
  const candidates: Cand[] = [];
  for (const [, ois] of bySeg) {
    for (let i = 0; i < ois.length; i++)
      for (let j = i + 1; j < ois.length; j++) {
        const a = ois[i];
        const b = ois[j];
        if (a.deviceId === b.deviceId) continue;
        const why =
          a.area !== b.area
            ? `area mismatch (area ${a.area} vs ${b.area})`
            : a.network !== b.network || a.prefixLen !== b.prefixLen
              ? 'subnet/mask mismatch'
              : a.hello !== b.hello || a.dead !== b.dead
                ? `hello/dead mismatch (${a.hello}/${a.dead} vs ${b.hello}/${b.dead})`
                : rid(a.deviceId) === rid(b.deviceId)
                  ? 'duplicate router ID'
                  : undefined;
        if (why) {
          result.problems.push({ deviceId: a.deviceId, iface: a.iface, text: `No adjacency with ${formatIpv4(b.ip)}: ${why}.` });
          result.problems.push({ deviceId: b.deviceId, iface: b.iface, text: `No adjacency with ${formatIpv4(a.ip)}: ${why}.` });
          continue;
        }
        candidates.push({ a, b, mtuMismatch: a.mtu !== b.mtu });
        if (a.mtu !== b.mtu) {
          result.problems.push({ deviceId: a.deviceId, iface: a.iface, text: `Neighbor ${formatIpv4(b.ip)} stuck in EXSTART: MTU mismatch (${a.mtu} vs ${b.mtu}).` });
          result.problems.push({ deviceId: b.deviceId, iface: b.iface, text: `Neighbor ${formatIpv4(a.ip)} stuck in EXSTART: MTU mismatch (${b.mtu} vs ${a.mtu}).` });
        }
      }
  }

  // DR/BDR election per segment among interfaces that see at least one neighbour.
  for (const [, ois] of bySeg) {
    const active = ois.filter((o) => candidates.some((c) => c.a === o || c.b === o));
    const pool = (active.length ? active : ois).filter((o) => o.priority > 0);
    pool.sort((x, y) => y.priority - x.priority || rid(y.deviceId) - rid(x.deviceId));
    if (pool[0]) pool[0].role = 'DR';
    if (pool[1] && active.length) pool[1].role = 'BDR';
  }

  for (const c of candidates) {
    const state: OspfNbrState = c.mtuMismatch ? 'EXSTART' : c.a.role !== 'DROTHER' || c.b.role !== 'DROTHER' ? 'FULL' : '2WAY';
    for (const [x, y] of [
      [c.a, c.b],
      [c.b, c.a],
    ] as const) {
      result.neighbors.push({
        deviceId: x.deviceId,
        iface: x.iface,
        neighborDeviceId: y.deviceId,
        neighborRid: rid(y.deviceId),
        neighborIp: y.ip,
        neighborPriority: y.priority,
        neighborRole: y.role,
        state,
        area: x.area,
      });
      x.neighbors++;
      if (state === 'FULL') x.fullNeighbors++;
    }
  }

  // ---------------------------------------------------------------- 3. per-area graph
  const areas = [...new Set(result.interfaces.map((o) => o.area))];
  const full = result.neighbors.filter((n) => n.state === 'FULL');

  interface AreaGraph {
    /** router devId -> list of transit segment attachments */
    attach: Map<string, Array<{ seg: number; iface: OspfInterface }>>;
    /** transit segment -> attached interfaces */
    transit: Map<number, OspfInterface[]>;
    stubs: Map<string, Array<{ network: number; prefixLen: number; cost: number }>>;
  }

  const graphs = new Map<number, AreaGraph>();
  for (const area of areas) {
    const g: AreaGraph = { attach: new Map(), transit: new Map(), stubs: new Map() };
    for (const oi of result.interfaces.filter((o) => o.area === area)) {
      const hasFull = full.some((n) => n.deviceId === oi.deviceId && n.iface === oi.iface);
      if (hasFull) {
        g.attach.set(oi.deviceId, [...(g.attach.get(oi.deviceId) ?? []), { seg: oi.segmentId, iface: oi }]);
        g.transit.set(oi.segmentId, [...(g.transit.get(oi.segmentId) ?? []), oi]);
      } else {
        g.stubs.set(oi.deviceId, [...(g.stubs.get(oi.deviceId) ?? []), { network: oi.network, prefixLen: oi.prefixLen, cost: oi.cost }]);
      }
      if (!g.attach.has(oi.deviceId)) g.attach.set(oi.deviceId, g.attach.get(oi.deviceId) ?? []);
    }
    graphs.set(area, g);

    // LSDB summary for "show ip ospf database".
    for (const devId of g.attach.keys()) {
      const links = (g.attach.get(devId)?.length ?? 0) + (g.stubs.get(devId)?.length ?? 0);
      result.lsdb.push({ type: 'router', area, linkId: rid(devId), advRouter: rid(devId), detail: `${links} link(s)` });
    }
    for (const [seg, ois] of g.transit) {
      const dr = ois.find((o) => o.role === 'DR') ?? ois[0];
      result.lsdb.push({ type: 'network', area, linkId: dr.ip, advRouter: rid(dr.deviceId), detail: `segment ${seg}, ${ois.length} attached router(s)` });
    }
  }

  // ---------------------------------------------------------------- 4. SPF
  interface SpfOut {
    routerDist: Map<string, { cost: number; paths: Path[] }>;
    prefixes: Map<string, PrefixEntry>;
  }
  const spf = new Map<string, SpfOut>(); // `${dev}|${area}`

  for (const area of areas) {
    const g = graphs.get(area)!;
    for (const root of g.attach.keys()) {
      const dist = new Map<string, number>();
      const hops = new Map<string, Path[]>();
      const done = new Set<string>();
      const rootKey = `r:${root}`;
      dist.set(rootKey, 0);
      hops.set(rootKey, []);
      for (;;) {
        let u: string | undefined;
        for (const [k, v] of dist) if (!done.has(k) && (u === undefined || v < dist.get(u)!)) u = k;
        if (u === undefined) break;
        done.add(u);
        const du = dist.get(u)!;
        const edges: Array<{ to: string; cost: number; via?: Path }> = [];
        if (u.startsWith('r:')) {
          const dev = u.slice(2);
          for (const a of g.attach.get(dev) ?? []) {
            edges.push({ to: `n:${a.seg}`, cost: a.iface.cost, via: dev === root ? { nextHop: 0, iface: a.iface.iface } : undefined });
          }
        } else {
          const seg = Number(u.slice(2));
          const rootAttached = (g.attach.get(root) ?? []).find((a) => a.seg === seg);
          for (const oi of g.transit.get(seg) ?? []) {
            if (`r:${oi.deviceId}` === u) continue;
            edges.push({ to: `r:${oi.deviceId}`, cost: 0, via: rootAttached ? { nextHop: oi.ip, iface: rootAttached.iface.iface } : undefined });
          }
        }
        for (const e of edges) {
          if (done.has(e.to)) continue;
          const nd = du + e.cost;
          let ph = hops.get(u)!;
          if (e.via && e.via.nextHop !== 0) ph = [e.via];
          else if (e.via) ph = []; // root → its own attached network: no next hop yet
          const cur = dist.get(e.to);
          if (cur === undefined || nd < cur) {
            dist.set(e.to, nd);
            hops.set(e.to, ph);
          } else if (nd === cur) hops.set(e.to, mergePaths(hops.get(e.to)!, ph));
        }
      }

      const out: SpfOut = { routerDist: new Map(), prefixes: new Map() };
      const addPrefix = (network: number, prefixLen: number, cost: number, paths: Path[]) => {
        if (!paths.length) return;
        const k = pKey(network, prefixLen);
        const ex = out.prefixes.get(k);
        if (!ex || cost < ex.cost) out.prefixes.set(k, { network, prefixLen, cost, paths });
        else if (cost === ex.cost) ex.paths = mergePaths(ex.paths, paths);
      };
      for (const [k, d] of dist) {
        if (k.startsWith('r:')) {
          const dev = k.slice(2);
          out.routerDist.set(dev, { cost: d, paths: hops.get(k)! });
          if (dev === root) continue;
          for (const s of g.stubs.get(dev) ?? []) addPrefix(s.network, s.prefixLen, d + s.cost, hops.get(k)!);
        } else {
          const seg = Number(k.slice(2));
          const any = g.transit.get(seg)?.[0];
          if (any) addPrefix(any.network, any.prefixLen, d, hops.get(k)!);
        }
      }
      spf.set(`${root}|${area}`, out);
    }
  }

  // Own directly attached prefixes per router per area (for ABR summaries).
  const ownPrefixes = (dev: string, area: number): PrefixEntry[] =>
    result.interfaces
      .filter((o) => o.deviceId === dev && o.area === area)
      .map((o) => ({ network: o.network, prefixLen: o.prefixLen, cost: o.cost, paths: [] }));

  const intra = (dev: string, area: number): PrefixEntry[] => [...ownPrefixes(dev, area), ...(spf.get(`${dev}|${area}`)?.prefixes.values() ?? [])];

  // ---------------------------------------------------------------- 5. inter-area
  const routerAreas = new Map<string, number[]>();
  for (const oi of result.interfaces) {
    const a = routerAreas.get(oi.deviceId) ?? [];
    if (!a.includes(oi.area)) a.push(oi.area);
    routerAreas.set(oi.deviceId, a);
  }
  for (const [dev, as] of routerAreas) if (as.includes(0) && as.length > 1) result.abrs.add(dev);

  const ia = new Map<string, Map<string, PrefixEntry>>(); // dev -> prefix -> entry
  const installIa = (dev: string, area: number, summaries: Array<{ abr: string; e: PrefixEntry }>) => {
    const own = spf.get(`${dev}|${area}`);
    if (!own) return;
    const intraKeys = new Set<string>();
    for (const a of routerAreas.get(dev) ?? []) for (const p of intra(dev, a)) intraKeys.add(pKey(p.network, p.prefixLen));
    const m = ia.get(dev) ?? new Map<string, PrefixEntry>();
    for (const { abr, e } of summaries) {
      if (abr === dev) continue;
      const k = pKey(e.network, e.prefixLen);
      if (intraKeys.has(k)) continue;
      const toAbr = own.routerDist.get(abr);
      if (!toAbr || !toAbr.paths.length) continue;
      const cost = toAbr.cost + e.cost;
      const ex = m.get(k);
      if (!ex || cost < ex.cost) m.set(k, { network: e.network, prefixLen: e.prefixLen, cost, paths: toAbr.paths });
      else if (cost === ex.cost) ex.paths = mergePaths(ex.paths, toAbr.paths);
    }
    ia.set(dev, m);
  };

  // 5a. non-backbone intra-area prefixes summarised into area 0
  const intoBackbone: Array<{ abr: string; e: PrefixEntry }> = [];
  for (const abr of result.abrs)
    for (const a of routerAreas.get(abr)!) if (a !== 0) for (const e of intra(abr, a)) intoBackbone.push({ abr, e });
  for (const e of intoBackbone) result.lsdb.push({ type: 'summary', area: 0, linkId: e.e.network, advRouter: rid(e.abr), detail: `/${e.e.prefixLen} metric ${e.e.cost}` });
  for (const [dev, as] of routerAreas) if (as.includes(0)) installIa(dev, 0, intoBackbone);

  // 5b. backbone (intra + inter) summarised into each non-backbone area
  for (const area of areas.filter((a) => a !== 0)) {
    const summaries: Array<{ abr: string; e: PrefixEntry }> = [];
    for (const abr of result.abrs) {
      if (!routerAreas.get(abr)!.includes(area)) continue;
      for (const e of intra(abr, 0)) summaries.push({ abr, e });
      for (const other of routerAreas.get(abr)!) if (other !== 0 && other !== area) for (const e of intra(abr, other)) summaries.push({ abr, e });
      for (const e of ia.get(abr)?.values() ?? []) summaries.push({ abr, e });
    }
    for (const s of summaries) result.lsdb.push({ type: 'summary', area, linkId: s.e.network, advRouter: rid(s.abr), detail: `/${s.e.prefixLen} metric ${s.e.cost}` });
    for (const [dev, as] of routerAreas) if (as.includes(area) && !result.abrs.has(dev)) installIa(dev, area, summaries);
  }

  // ---------------------------------------------------------------- 6. externals (E2)
  interface Ext {
    asbr: string;
    network: number;
    prefixLen: number;
    metric: number;
  }
  const externals: Ext[] = [];
  for (const d of routers) {
    const cfg = configs.get(d.id)!.ospf!;
    if (!routerAreas.has(d.id)) continue;
    const base = baseRoutes.get(d.id) ?? [];
    const hasDefault = base.some((r) => r.prefixLen === 0 && r.protocol === 'S');
    if (cfg.defaultOriginate === 'always' || (cfg.defaultOriginate === 'on' && hasDefault)) externals.push({ asbr: d.id, network: 0, prefixLen: 0, metric: 1 });
    if (cfg.redistributeStatic)
      for (const r of base) if (r.protocol === 'S' && r.prefixLen > 0) externals.push({ asbr: d.id, network: r.network, prefixLen: r.prefixLen, metric: 20 });
  }
  for (const e of externals) {
    result.asbrs.add(e.asbr);
    result.lsdb.push({ type: 'external', linkId: e.network, advRouter: rid(e.asbr), detail: `/${e.prefixLen} metric-type 2 metric ${e.metric}` });
  }

  /** Forwarding cost/paths from dev to router target (same area, or via one ABR). */
  const reach = (dev: string, target: string): { cost: number; paths: Path[] } | undefined => {
    let best: { cost: number; paths: Path[] } | undefined;
    for (const a of routerAreas.get(dev) ?? []) {
      const own = spf.get(`${dev}|${a}`);
      const direct = own?.routerDist.get(target);
      if (direct && direct.paths.length && (!best || direct.cost < best.cost)) best = direct;
      for (const abr of result.abrs) {
        const toAbr = own?.routerDist.get(abr);
        if (!toAbr || !toAbr.paths.length || abr === dev) continue;
        for (const b of routerAreas.get(abr)!) {
          const fromAbr = spf.get(`${abr}|${b}`)?.routerDist.get(target);
          if (!fromAbr) continue;
          const cost = toAbr.cost + fromAbr.cost;
          if (!best || cost < best.cost) best = { cost, paths: toAbr.paths };
        }
      }
    }
    return best;
  };

  // ---------------------------------------------------------------- 7. assemble routes
  for (const d of routers) {
    if (!routerAreas.has(d.id)) {
      result.routes.set(d.id, []);
      continue;
    }
    const routes: Route[] = [];
    const seen = new Map<string, Route>();
    const add = (protocol: Route['protocol'], e: PrefixEntry) => {
      const k = pKey(e.network, e.prefixLen);
      if (seen.has(k)) return;
      const r: Route = {
        network: e.network,
        prefixLen: e.prefixLen,
        protocol,
        ad: OSPF_AD,
        metric: e.cost,
        nextHop: e.paths[0].nextHop,
        iface: e.paths[0].iface,
        paths: e.paths,
      };
      seen.set(k, r);
      routes.push(r);
    };
    const ownKeys = new Set<string>();
    for (const i of l3.get(d.id) ?? []) if (i.up && i.network !== undefined) ownKeys.add(pKey(i.network, i.prefixLen!));
    for (const a of routerAreas.get(d.id)!) {
      for (const e of spf.get(`${d.id}|${a}`)?.prefixes.values() ?? []) {
        if (ownKeys.has(pKey(e.network, e.prefixLen))) continue;
        const k = pKey(e.network, e.prefixLen);
        const ex = seen.get(k);
        if (ex && ex.metric <= e.cost) continue;
        if (ex) routes.splice(routes.indexOf(ex), 1), seen.delete(k);
        add('O', e);
      }
    }
    for (const e of ia.get(d.id)?.values() ?? []) if (!ownKeys.has(pKey(e.network, e.prefixLen))) add('O IA', e);
    // Externals: lowest forwarding cost to the ASBR wins among equal E2 metrics.
    const extBest = new Map<string, { e: Ext; cost: number; paths: Path[] }>();
    for (const e of externals) {
      if (e.asbr === d.id) continue;
      const r = reach(d.id, e.asbr);
      if (!r || !r.paths.length) continue;
      const k = pKey(e.network, e.prefixLen);
      const ex = extBest.get(k);
      if (!ex || e.metric < ex.e.metric || (e.metric === ex.e.metric && r.cost < ex.cost)) extBest.set(k, { e, cost: r.cost, paths: r.paths });
    }
    for (const { e, paths } of extBest.values()) {
      if (ownKeys.has(pKey(e.network, e.prefixLen))) continue;
      add('O E2', { network: e.network, prefixLen: e.prefixLen, cost: e.metric, paths });
    }
    result.routes.set(d.id, routes);
  }
  return result;
}
