import type { Topology } from '../../model/types';
import type { NetConfig } from '../config/netConfig';
import type { Segment } from '../ethernet/segments';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4 } from '../ip/ipv4';
import { resolve, routesPackets, type Route } from '../ip/routing';
import type { OspfResult } from '../ospf/ospf';

/**
 * MPLS label distribution with LDP (RFC 5036), simplified.
 *
 * Like OSPF, the converged LDP state is computed from topology, config and the
 * routing tables instead of exchanging Hello / Init / Label Mapping messages:
 *  - discovery: link hellos between interfaces with "mpls ip" on one segment
 *  - session: needs both routers' LDP router-IDs (transport addresses)
 *    reachable through the routing table
 *  - bindings: every LSR gives each IGP prefix a local label (downstream
 *    unsolicited, liberal retention); its own connected prefixes get
 *    implicit-null (3), or explicit-null (0) with "mpls ldp explicit-null"
 *  - LFIB: out label = the binding learned from the routing next hop's LSR
 *    ("Pop Label" when that is implicit-null → penultimate hop popping)
 * See Model Limitations.
 */

export const LABEL_EXPLICIT_NULL = 0;
export const LABEL_IMPLICIT_NULL = 3;
export const FIRST_DYNAMIC_LABEL = 16;

export interface LdpDiscovery {
  deviceId: string;
  iface: string;
  neighborDeviceId: string;
  neighborIface: string;
  neighborIp: number;
}

export interface LdpSession {
  /** Device IDs of both ends (a < b). */
  a: string;
  b: string;
  state: 'OPERATIONAL' | 'NON-EXISTENT';
  /** Why the session is not up. */
  reason?: string;
  /** Interfaces (per device) on which hellos are exchanged with the peer. */
  ifaces: Map<string, string[]>;
}

export interface LfibEntry {
  deviceId: string;
  /** Local label; null for an FTN (imposition-only) entry. */
  inLabel: number | null;
  network: number;
  prefixLen: number;
  /** Numeric out label, or 'pop' (implicit-null from next hop), or 'none' (no binding — forwarded unlabelled). */
  out: number | 'pop' | 'none';
  nextHop: number;
  iface: string;
  /** Downstream LSR for this path, if an LDP peer. */
  nextHopDeviceId?: string;
}

export interface LdpResult {
  /** Devices running MPLS: LDP router-id + interfaces with mpls enabled. */
  routers: Map<string, { routerId: number; ridIface: string; mplsIfaces: string[] }>;
  discoveries: LdpDiscovery[];
  sessions: LdpSession[];
  /** Local bindings: device → prefix key ("net/len") → label. */
  local: Map<string, Map<string, number>>;
  /** LFIB entries (one per path) for every labelled prefix. */
  lfib: LfibEntry[];
  /** Index: "deviceId|inLabel" → entry (first path). */
  byInLabel: Map<string, LfibEntry>;
  /** Index: "deviceId|net/len" → entries (all paths). */
  byFec: Map<string, LfibEntry[]>;
  problems: Array<{ deviceId: string; text: string }>;
}

export const prefixKey = (network: number, prefixLen: number) => `${network}/${prefixLen}`;

export function emptyLdp(): LdpResult {
  return { routers: new Map(), discoveries: [], sessions: [], local: new Map(), lfib: [], byInLabel: new Map(), byFec: new Map(), problems: [] };
}

/** Interfaces where label switching is enabled ("mpls ip", or OSPF "mpls ldp autoconfig"). */
export function mplsInterfaces(deviceId: string, cfg: NetConfig, ifs: L3Interface[], ospf: OspfResult): string[] {
  const auto = cfg.ospf?.ldpAutoconfig
    ? new Set(ospf.interfaces.filter((o) => o.deviceId === deviceId && !o.passive).map((o) => o.iface))
    : new Set<string>();
  return ifs
    .filter((i) => i.kind !== 'loop' && i.up && i.ip !== undefined && (cfg.interfaces[i.name]?.mplsIp || auto.has(i.name)))
    .map((i) => i.name);
}

