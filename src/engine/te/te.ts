import type { Topology } from '../../model/types';
import type { NetConfig, TeTunnelConfig } from '../config/netConfig';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import type { LdpResult } from '../mpls/ldp';
import type { OspfResult } from '../ospf/ospf';
import { portKey, type PhysicalState } from '../physical/linkState';

/**
 * MPLS Traffic Engineering with RSVP-TE (RFC 3209) and fast reroute
 * (RFC 4090, facility backup), simplified.
 *
 * Computed like the other control planes:
 *  - TE links: OSPF FULL adjacencies where both routers run "mpls traffic-eng
 *    tunnels" with an OSPF TE router-ID and area, both interfaces have
 *    "mpls traffic-eng tunnels" and RSVP ("ip rsvp bandwidth").
 *  - Each tunnel tries its path-options in order: strict explicit hops
 *    ("next-address"), CSPF avoiding "exclude-address" entries, or dynamic
 *    CSPF (shortest TE metric = OSPF cost) — all with the bandwidth constraint.
 *  - Bandwidth is admitted tunnel by tunnel (heads in name order).
 *  - Labels: each downstream router allocates one per LSP; the tail answers
 *    implicit-null (penultimate hop popping).
 *  - An established LSP keeps its path while the path stays valid. If a link
 *    on it fails and the upstream router (PLR) has a backup tunnel for that
 *    link ("mpls traffic-eng backup-path") reaching the next hop or next-next
 *    hop, the LSP stays up on the backup ("FRR active") until the head end is
 *    told to re-optimise. Without protection the head re-signals at once.
 */

export const FIRST_TE_LABEL = 3000;
export const IMPLICIT_NULL = 3;
/** IOS default reservable bandwidth with "ip rsvp bandwidth" and no value. */
export const RSVP_DEFAULT_PERCENT = 75;

export interface TeLink {
  dev: string;
  iface: string;
  ip: number;
  peerDev: string;
  peerIface: string;
  peerIp: number;
  cost: number;
  reservableKbps: number;
  reservedKbps: number;
}

export interface TeHop {
  dev: string;
  /** Outgoing interface towards the next hop (undefined at the tail). */
  outIface?: string;
  /** Next hop's interface address. */
  nextIp?: number;
  /** Label this router allocated for the LSP (undefined at the head; 3 = implicit-null at the tail). */
  inLabel?: number;
}

export type FrrState = 'none' | 'ready' | 'active';

export interface TeLsp {
  key: string;
  head: string;
  tunnel: string;
  number: number;
  destination?: number;
  tail?: string;
  state: 'up' | 'down';
  reason?: string;
  pathOption?: { pref: number; kind: 'explicit' | 'dynamic'; name?: string };
  hops: TeHop[];
  weight: number;
  bandwidthKbps: number;
  autoroute: boolean;
  frr: {
    requested: boolean;
    state: FrrState;
    /** Hops whose outgoing link has a usable backup: hop index → backup LSP key and merge-point hop index. */
    protectedHops: Map<number, { backup: string; merge: number }>;
    /** While active: the failed hop index (PLR) and its backup. */
    active?: { plr: number; backup: string; merge: number };
  };
}

export interface TeResult {
  routers: Map<string, number>;
  links: TeLink[];
  lsps: TeLsp[];
  /** "deviceId|label" → LSP and the index of this router in its hops. */
  byInLabel: Map<string, { lsp: TeLsp; index: number }>;
  problems: Array<{ deviceId: string; text: string }>;
}

/** Path memory between recomputes: "head|TunnelN" → config signature and hop path. */
export type TeMemory = Map<string, { sig: string; hops: Array<{ dev: string; outIface?: string }>; option?: TeLsp['pathOption'] }>;

export const emptyTe = (): TeResult => ({ routers: new Map(), links: [], lsps: [], byInLabel: new Map(), problems: [] });

export const tunnelNumber = (name: string) => Number(/(\d+)$/.exec(name)?.[1] ?? 0);

function sigOf(t: TeTunnelConfig, paths: NetConfig['explicitPaths']): string {
  return JSON.stringify({ ...t, paths: t.pathOptions.map((o) => (o.name ? paths[o.name] : null)) });
}

