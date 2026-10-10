import type { Topology } from '../../model/types';
import { roleOf, type NetConfig } from '../config/netConfig';
import type { Segment } from '../ethernet/segments';
import type { L3Interface } from '../ip/interfaces';
import { parseIpv4 } from '../ip/ipv4';
import { routesPackets, type Route } from '../ip/routing';

/**
 * RIPv2 (RFC 2453) for comparison with link-state protocols — demo only.
 *
 * Distance-vector routing is computed as converged Bellman-Ford (no 30 s
 * updates, timers, triggered updates or counting to infinity): metric = hop
 * count, 16 = unreachable, split horizon, up to 4 equal-cost paths. "network"
 * statements are classful, as in IOS. RIPv1 classful behaviour and
 * auto-summary are not modelled: RIP runs only after "version 2".
 */

export const RIP_AD = 120;
export const RIP_INFINITY = 16;

export interface RipResult {
  /** Interfaces running RIP: deviceId → interface names. */
  enabled: Map<string, string[]>;
  routes: Map<string, Route[]>;
  /** RIP speakers that exchange updates, per device. */
  neighbors: Map<string, Array<{ deviceId: string; ip: number; iface: string }>>;
  problems: Array<{ deviceId: string; text: string }>;
}

export const emptyRip = (): RipResult => ({ enabled: new Map(), routes: new Map(), neighbors: new Map(), problems: [] });

/** Classful network of an address (A /8, B /16, C /24). */
export function classfulNetwork(ip: number): { network: number; prefixLen: number } {
  const first = ip >>> 24;
  const len = first < 128 ? 8 : first < 192 ? 16 : 24;
  return { network: (ip & ((0xffffffff << (32 - len)) >>> 0)) >>> 0, prefixLen: len };
}

interface Entry {
  network: number;
  prefixLen: number;
  metric: number;
  paths: Array<{ nextHop: number; iface: string }>;
  /** Interface the route was learned on (split horizon); undefined = connected. */
  via?: string;
}

const pk = (n: number, l: number) => `${n}/${l}`;

export function computeRip(topo: Topology, configs: ReadonlyMap<string, NetConfig>, l3: ReadonlyMap<string, L3Interface[]>, segments: Segment[]): RipResult {
  const res = emptyRip();
  const segOf = new Map<string, number>();
  for (const s of segments) for (const m of s.members) segOf.set(`${m.deviceId}|${m.iface}`, s.id);

  const speakers: string[] = [];
  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg?.rip || !routesPackets(d.kind, cfg) || roleOf(d.kind) === 'opaque') continue;
    if (cfg.rip.version !== 2) {
      res.problems.push({ deviceId: d.id, text: 'RIP is configured but not running: RailMPLS Lab models RIPv2 only — add "version 2".' });
      continue;
    }
    const nets = cfg.rip.networks.map((n) => parseIpv4(n)).filter((n): n is number => n !== null);
    const on = (l3.get(d.id) ?? []).filter((i) => i.up && i.ip !== undefined && nets.some((n) => classfulNetwork(i.ip!).network === classfulNetwork(n).network));
    res.enabled.set(d.id, on.map((i) => i.name));
    speakers.push(d.id);
  }

  // Neighbours: RIP-enabled, non-passive interfaces on the same segment.
  const ifOf = (dev: string) => (l3.get(dev) ?? []).filter((i) => res.enabled.get(dev)?.includes(i.name));
  const passive = (dev: string, name: string) => !!configs.get(dev)?.rip?.passive.includes(name);
  for (const a of speakers) {
    const list: Array<{ deviceId: string; ip: number; iface: string }> = [];
    for (const ia of ifOf(a)) {
      if (passive(a, ia.name) || ia.kind === 'loop') continue;
      const seg = segOf.get(`${a}|${ia.name}`);
      for (const b of speakers) {
        if (b === a) continue;
        for (const ib of ifOf(b)) {
          if (passive(b, ib.name) || ib.kind === 'loop') continue;
          if (segOf.get(`${b}|${ib.name}`) === seg && ib.network === ia.network) list.push({ deviceId: b, ip: ib.ip!, iface: ia.name });
        }
      }
    }
    res.neighbors.set(a, list);
  }

  // Bellman-Ford until stable.
  const tables = new Map<string, Map<string, Entry>>();
  for (const d of speakers) {
    const t = new Map<string, Entry>();
    for (const i of ifOf(d)) t.set(pk(i.network!, i.prefixLen!), { network: i.network!, prefixLen: i.prefixLen!, metric: 0, paths: [] });
    if (configs.get(d)!.rip!.defaultOriginate) t.set(pk(0, 0), { network: 0, prefixLen: 0, metric: 0, paths: [] });
    tables.set(d, t);
  }
  for (let round = 0; round < RIP_INFINITY + 2; round++) {
    let changed = false;
    const next = new Map([...tables].map(([d, t]) => [d, new Map([...t].map(([k, e]) => [k, { ...e, paths: [...e.paths] }]))]));
    for (const d of speakers) {
      const mine = next.get(d)!;
      for (const nb of res.neighbors.get(d) ?? []) {
        const nbIface = ifOf(nb.deviceId).find((i) => i.ip === nb.ip)!;
        for (const e of tables.get(nb.deviceId)!.values()) {
          if (e.via === nbIface.name) continue; // split horizon
          const metric = e.metric + 1;
          if (metric >= RIP_INFINITY) continue;
          const k = pk(e.network, e.prefixLen);
          const cur = mine.get(k);
          const path = { nextHop: nb.ip, iface: nb.iface };
          if (!cur || metric < cur.metric) {
            mine.set(k, { network: e.network, prefixLen: e.prefixLen, metric, paths: [path], via: nb.iface });
            changed = true;
          } else if (cur.paths.length && metric === cur.metric && !cur.paths.some((p) => p.nextHop === path.nextHop) && cur.paths.length < 4) {
            cur.paths.push(path);
            changed = true;
          }
        }
      }
    }
    for (const [d, t] of next) tables.set(d, t);
    if (!changed) break;
  }

  for (const d of speakers) {
    const routes: Route[] = [];
    for (const e of tables.get(d)!.values()) {
      if (!e.paths.length) continue;
      routes.push({ network: e.network, prefixLen: e.prefixLen, protocol: 'R', ad: RIP_AD, metric: e.metric, nextHop: e.paths[0].nextHop, iface: e.paths[0].iface, paths: e.paths });
    }
    res.routes.set(d, routes);
  }
  return res;
}