/** LDP router-ID: the configured interface, else the highest loopback, else the highest interface address. */
function ldpRouterId(cfg: NetConfig, ifs: L3Interface[]): { ip: number; iface: string } | undefined {
  const up = ifs.filter((i) => i.up && i.ip !== undefined);
  if (cfg.mpls.ldpRouterId) {
    const i = up.find((x) => x.name === cfg.mpls.ldpRouterId);
    if (i) return { ip: i.ip!, iface: i.name };
  }
  const pick = (list: L3Interface[]) => list.sort((a, b) => b.ip! - a.ip!)[0];
  const best = pick(up.filter((i) => i.kind === 'loop')) ?? pick(up);
  return best ? { ip: best.ip!, iface: best.name } : undefined;
}

const labelOf = (cfg: NetConfig) => (cfg.mpls.explicitNull ? LABEL_EXPLICIT_NULL : LABEL_IMPLICIT_NULL);

export function computeLdp(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  l3: ReadonlyMap<string, L3Interface[]>,
  segments: Segment[],
  routes: ReadonlyMap<string, Route[]>,
  ospf: OspfResult,
): LdpResult {
  const res = emptyLdp();

  // 1. Which devices run MPLS, and their router-IDs.
  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    const ifs = l3.get(d.id) ?? [];
    if (!cfg || !routesPackets(d.kind, cfg)) continue;
    const mplsIfaces = mplsInterfaces(d.id, cfg, ifs, ospf);
    const anyConfigured = Object.values(cfg.interfaces).some((i) => i.mplsIp) || cfg.ospf?.ldpAutoconfig;
    if (!anyConfigured) continue;
    const rid = ldpRouterId(cfg, ifs);
    if (!rid) {
      res.problems.push({ deviceId: d.id, text: 'LDP has no router-ID: no interface with an IP address is up.' });
      continue;
    }
    res.routers.set(d.id, { routerId: rid.ip, ridIface: rid.iface, mplsIfaces });
  }

  // 2. Discovery: link hellos between mpls interfaces on the same segment.
  const ifAddr = (dev: string, name: string) => l3.get(dev)?.find((i) => i.name === name)?.ip;
  for (const seg of segments) {
    const members = seg.members.filter((m) => res.routers.get(m.deviceId)?.mplsIfaces.includes(m.iface));
    for (const a of members)
      for (const b of members) {
        if (a.deviceId === b.deviceId) continue;
        const ip = ifAddr(b.deviceId, b.iface);
        if (ip === undefined) continue;
        res.discoveries.push({ deviceId: a.deviceId, iface: a.iface, neighborDeviceId: b.deviceId, neighborIface: b.iface, neighborIp: ip });
      }
    // A neighbour on the segment without "mpls ip" is a classic fault: note it.
    for (const m of seg.members) {
      if (!res.routers.get(m.deviceId)?.mplsIfaces.includes(m.iface)) continue;
      for (const o of seg.members) {
        if (o.deviceId === m.deviceId || !routesPackets(topo.devices.find((d) => d.id === o.deviceId)!.kind, configs.get(o.deviceId)!)) continue;
        if (!res.routers.get(o.deviceId)?.mplsIfaces.includes(o.iface))
          res.problems.push({
            deviceId: m.deviceId,
            text: `${m.iface}: no LDP hellos from the router on this link (is "mpls ip" missing on its ${o.iface}?).`,
          });
      }
    }
  }

  // 3. Sessions: one per router pair; transport addresses (router-IDs) must be reachable both ways.
  const pairs = new Map<string, LdpSession>();
  for (const disc of res.discoveries) {
    const [a, b] = [disc.deviceId, disc.neighborDeviceId].sort();
    const k = `${a}|${b}`;
    let s = pairs.get(k);
    if (!s) {
      s = { a, b, state: 'OPERATIONAL', ifaces: new Map() };
      pairs.set(k, s);
    }
    const list = s.ifaces.get(disc.deviceId) ?? [];
    if (!list.includes(disc.iface)) s.ifaces.set(disc.deviceId, [...list, disc.iface]);
  }
  for (const s of pairs.values()) {
    const ra = res.routers.get(s.a)!;
    const rb = res.routers.get(s.b)!;
    if (ra.routerId === rb.routerId) {
      s.state = 'NON-EXISTENT';
      s.reason = `duplicate LDP router-ID ${formatIpv4(ra.routerId)}`;
    } else {
      for (const [from, to] of [
        [s.a, rb],
        [s.b, ra],
      ] as const) {
        const own = l3.get(from)?.some((i) => i.up && i.ip === to.routerId);
        if (own || !resolve(routes.get(from) ?? [], to.routerId)) {
          s.state = 'NON-EXISTENT';
          s.reason = `transport address ${formatIpv4(to.routerId)} is not reachable from ${topo.devices.find((d) => d.id === from)?.name ?? from} (no route to the peer's LDP router-ID)`;
          break;
        }
      }
    }
    res.sessions.push(s);
  }

  // 4. Local bindings for every IGP / connected / static prefix (not "L" host routes).
  for (const [devId] of res.routers) {
    const cfg = configs.get(devId)!;
    const table = (routes.get(devId) ?? []).filter((r) => r.protocol !== 'L' && !r.isGateway);
    const sorted = [...table].sort((x, y) => x.network - y.network || x.prefixLen - y.prefixLen);
    const m = new Map<string, number>();
    let next = FIRST_DYNAMIC_LABEL;
    for (const r of sorted) {
      const k = prefixKey(r.network, r.prefixLen);
      if (m.has(k)) continue;
      m.set(k, r.protocol === 'C' ? labelOf(cfg) : next++);
    }
    res.local.set(devId, m);
  }

  // 5. LFIB: out label from the LDP peer that is the routing next hop.
  const peerByAddr = new Map<string, string>(); // `${dev}|${ip}` → peer device
  for (const s of res.sessions) {
    if (s.state !== 'OPERATIONAL') continue;
    for (const [me, peer] of [
      [s.a, s.b],
      [s.b, s.a],
    ])
      for (const i of l3.get(peer) ?? []) if (i.up && i.ip !== undefined) peerByAddr.set(`${me}|${i.ip}`, peer);
  }
  for (const [devId, r] of res.routers) {
    const local = res.local.get(devId)!;
    for (const route of routes.get(devId) ?? []) {
      if (route.protocol === 'C' || route.protocol === 'L' || route.isGateway) continue;
      const k = prefixKey(route.network, route.prefixLen);
      const paths = route.paths?.length
        ? route.paths
        : route.nextHop !== undefined && route.iface
          ? [{ nextHop: route.nextHop, iface: route.iface }]
          : [];
      for (const p of paths) {
        const peer = r.mplsIfaces.includes(p.iface) ? peerByAddr.get(`${devId}|${p.nextHop}`) : undefined;
        const remote = peer ? res.local.get(peer)?.get(k) : undefined;
        const out: LfibEntry['out'] = remote === undefined ? 'none' : remote === LABEL_IMPLICIT_NULL ? 'pop' : remote;
        const e: LfibEntry = {
          deviceId: devId,
          inLabel: local.get(k) ?? null,
          network: route.network,
          prefixLen: route.prefixLen,
          out,
          nextHop: p.nextHop,
          iface: p.iface,
          nextHopDeviceId: peer,
        };
        res.lfib.push(e);
        if (e.inLabel !== null && !res.byInLabel.has(`${devId}|${e.inLabel}`)) res.byInLabel.set(`${devId}|${e.inLabel}`, e);
        const fk = `${devId}|${k}`;
        res.byFec.set(fk, [...(res.byFec.get(fk) ?? []), e]);
      }
    }
  }
  return res;
}