export function computeTe(
  topo: Topology,
  configs: Map<string, NetConfig>,
  l3: Map<string, L3Interface[]>,
  phys: PhysicalState,
  ospf: OspfResult,
  ldp: LdpResult,
  memory: TeMemory,
): TeResult {
  const res = emptyTe();
  const name = (id: string) => topo.devices.find((d) => d.id === id)?.name ?? id;

  // TE routers: global TE + OSPF TE router-id and areas.
  for (const d of topo.devices) {
    const c = configs.get(d.id);
    if (!c?.mpls.teTunnels || !c.ospf?.teRouterId) continue;
    const rid = (l3.get(d.id) ?? []).find((i) => i.name === c.ospf!.teRouterId && i.up)?.ip;
    if (rid === undefined) {
      res.problems.push({ deviceId: d.id, text: `TE router-ID interface ${c.ospf.teRouterId} has no address or is down` });
      continue;
    }
    res.routers.set(d.id, rid);
  }

  const speedKbps = (dev: string, iface: string) => {
    const port = (l3.get(dev) ?? []).find((i) => i.name === iface)?.port ?? iface;
    const forced = configs.get(dev)?.interfaces[iface]?.speedMbps;
    return forced ? forced * 1000 : (phys.ports.get(portKey(dev, port))?.speedGbps ?? 0) * 1_000_000;
  };
  const teArea = (dev: string, area: number) => (configs.get(dev)?.ospf?.teAreas ?? []).includes(area);
  for (const n of ospf.neighbors) {
    if (n.state !== 'FULL') continue;
    if (!res.routers.has(n.deviceId) || !res.routers.has(n.neighborDeviceId)) continue;
    if (!teArea(n.deviceId, n.area) || !teArea(n.neighborDeviceId, n.area)) continue;
    const back = ospf.neighbors.find((m) => m.deviceId === n.neighborDeviceId && m.neighborDeviceId === n.deviceId && m.state === 'FULL' && m.area === n.area);
    if (!back) continue;
    const ic = configs.get(n.deviceId)!.interfaces[n.iface];
    const pc = configs.get(n.neighborDeviceId)!.interfaces[back.iface];
    if (!ic?.teEnabled || !pc?.teEnabled || ic.rsvpBandwidth === undefined || pc.rsvpBandwidth === undefined) continue;
    const myIp = (l3.get(n.deviceId) ?? []).find((i) => i.name === n.iface)?.ip;
    if (myIp === undefined) continue;
    const reservable = ic.rsvpBandwidth === 'default' ? Math.floor((speedKbps(n.deviceId, n.iface) * RSVP_DEFAULT_PERCENT) / 100) : ic.rsvpBandwidth;
    res.links.push({
      dev: n.deviceId,
      iface: n.iface,
      ip: myIp,
      peerDev: n.neighborDeviceId,
      peerIface: back.iface,
      peerIp: n.neighborIp,
      cost: ospf.interfaces.find((i) => i.deviceId === n.deviceId && i.iface === n.iface)?.cost ?? 1,
      reservableKbps: reservable,
      reservedKbps: 0,
    });
  }
  const linkOf = (dev: string, iface?: string) => res.links.find((l) => l.dev === dev && l.iface === iface);
  const ownerOfRid = (ip: number) => [...res.routers].find(([, r]) => r === ip)?.[0];
  const addrOwner = (ip: number) => {
    for (const [dev, ifs] of l3) if (ifs.some((i) => i.ip === ip)) return dev;
    return undefined;
  };

  // CSPF: shortest TE-metric path with enough unreserved bandwidth, avoiding excluded links / nodes.
  const cspf = (from: string, to: string, bw: number, exclude: Set<number>): Array<{ dev: string; outIface?: string }> | null => {
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, TeLink>();
    const done = new Set<string>();
    for (;;) {
      let cur: string | undefined;
      for (const [d, v] of dist) if (!done.has(d) && (cur === undefined || v < dist.get(cur)!)) cur = d;
      if (cur === undefined) break;
      if (cur === to) break;
      done.add(cur);
      for (const l of res.links) {
        if (l.dev !== cur || done.has(l.peerDev)) continue;
        if (l.reservableKbps - l.reservedKbps < bw) continue;
        if (exclude.has(l.ip) || exclude.has(l.peerIp) || exclude.has(res.routers.get(l.peerDev)!)) continue;
        const nd = dist.get(cur)! + l.cost;
        if (nd < (dist.get(l.peerDev) ?? Infinity)) {
          dist.set(l.peerDev, nd);
          prev.set(l.peerDev, l);
        }
      }
    }
    if (!dist.has(to)) return null;
    const path: Array<{ dev: string; outIface?: string }> = [{ dev: to }];
    for (let d = to; d !== from; ) {
      const l = prev.get(d)!;
      path.unshift({ dev: l.dev, outIface: l.iface });
      d = l.dev;
    }
    return path;
  };

  const validPath = (p: Array<{ dev: string; outIface?: string }>, bw: number) =>
    p.slice(0, -1).every((h, i) => {
      const l = linkOf(h.dev, h.outIface);
      return !!l && l.peerDev === p[i + 1].dev && l.reservableKbps - l.reservedKbps >= bw;
    });

  const reserve = (p: Array<{ dev: string; outIface?: string }>, bw: number) => {
    for (const h of p.slice(0, -1)) linkOf(h.dev, h.outIface)!.reservedKbps += bw;
  };

  // Collect tunnels: plain ones (incl. backups) first, then FRR-protected ones; heads in name order.
  const tunnels: Array<{ dev: string; tname: string; t: TeTunnelConfig }> = [];
  for (const d of [...topo.devices].sort((a, b) => a.name.localeCompare(b.name)))
    for (const [tname, t] of Object.entries(configs.get(d.id)?.teTunnels ?? {})) tunnels.push({ dev: d.id, tname, t });
  tunnels.sort((a, b) => Number(a.t.frr) - Number(b.t.frr) || tunnelNumber(a.tname) - tunnelNumber(b.tname));

  const seen = new Set<string>();
  for (const { dev, tname, t } of tunnels) {
    const key = `${dev}|${tname}`;
    seen.add(key);
    const cfg = configs.get(dev)!;
    const dest = t.destination ? parseIpv4(t.destination) : null;
    const lsp: TeLsp = {
      key,
      head: dev,
      tunnel: tname,
      number: tunnelNumber(tname),
      destination: dest ?? undefined,
      state: 'down',
      hops: [],
      weight: 0,
      bandwidthKbps: t.bandwidthKbps,
      autoroute: t.autoroute,
      frr: { requested: t.frr, state: 'none', protectedHops: new Map() },
    };
    res.lsps.push(lsp);
    const fail = (reason: string) => {
      lsp.reason = reason;
      memory.delete(key);
    };
    if (t.shutdown) {
      fail('tunnel is administratively down');
      continue;
    }
    if (t.mode !== 'mpls-te') {
      fail('"tunnel mode mpls traffic-eng" is not configured');
      continue;
    }
    if (!cfg.mpls.teTunnels) {
      fail('"mpls traffic-eng tunnels" is not enabled globally on the head end');
      continue;
    }
    if (!res.routers.has(dev)) {
      fail('head end has no OSPF TE router-ID / area ("mpls traffic-eng router-id", "mpls traffic-eng area")');
      continue;
    }
    if (dest === null) {
      fail('no "tunnel destination"');
      continue;
    }
    const tail = ownerOfRid(dest);
    lsp.tail = tail;
    if (!tail) {
      const o = addrOwner(dest);
      fail(o ? `${formatIpv4(dest)} is on ${name(o)}, but it is not that router's TE router-ID` : `destination ${formatIpv4(dest)} is not in the TE topology`);
      continue;
    }
    if (!t.pathOptions.length) {
      fail('no path-option configured');
      continue;
    }
    const sig = sigOf(t, cfg.explicitPaths);
    const mem = memory.get(key);
    let path: Array<{ dev: string; outIface?: string }> | null = null;
    let reasons: string[] = [];

    if (mem && mem.sig === sig && mem.hops.length && mem.hops[mem.hops.length - 1].dev === tail) {
      if (validPath(mem.hops, 0)) path = mem.hops;
      else if (t.frr) {
        // A link on the established path failed: can a PLR protect it?
        const i = mem.hops.findIndex((h, k) => k < mem.hops.length - 1 && !(linkOf(h.dev, h.outIface)?.peerDev === mem.hops[k + 1].dev));
        const plr = mem.hops[i];
        const bk = configs.get(plr.dev)?.interfaces[plr.outIface ?? '']?.teBackupPath;
        const b = bk ? res.lsps.find((x) => x.key === `${plr.dev}|${bk}` && x.state === 'up') : undefined;
        const merge = b ? [i + 1, i + 2].find((m) => m < mem.hops.length && mem.hops[m].dev === b.tail) : undefined;
        const restOk = merge !== undefined && validPath(mem.hops.slice(0, i + 1), 0) && validPath(mem.hops.slice(merge), 0);
        if (b && merge !== undefined && restOk) {
          path = mem.hops;
          lsp.frr.active = { plr: i, backup: b.key, merge };
        }
      }
    }
    if (!path) {
      for (const o of [...t.pathOptions].sort((a, b) => a.pref - b.pref)) {
        let p: Array<{ dev: string; outIface?: string }> | null = null;
        if (o.kind === 'dynamic') {
          p = cspf(dev, tail, t.bandwidthKbps, new Set());
          if (!p) reasons.push(`path-option ${o.pref} dynamic: no path with ${t.bandwidthKbps} kbit/s available`);
        } else {
          const ep = o.name ? cfg.explicitPaths[o.name] : undefined;
          if (!ep) {
            reasons.push(`path-option ${o.pref}: explicit path ${o.name ?? '?'} is not defined`);
            continue;
          }
          const nexts = ep.entries.filter((e) => e.kind === 'next');
          if (!nexts.length) {
            p = cspf(dev, tail, t.bandwidthKbps, new Set(ep.entries.map((e) => parseIpv4(e.address)!)));
            if (!p) reasons.push(`path-option ${o.pref} (${o.name}): no path avoiding the excluded addresses with ${t.bandwidthKbps} kbit/s available`);
          } else {
            p = [{ dev }];
            let cur = dev;
            for (const e of nexts) {
              const a = parseIpv4(e.address)!;
              const l = res.links.find((x) => x.dev === cur && (x.peerIp === a || res.routers.get(x.peerDev) === a));
              if (!l) {
                reasons.push(`path-option ${o.pref} (${o.name}): next-address ${e.address} is not a TE neighbour of ${name(cur)} (strict hop)`);
                p = null;
                break;
              }
              if (l.reservableKbps - l.reservedKbps < t.bandwidthKbps) {
                reasons.push(`path-option ${o.pref} (${o.name}): ${name(l.dev)} ${l.iface} has only ${l.reservableKbps - l.reservedKbps} kbit/s unreserved`);
                p = null;
                break;
              }
              p[p.length - 1].outIface = l.iface;
              p.push({ dev: l.peerDev });
              cur = l.peerDev;
            }
            if (p && cur !== tail) {
              reasons.push(`path-option ${o.pref} (${o.name}): explicit path ends at ${name(cur)}, not at the destination ${name(tail)}`);
              p = null;
            }
          }
        }
        if (p) {
          path = p;
          lsp.pathOption = o;
          reasons = [];
          break;
        }
      }
    } else lsp.pathOption = mem?.option;
    if (!path) {
      fail(reasons.join('; ') || 'no path');
      continue;
    }
    if (!lsp.frr.active && !validPath(path, t.bandwidthKbps)) {
      fail(`not enough unreserved bandwidth for ${t.bandwidthKbps} kbit/s on the path`);
      continue;
    }
    reserve(lsp.frr.active ? [] : path, t.bandwidthKbps);
    lsp.state = 'up';
    lsp.hops = path.map((h, i) => ({ dev: h.dev, outIface: h.outIface, nextIp: i < path!.length - 1 ? linkOf(h.dev, h.outIface)?.peerIp : undefined }));
    lsp.weight = path.slice(0, -1).reduce((a, h) => a + (linkOf(h.dev, h.outIface)?.cost ?? 0), 0);
    memory.set(key, { sig, hops: path.map((h) => ({ dev: h.dev, outIface: h.outIface })), option: lsp.pathOption });
  }
  for (const k of [...memory.keys()]) if (!seen.has(k)) memory.delete(k);

  // Labels: per router, after LDP's labels and from FIRST_TE_LABEL at the lowest.
  const next = new Map<string, number>();
  const alloc = (dev: string) => {
    const v = next.get(dev) ?? Math.max(FIRST_TE_LABEL, ...[...(ldp.local.get(dev)?.values() ?? [])].map((l) => l + 1));
    next.set(dev, v + 1);
    return v;
  };
  for (const lsp of res.lsps) {
    if (lsp.state !== 'up') continue;
    lsp.hops.forEach((h, i) => {
      if (i === 0) return;
      h.inLabel = i === lsp.hops.length - 1 ? IMPLICIT_NULL : alloc(h.dev);
      if (h.inLabel !== IMPLICIT_NULL) res.byInLabel.set(`${h.dev}|${h.inLabel}`, { lsp, index: i });
    });
  }

  // FRR protection status of every FRR-requested LSP.
  for (const lsp of res.lsps) {
    if (lsp.state !== 'up' || !lsp.frr.requested) continue;
    lsp.hops.forEach((h, i) => {
      if (i >= lsp.hops.length - 1) return;
      const bk = configs.get(h.dev)?.interfaces[h.outIface ?? '']?.teBackupPath;
      const b = bk ? res.lsps.find((x) => x.key === `${h.dev}|${bk}` && x.state === 'up') : undefined;
      if (!b) return;
      const merge = [i + 1, i + 2].find((m) => m < lsp.hops.length && lsp.hops[m].dev === b.tail);
      const usesLink = b.hops.some((bh) => bh.dev === h.dev && bh.outIface === h.outIface);
      if (merge !== undefined && !usesLink) lsp.frr.protectedHops.set(i, { backup: b.key, merge });
    });
    lsp.frr.state = lsp.frr.active ? 'active' : lsp.frr.protectedHops.size ? 'ready' : 'none';
  }
  return res;
}

/** Outgoing label at hop `i` of an LSP: the next router's label, or 'pop' (implicit-null). */
export function outLabel(lsp: TeLsp, i: number): number | 'pop' {
  const n = lsp.hops[i + 1];
  return !n || n.inLabel === IMPLICIT_NULL || n.inLabel === undefined ? 'pop' : n.inLabel;
}
