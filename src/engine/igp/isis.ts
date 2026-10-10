import type { Device, Topology } from '../../model/types';
import { roleOf, type NetConfig } from '../config/netConfig';
import type { Segment } from '../ethernet/segments';
import type { L3Interface } from '../ip/interfaces';
import { routesPackets, type Route } from '../ip/routing';

/**
 * Integrated IS-IS for IPv4 (ISO 10589 / RFC 1195), simplified.
 *
 * Converged state is computed directly (no IIH/LSP/CSNP exchange, no timers):
 * L1 adjacencies need the same area, L2 adjacencies any area; a LAN is a
 * pseudonode (DIS = highest system ID, priorities not modelled); Dijkstra per
 * level with narrow metrics (default 10); L1/L2 routers leak their L1 prefixes
 * into L2 and set the ATT bit when L2 reaches another area; L1-only routers
 * install a default route to the closest ATT router. L1 routes beat L2.
 * See Model Limitations.
 */

export const ISIS_AD = 115;
export const ISIS_DEFAULT_METRIC = 10;
export type IsisLevel = 1 | 2;
export type IsType = 'level-1' | 'level-1-2' | 'level-2-only';

export interface ParsedNet {
  area: string;
  systemId: string;
}

/** "49.0001.0000.0000.0001.00" → area "49.0001", system ID "0000.0000.0001". */
export function parseNet(net: string): ParsedNet | null {
  const g = net.trim().toLowerCase().split('.');
  if (g.length < 5 || g[g.length - 1] !== '00') return null;
  const sys = g.slice(-4, -1);
  const area = g.slice(0, -4);
  if (!sys.every((x) => /^[0-9a-f]{4}$/.test(x))) return null;
  if (!area.length || !/^[0-9a-f]{2}$/.test(area[0]) || !area.slice(1).every((x) => /^[0-9a-f]{4}$/.test(x))) return null;
  return { area: area.join('.'), systemId: sys.join('.') };
}

const levelsOf = (t: IsType): IsisLevel[] => (t === 'level-1' ? [1] : t === 'level-2-only' ? [2] : [1, 2]);

export interface IsisInterface {
  deviceId: string;
  iface: string;
  levels: IsisLevel[];
  metric: number;
  passive: boolean;
  ip: number;
  network: number;
  prefixLen: number;
  segmentId: number;
}

export interface IsisAdjacency {
  deviceId: string;
  iface: string;
  neighborDeviceId: string;
  neighborSystemId: string;
  neighborIp: number;
  level: IsisLevel;
}

export interface IsisLsp {
  level: IsisLevel;
  lspId: string;
  deviceId: string;
  attached: boolean;
  pseudonode: boolean;
  prefixes: number;
}

export interface IsisRouter {
  systemId: string;
  area: string;
  isType: IsType;
}

export interface IsisResult {
  routers: Map<string, IsisRouter>;
  interfaces: IsisInterface[];
  adjacencies: IsisAdjacency[];
  routes: Map<string, Route[]>;
  problems: Array<{ deviceId: string; iface?: string; text: string }>;
  lsps: IsisLsp[];
  /** L1/L2 routers that set the ATT bit in their L1 LSP. */
  attached: Set<string>;
}

interface Path {
  nextHop: number;
  iface: string;
}
interface Prefix {
  network: number;
  prefixLen: number;
  metric: number;
}

const pk = (n: number, l: number) => `${n}/${l}`;
const merge = (a: Path[], b: Path[]) => {
  const out = [...a];
  for (const p of b) if (!out.some((x) => x.nextHop === p.nextHop && x.iface === p.iface)) out.push(p);
  return out.slice(0, 4);
};

export const emptyIsis = (): IsisResult => ({ routers: new Map(), interfaces: [], adjacencies: [], routes: new Map(), problems: [], lsps: [], attached: new Set() });

