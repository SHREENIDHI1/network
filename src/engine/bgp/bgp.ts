import type { Topology } from '../../model/types';
import type { BgpNeighborConfig, NetConfig } from '../config/netConfig';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, maskToPrefix, networkOf, parseIpv4 } from '../ip/ipv4';
import { lookup, resolve, routesPackets, type Route } from '../ip/routing';

/**
 * BGP-4 with MP-BGP VPNv4 (RFC 4271, 4456, 4364), simplified.
 *
 * Like the IGPs, the converged state is computed instead of exchanging OPEN /
 * UPDATE messages with timers. "Speakers" are the global BGP process of a
 * router and one per VRF (its PE–CE side). Sessions come up when both sides
 * point at each other with matching AS numbers and source addresses and the
 * addresses are routable (eBGP: directly connected unless ebgp-multihop).
 * Paths then propagate round by round until nothing changes, following the
 * usual rules: eBGP prepends the AS and sets next hop self, iBGP keeps the
 * next hop and does not re-advertise iBGP-learned paths — except on a route
 * reflector (ORIGINATOR_ID / CLUSTER_LIST loop prevention). A PE exports VRF
 * routes as VPNv4 (RD + export RTs + VPN label, next hop = its update-source)
 * and imports VPNv4 paths whose RTs match a VRF's import RTs.
 * See Model Limitations.
 */

export const AD_EBGP = 20;
export const AD_IBGP = 200;
export const FIRST_VPN_LABEL = 1000;

export type Af = 'ipv4' | 'vpnv4';

export interface BgpPath {
  af: Af;
  network: number;
  prefixLen: number;
  rd?: string;
  /** 0 = locally originated. */
  nextHop: number;
  asPath: number[];
  origin: 'i' | '?';
  localPref: number;
  med: number;
  weight: number;
  src: 'local' | 'ebgp' | 'ibgp';
  /** Speaker the path was learned from. */
  from?: string;
  fromRid?: number;
  fromIp?: number;
  originatorId?: number;
  clusterList: number[];
  rts: string[];
  label?: number;
  /** In a VRF: path imported from VPNv4 (next hop = remote PE, label = VPN label). */
  imported?: boolean;
  /** Set when this path won best-path selection. */
  best?: boolean;
  /** Next hop resolvable (shown with "*"). */
  valid?: boolean;
}

export interface Speaker {
  id: string;
  dev: string;
  vrf?: string;
  asn: number;
  rid: number;
}

export interface BgpPeering {
  speaker: string;
  dev: string;
  vrf?: string;
  neighbor: number;
  remoteAs: number;
  /** Speaker on the other end, when found. */
  peer?: string;
  state: 'Established' | 'Idle' | 'Active' | 'Idle (Admin)';
  reason?: string;
  ibgp: boolean;
  afs: Af[];
  /** Our source address for this session. */
  source?: number;
  rrClient: { ipv4: boolean; vpnv4: boolean };
  nextHopSelf: boolean;
}

export interface BgpResult {
  speakers: Map<string, Speaker>;
  peerings: BgpPeering[];
  /** All paths (with best flags) per speaker and AF, keyed by prefix key. */
  tables: Map<string, Map<string, BgpPath[]>>;
  /** Routes to install: global per device, and per device + VRF. */
  global: Map<string, Route[]>;
  vrf: Map<string, Map<string, Route[]>>;
  /** VPN label → VRF + prefix at the egress PE ("deviceId|label"). */
  vpnLabels: Map<string, { vrf: string; network: number; prefixLen: number }>;
  problems: Array<{ deviceId: string; text: string }>;
  /** Local VPN label of a VRF prefix on a PE, if allocated. */
  vpnLabelOf(dev: string, vrf: string, network: number, prefixLen: number): number | undefined;
}

