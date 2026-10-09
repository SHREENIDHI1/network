import { isBridgeRole, roleOf, type DeviceRole, type NetConfig } from '../config/netConfig';
import type { DeviceKind } from '../../model/types';
import type { L3Interface } from './interfaces';
import { inSubnet, maskToPrefix, networkOf, parseIpv4 } from './ipv4';

/**
 * IPv4 routing table: connected (C), local host routes (L) and static (S)
 * routes, longest-prefix-match lookup. OSPF adds routes in Phase 3.
 */

export type RouteProtocol = 'C' | 'L' | 'S';

export interface Route {
  network: number;
  prefixLen: number;
  protocol: RouteProtocol;
  /** Administrative distance / metric as shown in "[ad/metric]". */
  ad: number;
  metric: number;
  nextHop?: number;
  iface?: string;
  /** Default route installed from "ip default-gateway" / host gateway (non-routing stacks). */
  isGateway?: boolean;
}

/** Does this device forward packets between interfaces? */
export function routesPackets(kind: DeviceKind, cfg: NetConfig): boolean {
  const role: DeviceRole = roleOf(kind);
  if (role === 'router') return cfg.ipRouting;
  if (role === 'l3switch') return cfg.ipRouting;
  return false;
}

export function buildRoutingTable(kind: DeviceKind, cfg: NetConfig, ifs: L3Interface[]): Route[] {
  const routes: Route[] = [];
  for (const i of ifs) {
    if (!i.up || i.ip === undefined || i.prefixLen === undefined || i.network === undefined) continue;
    routes.push({ network: i.network, prefixLen: i.prefixLen, protocol: 'C', ad: 0, metric: 0, iface: i.name });
    if (i.prefixLen < 32) routes.push({ network: i.ip, prefixLen: 32, protocol: 'L', ad: 0, metric: 0, iface: i.name });
  }
  const connected = routes.slice();

  if (routesPackets(kind, cfg)) {
    // Static routes: valid when the next hop resolves recursively to a connected route,
    // or when an up exit interface is given.
    const candidates = cfg.staticRoutes
      .map((s) => {
        const net = parseIpv4(s.prefix);
        const len = maskToPrefix(s.mask);
        if (net === null || len === null) return null;
        return {
          network: networkOf(net, len),
          prefixLen: len,
          protocol: 'S' as const,
          ad: s.distance ?? 1,
          metric: 0,
          nextHop: s.nextHop ? parseIpv4(s.nextHop) ?? undefined : undefined,
          iface: s.exitInterface,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const accepted: Route[] = [];
    for (let pass = 0; pass < 4; pass++) {
      for (const c of candidates) {
        if (accepted.includes(c)) continue;
        if (c.iface) {
          const i = ifs.find((x) => x.name === c.iface);
          if (!i?.up) continue;
          if (c.nextHop !== undefined && !(i.network !== undefined && inSubnet(c.nextHop, i.network, i.prefixLen!))) continue;
          accepted.push(c);
          continue;
        }
        if (c.nextHop === undefined) continue;
        const via = lookup([...connected, ...accepted.filter((a) => a !== c)], c.nextHop);
        if (via && !(via.network === c.network && via.prefixLen === c.prefixLen)) accepted.push(c);
      }
    }
    // Lower AD wins for identical prefixes.
    for (const a of accepted) {
      const same = routes.find((r) => r.network === a.network && r.prefixLen === a.prefixLen);
      if (!same) routes.push(a);
      else if (a.ad < same.ad) routes.splice(routes.indexOf(same), 1, a);
      else if (a.ad === same.ad && same.protocol === 'S') routes.push(a); // equal-cost static (first one used)
    }
  } else {
    const role = roleOf(kind);
    const gw = cfg.defaultGateway ? parseIpv4(cfg.defaultGateway) : null;
    if (gw !== null && (role === 'host' || isBridgeRole(role) || role === 'router')) {
      const i = ifs.find((x) => x.up && x.network !== undefined && inSubnet(gw, x.network, x.prefixLen!));
      if (i) routes.push({ network: 0, prefixLen: 0, protocol: 'S', ad: 1, metric: 0, nextHop: gw, iface: i.name, isGateway: true });
    }
  }
  return routes.sort((a, b) => a.network - b.network || b.prefixLen - a.prefixLen);
}

/** Longest-prefix match; ties resolved by lower AD, then table order. */
export function lookup(table: Route[], dst: number): Route | undefined {
  let best: Route | undefined;
  for (const r of table) {
    if (!inSubnet(dst, r.network, r.prefixLen)) continue;
    if (!best || r.prefixLen > best.prefixLen || (r.prefixLen === best.prefixLen && r.ad < best.ad)) best = r;
  }
  return best;
}

/**
 * Resolves a route to an egress interface and next-hop address, following
 * recursive static routes (next hop reached via another route).
 */
export function resolve(table: Route[], dst: number, depth = 0): { route: Route; iface: string; nextHop: number } | undefined {
  const r = lookup(table, dst);
  if (!r || depth > 4) return undefined;
  if (r.protocol === 'C' || r.protocol === 'L') return { route: r, iface: r.iface!, nextHop: dst };
  if (r.iface && r.nextHop === undefined) return { route: r, iface: r.iface, nextHop: dst };
  if (r.nextHop === undefined) return undefined;
  if (r.iface) return { route: r, iface: r.iface, nextHop: r.nextHop };
  const via = resolve(table, r.nextHop, depth + 1);
  return via ? { route: r, iface: via.iface, nextHop: via.nextHop === r.nextHop ? r.nextHop : via.nextHop } : undefined;
}