export function computeIsis(topo: Topology, configs: ReadonlyMap<string, NetConfig>, l3: ReadonlyMap<string, L3Interface[]>, segments: Segment[]): IsisResult {
  const res = emptyIsis();
  const segOf = new Map<string, number>();
  for (const s of segments) for (const m of s.members) segOf.set(`${m.deviceId}|${m.iface}`, s.id);
  const devName = new Map(topo.devices.map((d) => [d.id, d.name]));

  // 1. routers + interfaces
  const routers: Device[] = [];
  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg?.isis || !routesPackets(d.kind, cfg) || roleOf(d.kind) === 'opaque') continue;
    const net = cfg.isis.net ? parseNet(cfg.isis.net) : null;
    if (!net) {
      res.problems.push({ deviceId: d.id, text: 'IS-IS is not running: no valid NET configured (e.g. "net 49.0001.0000.0000.0001.00").' });
      continue;
    }
    res.routers.set(d.id, { ...net, isType: cfg.isis.isType });
    routers.push(d);
    const rLevels = levelsOf(cfg.isis.isType);
    for (const i of l3.get(d.id) ?? []) {
      const ic = cfg.interfaces[i.name];
      if (!ic?.isisEnabled || !i.up || i.ip === undefined) continue;
      const cLevels = levelsOf(ic.isisCircuitType ?? 'level-1-2');
      const levels = rLevels.filter((l) => cLevels.includes(l));
      res.interfaces.push({
        deviceId: d.id,
        iface: i.name,
        levels,
        metric: ic.isisMetric ?? ISIS_DEFAULT_METRIC,
        passive: i.kind === 'loop' || cfg.isis.passive.includes(i.name),
        ip: i.ip,
        network: i.network!,
        prefixLen: i.prefixLen!,
        segmentId: segOf.get(`${d.id}|${i.name}`) ?? -1,
      });
    }
  }
  // Interfaces listed passive but without "ip router isis" are still advertised (IOS behaviour).
  for (const d of routers) {
    const cfg = configs.get(d.id)!;
    for (const name of cfg.isis!.passive) {
      if (res.interfaces.some((x) => x.deviceId === d.id && x.iface === name)) continue;
      const i = (l3.get(d.id) ?? []).find((x) => x.name === name && x.up && x.ip !== undefined);
      if (i) res.interfaces.push({ deviceId: d.id, iface: name, levels: levelsOf(cfg.isis!.isType), metric: ISIS_DEFAULT_METRIC, passive: true, ip: i.ip!, network: i.network!, prefixLen: i.prefixLen!, segmentId: -1 });
    }
  }

  // Duplicate system IDs.
  const bySys = new Map<string, string[]>();
  for (const [dev, r] of res.routers) bySys.set(r.systemId, [...(bySys.get(r.systemId) ?? []), dev]);
  for (const [sys, devs] of bySys) if (devs.length > 1) for (const d of devs) res.problems.push({ deviceId: d, text: `%CLNS-3-BADPACKET: duplicate system ID ${sys} detected — adjacency refused.` });

  // 2. adjacencies
  const bySeg = new Map<number, IsisInterface[]>();
  for (const x of res.interfaces) if (!x.passive && x.segmentId >= 0) bySeg.set(x.segmentId, [...(bySeg.get(x.segmentId) ?? []), x]);
  for (const ifs of bySeg.values())
    for (let i = 0; i < ifs.length; i++)
      for (let j = i + 1; j < ifs.length; j++) {
        const a = ifs[i];
        const b = ifs[j];
        if (a.deviceId === b.deviceId) continue;
        const ra = res.routers.get(a.deviceId)!;
        const rb = res.routers.get(b.deviceId)!;
        const why = (t: string) => {
          res.problems.push({ deviceId: a.deviceId, iface: a.iface, text: `No IS-IS adjacency with ${devName.get(b.deviceId)}: ${t}.` });
          res.problems.push({ deviceId: b.deviceId, iface: b.iface, text: `No IS-IS adjacency with ${devName.get(a.deviceId)}: ${t}.` });
        };
        if (ra.systemId === rb.systemId) {
          why('duplicate system ID');
          continue;
        }
        if (a.network !== b.network || a.prefixLen !== b.prefixLen) {
          why('IP subnet mismatch');
          continue;
        }
        const common = a.levels.filter((l) => b.levels.includes(l));
        const ok = common.filter((l) => l === 2 || ra.area === rb.area);
        if (!common.length) {
          why('no common level (is-type / circuit-type)');
          continue;
        }
        if (!ok.length) {
          why(`area mismatch for a Level-1 adjacency (${ra.area} vs ${rb.area})`);
          continue;
        }
        for (const level of ok)
          for (const [x, y] of [
            [a, b],
            [b, a],
          ] as const)
            res.adjacencies.push({ deviceId: x.deviceId, iface: x.iface, neighborDeviceId: y.deviceId, neighborSystemId: res.routers.get(y.deviceId)!.systemId, neighborIp: y.ip, level });
      }

  // 3. per-level SPF
  const hasAdj = (dev: string, iface: string, level: IsisLevel) => res.adjacencies.some((x) => x.deviceId === dev && x.iface === iface && x.level === level);
  const advertised = (dev: string, level: IsisLevel): Prefix[] =>
    res.interfaces.filter((x) => x.deviceId === dev && x.levels.includes(level)).map((x) => ({ network: x.network, prefixLen: x.prefixLen, metric: x.metric }));

  const spf = (root: string, level: IsisLevel, extra: Map<string, Prefix[]>) => {
    // nodes: r:dev, n:seg
    const dist = new Map<string, number>([[`r:${root}`, 0]]);
    const hops = new Map<string, Path[]>([[`r:${root}`, []]]);
    const done = new Set<string>();
    for (;;) {
      let u: string | undefined;
      for (const [k, v] of dist) if (!done.has(k) && (u === undefined || v < dist.get(u)!)) u = k;
      if (u === undefined) break;
      done.add(u);
      const du = dist.get(u)!;
      const edges: Array<{ to: string; cost: number; via?: Path }> = [];
      if (u.startsWith('r:')) {
        const dev = u.slice(2);
        for (const x of res.interfaces) if (x.deviceId === dev && hasAdj(dev, x.iface, level)) edges.push({ to: `n:${x.segmentId}`, cost: x.metric, via: dev === root ? { nextHop: 0, iface: x.iface } : undefined });
      } else {
        const seg = Number(u.slice(2));
        const rootIf = res.interfaces.find((x) => x.deviceId === root && x.segmentId === seg);
        for (const x of res.interfaces)
          if (x.segmentId === seg && `r:${x.deviceId}` !== u && hasAdj(x.deviceId, x.iface, level))
            edges.push({ to: `r:${x.deviceId}`, cost: 0, via: rootIf ? { nextHop: x.ip, iface: rootIf.iface } : undefined });
      }
      for (const e of edges) {
        if (done.has(e.to)) continue;
        const nd = du + e.cost;
        let ph = hops.get(u)!;
        if (e.via && e.via.nextHop !== 0) ph = [e.via];
        else if (e.via) ph = [];
        const cur = dist.get(e.to);
        if (cur === undefined || nd < cur) {
          dist.set(e.to, nd);
          hops.set(e.to, ph);
        } else if (nd === cur) hops.set(e.to, merge(hops.get(e.to)!, ph));
      }
    }
    const reached = new Map<string, { cost: number; paths: Path[] }>();
    for (const [k, d] of dist) if (k.startsWith('r:')) reached.set(k.slice(2), { cost: d, paths: hops.get(k)! });
    const prefixes = new Map<string, Prefix & { paths: Path[] }>();
    for (const [dev, r] of reached) {
      if (dev === root || !r.paths.length) continue;
      for (const p of [...advertised(dev, level), ...(extra.get(dev) ?? [])]) {
        const k = pk(p.network, p.prefixLen);
        const cost = r.cost + p.metric;
        const ex = prefixes.get(k);
        if (!ex || cost < ex.metric) prefixes.set(k, { ...p, metric: cost, paths: r.paths });
        else if (cost === ex.metric) ex.paths = merge(ex.paths, r.paths);
      }
    }
    return { reached, prefixes };
  };

  const runs = (level: IsisLevel) => routers.filter((d) => levelsOf(res.routers.get(d.id)!.isType).includes(level));
  const l1 = new Map(runs(1).map((d) => [d.id, spf(d.id, 1, new Map())]));
  // L1/L2 routers leak their L1 routes into L2 (with the L1 metric).
  const leaks = new Map<string, Prefix[]>();
  for (const d of runs(2)) {
    const own = l1.get(d.id);
    if (own) leaks.set(d.id, [...own.prefixes.values()].map((p) => ({ network: p.network, prefixLen: p.prefixLen, metric: p.metric })));
  }
  const l2 = new Map(runs(2).map((d) => [d.id, spf(d.id, 2, leaks)]));

  // ATT bit: L1/L2 router whose L2 SPF reaches a router of another area.
  for (const d of routers) {
    const r = res.routers.get(d.id)!;
    if (r.isType !== 'level-1-2') continue;
    const reach = l2.get(d.id)?.reached;
    if (reach && [...reach.keys()].some((o) => o !== d.id && res.routers.get(o)!.area !== r.area)) res.attached.add(d.id);
  }

  // LSP summary.
  for (const level of [1, 2] as const) {
    for (const d of runs(level)) {
      const n = advertised(d.id, level).length + (level === 2 ? (leaks.get(d.id)?.length ?? 0) : 0);
      res.lsps.push({ level, lspId: `${d.name}.00-00`, deviceId: d.id, attached: level === 1 && res.attached.has(d.id), pseudonode: false, prefixes: n });
    }
    const segs = new Set(res.adjacencies.filter((a) => a.level === level).map((a) => res.interfaces.find((x) => x.deviceId === a.deviceId && x.iface === a.iface)!.segmentId));
    let idx = 1;
    for (const seg of segs) {
      const members = res.interfaces.filter((x) => x.segmentId === seg && hasAdj(x.deviceId, x.iface, level));
      const dis = members.sort((a, b) => (res.routers.get(b.deviceId)!.systemId > res.routers.get(a.deviceId)!.systemId ? 1 : -1))[0];
      res.lsps.push({ level, lspId: `${devName.get(dis.deviceId)}.${String(idx++).padStart(2, '0')}-00`, deviceId: dis.deviceId, attached: false, pseudonode: true, prefixes: 0 });
    }
  }

  // 4. routes
  for (const d of routers) {
    const own = new Set((l3.get(d.id) ?? []).filter((i) => i.up && i.network !== undefined).map((i) => pk(i.network!, i.prefixLen!)));
    const out = new Map<string, Route>();
    const add = (level: IsisLevel, p: Prefix & { paths: Path[] }) => {
      const k = pk(p.network, p.prefixLen);
      if (own.has(k) || out.has(k) || !p.paths.length) return;
      out.set(k, { network: p.network, prefixLen: p.prefixLen, protocol: level === 1 ? 'i L1' : 'i L2', ad: ISIS_AD, metric: p.metric, nextHop: p.paths[0].nextHop, iface: p.paths[0].iface, paths: p.paths });
    };
    for (const p of l1.get(d.id)?.prefixes.values() ?? []) add(1, p); // L1 preferred
    for (const p of l2.get(d.id)?.prefixes.values() ?? []) add(2, p);
    // L1-only router: default route towards the nearest attached L1/L2 router of its area.
    if (res.routers.get(d.id)!.isType === 'level-1' && !out.has(pk(0, 0))) {
      let best: { cost: number; paths: Path[] } | undefined;
      for (const att of res.attached) {
        const r = l1.get(d.id)?.reached.get(att);
        if (r && r.paths.length && (!best || r.cost < best.cost)) best = r;
        else if (r && best && r.cost === best.cost) best = { cost: best.cost, paths: merge(best.paths, r.paths) };
      }
      if (best) out.set(pk(0, 0), { network: 0, prefixLen: 0, protocol: 'i L1', ad: ISIS_AD, metric: best.cost, nextHop: best.paths[0].nextHop, iface: best.paths[0].iface, paths: best.paths });
    }
    res.routes.set(d.id, [...out.values()]);
  }
  return res;
}