/** Remote bindings (LIB) of `deviceId` for one prefix: label advertised by each operational peer. */
export function remoteBindings(ldp: LdpResult, deviceId: string, key: string): Array<{ peer: string; label: number }> {
  const out: Array<{ peer: string; label: number }> = [];
  for (const s of ldp.sessions) {
    if (s.state !== 'OPERATIONAL' || (s.a !== deviceId && s.b !== deviceId)) continue;
    const peer = s.a === deviceId ? s.b : s.a;
    const l = ldp.local.get(peer)?.get(key);
    if (l !== undefined) out.push({ peer, label: l });
  }
  return out;
}

/** Interfaces where "mpls ldp sync" should raise the OSPF cost (MPLS on, no operational session to the neighbour). */
export function ldpSyncHolddown(ldp: LdpResult, configs: ReadonlyMap<string, NetConfig>): Array<{ deviceId: string; iface: string }> {
  const out: Array<{ deviceId: string; iface: string }> = [];
  for (const [devId, r] of ldp.routers) {
    if (!configs.get(devId)?.ospf?.ldpSync) continue;
    for (const iface of r.mplsIfaces) {
      const up = ldp.sessions.some((s) => s.state === 'OPERATIONAL' && s.ifaces.get(devId)?.includes(iface));
      if (!up) out.push({ deviceId: devId, iface });
    }
  }
  return out;
}

export const OSPF_MAX_METRIC = 65535;