export function emptyBgp(): BgpResult {
  const vpnLabels = new Map<string, { vrf: string; network: number; prefixLen: number }>();
  return {
    speakers: new Map(),
    peerings: [],
    tables: new Map(),
    global: new Map(),
    vrf: new Map(),
    vpnLabels,
    problems: [],
    vpnLabelOf: (dev, vrf, network, prefixLen) => {
      for (const [k, v] of vpnLabels) if (k.startsWith(`${dev}|`) && v.vrf === vrf && v.network === network && v.prefixLen === prefixLen) return Number(k.split('|')[1]);
      return undefined;
    },
  };
}

export const pathKey = (p: { af: Af; rd?: string; network: number; prefixLen: number }) => `${p.af}|${p.rd ?? ''}|${p.network}/${p.prefixLen}`;
export const tableKey = (speaker: string, af: Af) => `${speaker}|${af}`;

/** Best-path comparison (negative = a better). Simplified RFC 4271 decision process. */
function better(a: BgpPath, b: BgpPath, igpCost: (nh: number) => number): number {
  if (a.weight !== b.weight) return b.weight - a.weight;
  if (a.localPref !== b.localPref) return b.localPref - a.localPref;
  if ((a.src === 'local') !== (b.src === 'local')) return a.src === 'local' ? -1 : 1;
  if (a.asPath.length !== b.asPath.length) return a.asPath.length - b.asPath.length;
  if (a.origin !== b.origin) return a.origin === 'i' ? -1 : 1;
  if (a.med !== b.med) return a.med - b.med;
  if ((a.src === 'ebgp') !== (b.src === 'ebgp')) return a.src === 'ebgp' ? -1 : 1;
  const ca = igpCost(a.nextHop);
  const cb = igpCost(b.nextHop);
  if (ca !== cb) return ca - cb;
  const ra = a.originatorId ?? a.fromRid ?? 0;
  const rb = b.originatorId ?? b.fromRid ?? 0;
  if (ra !== rb) return ra - rb;
  return (a.fromIp ?? 0) - (b.fromIp ?? 0);
}

function routerId(cfg: NetConfig, ifs: L3Interface[]): number | undefined {
  if (cfg.bgp?.routerId) return parseIpv4(cfg.bgp.routerId) ?? undefined;
  const up = ifs.filter((i) => i.up && i.ip !== undefined && !i.vrf);
  const loops = up.filter((i) => i.kind === 'loop').map((i) => i.ip!);
  const all = loops.length ? loops : up.map((i) => i.ip!);
  return all.length ? Math.max(...all) : undefined;
}

export function computeBgp(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  l3: ReadonlyMap<string, L3Interface[]>,
  globalRoutes: ReadonlyMap<string, Route[]>,
  vrfBase: ReadonlyMap<string, Map<string, Route[]>>,
): BgpResult {
  const res = emptyBgp();
  const name = (id: string) => topo.devices.find((d) => d.id === id)?.name ?? id;

  // ---------------------------------------------------------------- speakers
  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg?.bgp || !routesPackets(d.kind, cfg)) continue;
    const rid = routerId(cfg, l3.get(d.id) ?? []);
    if (rid === undefined) {
      res.problems.push({ deviceId: d.id, text: 'BGP has no router-ID: no interface with an IP address is up.' });
      continue;
    }
    res.speakers.set(d.id, { id: d.id, dev: d.id, asn: cfg.bgp.asn, rid });
    for (const [v, vc] of Object.entries(cfg.vrfs)) if (vc.rd) res.speakers.set(`${d.id}#${v}`, { id: `${d.id}#${v}`, dev: d.id, vrf: v, asn: cfg.bgp.asn, rid });
  }

  const tableOf = (sp: Speaker): Route[] => (sp.vrf ? (vrfBase.get(sp.dev)?.get(sp.vrf) ?? []) : (globalRoutes.get(sp.dev) ?? []));
  const ifOf = (dev: string, nm: string) => l3.get(dev)?.find((i) => i.name === nm);
  /** Owner of an address: device + whether it sits in a VRF. */
  const owners = new Map<number, { dev: string; vrf?: string }>();
  for (const [dev, ifs] of l3) for (const i of ifs) if (i.up && i.ip !== undefined && !owners.has(i.ip)) owners.set(i.ip, { dev, vrf: i.vrf });

  // ----------------------------------------------------------------- peerings
  interface NbrRef {
    sp: Speaker;
    ip: number;
    remoteAs: number;
    cfg?: BgpNeighborConfig;
    activate: boolean;
  }
  const nbrsOf = (sp: Speaker): NbrRef[] => {
    const cfg = configs.get(sp.dev)!.bgp!;
    if (sp.vrf)
      return Object.entries(cfg.vrfs[sp.vrf]?.neighbors ?? {})
        .map(([ip, n]) => ({ sp, ip: parseIpv4(ip) ?? -1, remoteAs: n.remoteAs, activate: n.activate }))
        .filter((n) => n.ip >= 0);
    return Object.entries(cfg.neighbors)
      .map(([ip, n]) => ({ sp, ip: parseIpv4(ip) ?? -1, remoteAs: n.remoteAs, cfg: n, activate: true }))
      .filter((n) => n.ip >= 0);
  };
  const sourceFor = (n: NbrRef): number | undefined => {
    if (n.cfg?.updateSource) return ifOf(n.sp.dev, n.cfg.updateSource)?.ip;
    const r = resolve(tableOf(n.sp), n.ip);
    return r ? ifOf(n.sp.dev, r.iface)?.ip : undefined;
  };
  const speakerOwning = (ip: number): Speaker | undefined => {
    const o = owners.get(ip);
    if (!o) return undefined;
    return res.speakers.get(o.vrf ? `${o.dev}#${o.vrf}` : o.dev);
  };
  const afsOf = (n: NbrRef): Af[] => {
    if (n.sp.vrf) return n.activate ? ['ipv4'] : [];
    const bgp = configs.get(n.sp.dev)!.bgp!;
    const out: Af[] = [];
    if (n.cfg!.ipv4 ?? !bgp.noDefaultIpv4) out.push('ipv4');
    if (n.cfg!.vpnv4) out.push('vpnv4');
    return out;
  };

  for (const sp of res.speakers.values()) {
    for (const n of nbrsOf(sp)) {
      const src = sourceFor(n);
      const peerSp = speakerOwning(n.ip);
      const p: BgpPeering = {
        speaker: sp.id,
        dev: sp.dev,
        vrf: sp.vrf,
        neighbor: n.ip,
        remoteAs: n.remoteAs,
        peer: peerSp?.id,
        state: 'Active',
        ibgp: n.remoteAs === sp.asn,
        afs: afsOf(n),
        source: src,
        rrClient: { ipv4: !!n.cfg?.rrClient, vpnv4: !!n.cfg?.rrClientVpnv4 },
        nextHopSelf: !!n.cfg?.nextHopSelf,
      };
      res.peerings.push(p);
      const fail = (state: BgpPeering['state'], reason: string) => {
        p.state = state;
        p.reason = reason;
      };
      if (n.cfg?.shutdown) {
        fail('Idle (Admin)', 'neighbor is shut down');
        continue;
      }
      if (!resolve(tableOf(sp), n.ip)) {
        fail('Idle', `no route to neighbor ${formatIpv4(n.ip)}`);
        continue;
      }
      if (src === undefined) {
        fail('Idle', `update-source ${n.cfg?.updateSource ?? ''} has no address`);
        continue;
      }
      if (!peerSp) {
        fail('Active', `no BGP speaker owns ${formatIpv4(n.ip)} (wrong address, or BGP not configured there)`);
        continue;
      }
      if (peerSp.dev === sp.dev) {
        fail('Idle', 'neighbor address belongs to this router');
        continue;
      }
      if (peerSp.asn !== n.remoteAs) {
        fail('Idle', `remote-as mismatch: configured ${n.remoteAs}, peer ${name(peerSp.dev)} is AS ${peerSp.asn}`);
        continue;
      }
      const back = nbrsOf(peerSp).find((x) => x.ip === src);
      if (!back) {
        fail('Active', `${name(peerSp.dev)} has no "neighbor ${formatIpv4(src)}" — it does not expect a session from this source address`);
        continue;
      }
      if (back.remoteAs !== sp.asn) {
        fail('Idle', `${name(peerSp.dev)} expects AS ${back.remoteAs}, but this router is AS ${sp.asn}`);
        continue;
      }
      const backSrc = sourceFor(back);
      if (backSrc !== n.ip) {
        fail('Active', `${name(peerSp.dev)} sources the session from ${backSrc !== undefined ? formatIpv4(backSrc) : 'no address'}, not ${formatIpv4(n.ip)} (update-source mismatch)`);
        continue;
      }
      if (!p.ibgp && !n.cfg?.ebgpMultihop && !back.cfg?.ebgpMultihop) {
        const direct = tableOf(sp).some((r) => r.protocol === 'C' && r.prefixLen < 32 && networkOf(n.ip, r.prefixLen) === r.network);
        if (!direct) {
          fail('Idle', 'eBGP neighbor is not directly connected (configure ebgp-multihop)');
          continue;
        }
      }
      p.state = 'Established';
      const peerAfs = afsOf(back);
      p.afs = p.afs.filter((a) => peerAfs.includes(a));
    }
  }
  const sessionsOf = (spId: string) => res.peerings.filter((p) => p.speaker === spId && p.state === 'Established' && p.peer);

  // --------------------------------------------------------- label allocation
  const labelFor = new Map<string, number>();
  const nextLabel = new Map<string, number>();
  const vpnLabel = (dev: string, vrf: string, network: number, prefixLen: number) => {
    const k = `${dev}|${vrf}|${network}/${prefixLen}`;
    let l = labelFor.get(k);
    if (l === undefined) {
      l = nextLabel.get(dev) ?? FIRST_VPN_LABEL;
      nextLabel.set(dev, l + 1);
      labelFor.set(k, l);
      res.vpnLabels.set(`${dev}|${l}`, { vrf, network, prefixLen });
    }
    return l;
  };

  // ------------------------------------------------------------ propagation
  const igpCost = (dev: string) => (nh: number) => (nh === 0 ? 0 : (lookup(globalRoutes.get(dev) ?? [], nh)?.metric ?? 1e9));
  const resolvable = (sp: Speaker, p: BgpPath): boolean => {
    if (p.src === 'local' || p.nextHop === 0) return true;
    if (p.imported) return !!resolve(globalRoutes.get(sp.dev) ?? [], p.nextHop);
    return !!resolve(tableOf(sp), p.nextHop);
  };
  /** Speaker → af → key → received paths (by sender). */
  let adjIn = new Map<string, Map<string, BgpPath[]>>();
  let best = new Map<string, Map<string, BgpPath>>();

  const localPaths = (sp: Speaker): BgpPath[] => {
    const cfg = configs.get(sp.dev)!;
    const bgp = cfg.bgp!;
    const out: BgpPath[] = [];
    const mk = (af: Af, r: { network: number; prefixLen: number }, origin: 'i' | '?', extra: Partial<BgpPath> = {}): BgpPath => ({
      af,
      network: r.network,
      prefixLen: r.prefixLen,
      nextHop: 0,
      asPath: [],
      origin,
      localPref: 100,
      med: 0,
      weight: 32768,
      src: 'local',
      clusterList: [],
      rts: [],
      ...extra,
    });
    const table = tableOf(sp);
    const ctx = sp.vrf ? bgp.vrfs[sp.vrf] : bgp;
    if (ctx) {
      for (const n of ctx.networks) {
        const net = parseIpv4(n.prefix);
        const len = maskToPrefix(n.mask);
        if (net === null || len === null) continue;
        if (table.some((r) => r.network === networkOf(net, len) && r.prefixLen === len)) out.push(mk('ipv4', { network: networkOf(net, len), prefixLen: len }, 'i'));
      }
      if (ctx.redistributeConnected) for (const r of table.filter((x) => x.protocol === 'C')) out.push(mk('ipv4', r, '?'));
      if (ctx.redistributeStatic) for (const r of table.filter((x) => x.protocol === 'S' && !x.isGateway)) out.push(mk('ipv4', r, '?'));
    }
    if (sp.vrf) {
      // Import: VPNv4 paths whose route targets match this VRF.
      const vc = cfg.vrfs[sp.vrf];
      for (const [k, p] of best.get(tableKey(sp.dev, 'vpnv4')) ?? []) {
        void k;
        if (p.src === 'local') continue;
        if (!p.rts.some((rt) => vc.importRts.includes(rt))) continue;
        out.push({ ...p, af: 'ipv4', rd: undefined, imported: true, src: 'ibgp', weight: 0, best: false });
      }
    } else {
      // Export: best VRF routes (own or CE-learned) become VPNv4 with RD, RTs and a VPN label.
      for (const [v, vc] of Object.entries(cfg.vrfs)) {
        if (!vc.rd || !res.speakers.has(`${sp.dev}#${v}`)) continue;
        for (const p of best.get(tableKey(`${sp.dev}#${v}`, 'ipv4'))?.values() ?? []) {
          if (p.imported) continue;
          out.push({ ...p, af: 'vpnv4', rd: vc.rd, rts: [...vc.exportRts], label: vpnLabel(sp.dev, v, p.network, p.prefixLen), nextHop: 0, src: 'local', weight: 32768, from: undefined, best: false });
        }
      }
    }
    return out;
  };

  const exportTo = (sp: Speaker, ses: BgpPeering, peer: Speaker, af: Af, p: BgpPath): BgpPath | null => {
    if (p.from === peer.id) return null;
    const ibgp = ses.ibgp;
    let reflected = false;
    if (ibgp && p.src === 'ibgp') {
      if (p.imported) return null;
      const fromSes = res.peerings.find((x) => x.speaker === sp.id && x.peer === p.from);
      const fromClient = !!fromSes && (af === 'vpnv4' ? fromSes.rrClient.vpnv4 : fromSes.rrClient.ipv4);
      const toClient = af === 'vpnv4' ? ses.rrClient.vpnv4 : ses.rrClient.ipv4;
      if (!fromClient && !toClient) return null;
      reflected = true;
    }
    if (sp.vrf && p.imported && ibgp) return null;
    const q: BgpPath = { ...p, from: sp.id, fromRid: sp.rid, fromIp: ses.source, weight: 0, best: false, clusterList: [...p.clusterList] };
    if (!ibgp) {
      q.asPath = [sp.asn, ...p.asPath];
      q.nextHop = ses.source!;
      q.localPref = 100;
      q.med = 0;
      q.originatorId = undefined;
      q.clusterList = [];
      q.imported = false;
    } else {
      if (p.src === 'local' || (p.src === 'ebgp' && ses.nextHopSelf) || (sp.vrf && p.imported)) q.nextHop = ses.source!;
      if (reflected) {
        q.originatorId = p.originatorId ?? p.fromRid;
        q.clusterList = [sp.rid, ...p.clusterList];
      }
    }
    return q;
  };

  const ROUNDS = 80;
  for (let round = 0; round < ROUNDS; round++) {
    // 1. Advertise current bests (and local paths) along established sessions.
    const nextIn = new Map<string, Map<string, BgpPath[]>>();
    for (const sp of res.speakers.values()) {
      for (const ses of sessionsOf(sp.id)) {
        const peer = res.speakers.get(ses.peer!)!;
        for (const af of ses.afs) {
          for (const p of best.get(tableKey(sp.id, af))?.values() ?? []) {
            const q = exportTo(sp, ses, peer, af, p);
            if (!q) continue;
            // Receiver loop checks.
            if (!ses.ibgp && q.asPath.includes(peer.asn)) continue;
            if (ses.ibgp && (q.originatorId === peer.rid || q.clusterList.includes(peer.rid))) continue;
            q.src = ses.ibgp ? 'ibgp' : 'ebgp';
            const tk = tableKey(peer.id, af);
            const m = nextIn.get(tk) ?? new Map<string, BgpPath[]>();
            const k = pathKey(q);
            m.set(k, [...(m.get(k) ?? []), q]);
            nextIn.set(tk, m);
          }
        }
      }
    }
    adjIn = nextIn;
    // 2. Best-path selection per speaker/AF/prefix.
    const nextBest = new Map<string, Map<string, BgpPath>>();
    const nextTables = new Map<string, Map<string, BgpPath[]>>();
    for (const sp of res.speakers.values()) {
      const locals = localPaths(sp);
      for (const af of ['ipv4', 'vpnv4'] as Af[]) {
        if (sp.vrf && af === 'vpnv4') continue;
        const tk = tableKey(sp.id, af);
        const cands = new Map<string, BgpPath[]>();
        for (const p of locals.filter((x) => x.af === af)) cands.set(pathKey(p), [...(cands.get(pathKey(p)) ?? []), p]);
        for (const [k, ps] of adjIn.get(tk) ?? []) cands.set(k, [...(cands.get(k) ?? []), ...ps]);
        const bm = new Map<string, BgpPath>();
        const all = new Map<string, BgpPath[]>();
        for (const [k, ps] of cands) {
          const ok = ps.filter((p) => resolvable(sp, p)).sort((a, b) => better(a, b, igpCost(sp.dev)));
          const listed = ps.map((p) => ({ ...p, best: false, valid: ok.includes(p) }));
          if (ok.length) {
            bm.set(k, ok[0]);
            const i = ps.indexOf(ok[0]);
            listed[i].best = true;
          }
          all.set(k, listed);
        }
        nextBest.set(tk, bm);
        nextTables.set(tk, all);
      }
    }
    const sig = (m: Map<string, Map<string, BgpPath>>) =>
      [...m]
        .map(([tk, bm]) => `${tk}:${[...bm].map(([k, p]) => `${k}>${p.nextHop},${p.from ?? '-'},${p.asPath.join('.')},${p.label ?? ''}`).sort().join(';')}`)
        .sort()
        .join('\n');
    const stable = sig(nextBest) === sig(best);
    best = nextBest;
    res.tables = nextTables;
    if (stable && round > 0) break;
  }

  // ------------------------------------------------------------ install routes
  for (const sp of res.speakers.values()) {
    const bm = best.get(tableKey(sp.id, 'ipv4'));
    if (!bm) continue;
    const routes: Route[] = [];
    for (const p of bm.values()) {
      if (p.src === 'local') continue;
      const ibgp = p.src === 'ibgp';
      routes.push({
        network: p.network,
        prefixLen: p.prefixLen,
        protocol: 'B',
        ad: ibgp ? AD_IBGP : AD_EBGP,
        metric: p.med,
        nextHop: p.nextHop,
        ...(p.imported ? { vpnLabel: p.label } : {}),
        bgp: { ibgp },
      });
    }
    if (sp.vrf) {
      const m = res.vrf.get(sp.dev) ?? new Map<string, Route[]>();
      m.set(sp.vrf, routes);
      res.vrf.set(sp.dev, m);
    } else res.global.set(sp.dev, routes);
  }
  return res;
}

/** Route distinguisher / route target syntax: "ASN:nn" or "A.B.C.D:nn". */
export function validRdRt(s: string): boolean {
  const m = /^(\d{1,10}|\d{1,3}(?:\.\d{1,3}){3}):(\d{1,10})$/.exec(s);
  if (!m) return false;
  if (m[1].includes('.')) return parseIpv4(m[1]) !== null && Number(m[2]) <= 65535;
  return Number(m[1]) <= 4294967295 && Number(m[2]) <= (Number(m[1]) > 65535 ? 65535 : 4294967295);
}
