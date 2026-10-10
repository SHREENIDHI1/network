import type { NetConfig, QosClass } from '../config/netConfig';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { lookup, resolve } from '../ip/routing';
import { prefixKey } from '../mpls/ldp';
import type { TeLsp } from '../te/te';
import { portKey } from '../physical/linkState';
import type { Sim } from '../sim';
import { appClass } from './apps';

/**
 * Steady-state ("fluid") QoS analysis for the traffic flows configured on
 * hosts. Each flow is followed hop by hop through the routing tables; every
 * L3 egress interface is a queue with capacity = its link speed. Under
 * congestion the interface's output policy decides who gets bandwidth:
 *  - LLQ "priority": served first, policed to its percentage
 *  - CBWFQ "bandwidth": guaranteed percentage, then excess shared by weight
 *  - no policy: FIFO, every flow loses the same fraction
 * Input policies can re-mark DSCP ("set dscp").
 */

export interface QueueClassStat {
  name: string;
  kind: 'priority' | 'bandwidth' | 'default' | 'fifo';
  offeredMbps: number;
  deliveredMbps: number;
}

export interface QueueStat {
  deviceId: string;
  iface: string;
  capacityMbps: number;
  offeredMbps: number;
  deliveredMbps: number;
  policy?: string;
  classes: QueueClassStat[];
}

export interface FlowStat {
  id: string;
  srcDeviceId: string;
  dst: string;
  app: string;
  dscp: number;
  offeredMbps: number;
  deliveredMbps: number;
  lossPct: number;
  /** L3 egress hops; exp is set where the packet leaves labelled (MPLS EXP / TC of the top label). */
  hops: Array<{ deviceId: string; iface: string; dscp: number; exp?: number }>;
  bottleneck?: { deviceId: string; iface: string };
  error?: string;
}

export interface QosReport {
  flows: FlowStat[];
  queues: QueueStat[];
}

const SVI_CAPACITY_MBPS = 1000;

/**
 * Class of a packet. A labelled packet (exp defined) only matches "match mpls experimental topmost";
 * an IP packet only matches "match dscp" (as on IOS, where an MPLS packet has no IP header to match).
 */
export function classify(cfg: NetConfig, policyName: string | undefined, dscp: number, exp?: number): { cls?: QosClass; name: string } {
  const pm = policyName ? cfg.qos.policyMaps[policyName] : undefined;
  if (!pm) return { name: 'class-default' };
  for (const c of pm.classes) {
    if (c.name === 'class-default') continue;
    const cm = cfg.qos.classMaps[c.name];
    if (!cm) continue;
    const list = exp === undefined ? cm.dscp : (cm.exp ?? []);
    const v = exp === undefined ? dscp : exp;
    const hit = cm.matchAll ? list.length === 1 && list[0] === v : list.includes(v);
    if (hit) return { cls: c, name: c.name };
  }
  return { cls: pm.classes.find((c) => c.name === 'class-default'), name: 'class-default' };
}

interface Item {
  flow: number;
  hop: number;
  rate: number;
  dscp: number;
  exp?: number;
}

/** Allocates capacity among items at one queue; returns delivered rate per item and class stats. */
export function allocate(
  capacity: number,
  items: Item[],
  cfg: NetConfig | undefined,
  policy: string | undefined,
): { delivered: number[]; classes: QueueClassStat[] } {
  const total = items.reduce((a, b) => a + b.rate, 0);
  const pm = policy && cfg ? cfg.qos.policyMaps[policy] : undefined;
  if (!pm || !cfg) {
    const k = total > capacity ? capacity / total : 1;
    return {
      delivered: items.map((i) => i.rate * k),
      classes: [{ name: 'FIFO', kind: 'fifo', offeredMbps: total, deliveredMbps: Math.min(total, capacity) }],
    };
  }
  // Group items by class.
  const groups = new Map<string, { cls?: QosClass; idx: number[]; offered: number }>();
  items.forEach((it, i) => {
    const { cls, name } = classify(cfg, policy, it.dscp, it.exp);
    const g = groups.get(name) ?? { cls, idx: [], offered: 0 };
    g.idx.push(i);
    g.offered += it.rate;
    groups.set(name, g);
  });
  for (const c of pm.classes) if (!groups.has(c.name)) groups.set(c.name, { cls: c, idx: [], offered: 0 });
  if (!groups.has('class-default')) groups.set('class-default', { idx: [], offered: 0 });

  const give = new Map<string, number>();
  if (total <= capacity) for (const [n, g] of groups) give.set(n, g.offered);
  else {
    let remaining = capacity;
    // 1. Priority (LLQ): served first, policed to its rate under congestion.
    for (const [n, g] of groups) {
      if (!g.cls?.priorityPercent) continue;
      const v = Math.min(g.offered, (g.cls.priorityPercent / 100) * capacity, remaining);
      give.set(n, v);
      remaining -= v;
    }
    // 2. Bandwidth guarantees.
    const others = [...groups].filter(([, g]) => !g.cls?.priorityPercent);
    const usedPct = pm.classes.reduce((a, c) => a + (c.priorityPercent ?? 0) + (c.bandwidthPercent ?? 0), 0);
    const weight = (g: { cls?: QosClass }) => g.cls?.bandwidthPercent ?? Math.max(1, 100 - usedPct);
    const guaranteed = others.map(([n, g]) => [n, Math.min(g.offered, (weight(g) / 100) * capacity)] as const);
    const gSum = guaranteed.reduce((a, [, v]) => a + v, 0);
    const scale = gSum > remaining ? remaining / gSum : 1;
    for (const [n, v] of guaranteed) give.set(n, v * scale);
    remaining -= gSum * scale;
    // 3. Excess shared by weight among classes with unmet demand (water-filling).
    for (let iter = 0; iter < 10 && remaining > 1e-9; iter++) {
      const hungry = others.filter(([n, g]) => g.offered - (give.get(n) ?? 0) > 1e-9);
      if (!hungry.length) break;
      const wSum = hungry.reduce((a, [, g]) => a + weight(g), 0);
      let spent = 0;
      for (const [n, g] of hungry) {
        const add = Math.min(g.offered - (give.get(n) ?? 0), (remaining * weight(g)) / wSum);
        give.set(n, (give.get(n) ?? 0) + add);
        spent += add;
      }
      remaining -= spent;
      if (spent < 1e-9) break;
    }
  }
  const delivered = new Array<number>(items.length).fill(0);
  const classes: QueueClassStat[] = [];
  for (const [n, g] of groups) {
    const v = give.get(n) ?? 0;
    const k = g.offered > 0 ? v / g.offered : 0;
    for (const i of g.idx) delivered[i] = items[i].rate * k;
    classes.push({
      name: n,
      kind: g.cls?.priorityPercent ? 'priority' : n === 'class-default' ? 'default' : 'bandwidth',
      offeredMbps: g.offered,
      deliveredMbps: v,
    });
  }
  return { delivered, classes };
}

export function analyseTraffic(sim: Sim): QosReport {
  const flows: FlowStat[] = [];
  for (const d of sim.topology.devices) {
    const cfg = sim.config(d.id);
    for (const f of cfg?.traffic ?? []) {
      const stat: FlowStat = {
        id: f.id,
        srcDeviceId: d.id,
        dst: f.dst,
        app: appClass(f.app)?.label ?? f.app,
        dscp: f.dscp,
        offeredMbps: f.rateMbps,
        deliveredMbps: 0,
        lossPct: 100,
        hops: [],
      };
      const dst = parseIpv4(f.dst);
      if (dst === null) {
        stat.error = 'Invalid destination';
        flows.push(stat);
        continue;
      }
      const w = walkFlow(sim, d.id, dst, f.dscp);
      stat.hops = w.hops;
      if (w.error) stat.error = w.error;
      flows.push(stat);
    }
  }

  // Queue points and iterative allocation.
  const queueOf = new Map<string, Item[]>();
  flows.forEach((f, fi) => {
    if (f.error) return;
    f.hops.forEach((h, hi) => {
      const k = `${h.deviceId}|${h.iface}`;
      queueOf.set(k, [...(queueOf.get(k) ?? []), { flow: fi, hop: hi, rate: 0, dscp: h.dscp, exp: h.exp }]);
    });
  });
  const ratio = flows.map((f) => f.hops.map(() => 1));
  const capOf = (deviceId: string, iface: string) => {
    const l3 = sim.interfaces(deviceId).find((i) => i.name === iface);
    if (l3?.kind === 'svi') return SVI_CAPACITY_MBPS;
    const port = l3?.port ?? iface;
    return (sim.phys.ports.get(portKey(deviceId, port))?.speedGbps ?? 0) * 1000;
  };
  const queues: QueueStat[] = [];
  for (let pass = 0; pass < 4; pass++) {
    queues.length = 0;
    for (const [k, items] of queueOf) {
      const [deviceId, iface] = k.split('|');
      for (const it of items) it.rate = flows[it.flow].offeredMbps * ratio[it.flow].slice(0, it.hop).reduce((a, b) => a * b, 1);
      const cfg = sim.config(deviceId);
      const policy = cfg?.interfaces[iface]?.servicePolicyOut;
      const cap = capOf(deviceId, iface);
      const { delivered, classes } = allocate(cap, items, cfg, policy);
      items.forEach((it, i) => (ratio[it.flow][it.hop] = it.rate > 0 ? delivered[i] / it.rate : 1));
      const offered = items.reduce((a, b) => a + b.rate, 0);
      queues.push({ deviceId, iface, capacityMbps: cap, offeredMbps: offered, deliveredMbps: delivered.reduce((a, b) => a + b, 0), policy, classes });
    }
  }
  flows.forEach((f, fi) => {
    if (f.error) return;
    f.deliveredMbps = f.offeredMbps * ratio[fi].reduce((a, b) => a * b, 1);
    f.lossPct = f.offeredMbps > 0 ? Math.max(0, (1 - f.deliveredMbps / f.offeredMbps) * 100) : 0;
    let worst = 1;
    ratio[fi].forEach((r, hi) => {
      if (r < worst - 1e-9) {
        worst = r;
        f.bottleneck = { deviceId: f.hops[hi].deviceId, iface: f.hops[hi].iface };
      }
    });
  });
  return { flows, queues };
}

type Hop = FlowStat['hops'][number];

/** Physical hops of an up TE LSP (via the backup tunnel while FRR is active). */
export function teHops(sim: Sim, lsp: TeLsp): Array<{ deviceId: string; iface: string }> {
  const a = lsp.frr.active;
  const main = lsp.hops.slice(0, -1).map((h) => ({ deviceId: h.dev, iface: h.outIface! }));
  if (!a) return main;
  const b = sim.te.lsps.find((x) => x.key === a.backup);
  const bh = b ? b.hops.slice(0, -1).map((h) => ({ deviceId: h.dev, iface: h.outIface! })) : [];
  return [...main.slice(0, a.plr), ...bh, ...main.slice(a.merge)];
}

/**
 * Follows a flow hop by hop the way the data plane would: IP routing, VRF + VPN labels,
 * LDP imposition / PHP, TE tunnels (autoroute, FRR) and pseudowire attachment circuits.
 */
export function walkFlow(sim: Sim, src: string, dst: number, dscp0: number): { hops: Hop[]; error?: string } {
  const hops: Hop[] = [];
  const name = (id: string) => sim.device(id)?.name ?? id;
  const owner = (ip: number) => sim.addressOwner(ip);
  let dev = src;
  let ingress: string | undefined;
  let dscp = dscp0;
  let vrf: string | undefined;
  let impExp: number | undefined;

  /** Labelled transit from `from` to the router owning `target`; returns that router and its ingress interface. */
  const core = (from: string, target: number, exp: number, keepLabel: boolean): { dev: string; ingress?: string } | string => {
    let d = from;
    let e = exp;
    for (let g = 0; g < 32; g++) {
      if (owner(target)?.deviceId === d) return { dev: d, ingress: hops.length ? peerIface(hops[hops.length - 1]) : undefined };
      const r = resolve(sim.routingTable(d), target);
      if (!r) return `No route to ${formatIpv4(target)} on ${name(d)}`;
      const lsp = sim.teHead(d, r.iface);
      if (lsp) {
        const th = teHops(sim, lsp);
        th.forEach((h, i) => hops.push({ ...h, dscp, exp: keepLabel || i < th.length - 1 ? e : undefined }));
        d = lsp.tail!;
        continue;
      }
      const dcfg = sim.config(d)!;
      const ic = hops.length ? peerIface(hops[hops.length - 1]) : undefined;
      if (ic && dcfg.interfaces[ic]?.servicePolicyIn) {
        const { cls } = classify(dcfg, dcfg.interfaces[ic].servicePolicyIn, dscp, e);
        if (cls?.setExpTopmost !== undefined) e = cls.setExpTopmost;
      }
      const ftn = sim.ldp.byFec.get(`${d}|${prefixKey(r.route.network, r.route.prefixLen)}`)?.[0];
      const labelled = keepLabel || (ftn !== undefined && typeof ftn.out === 'number');
      hops.push({ deviceId: d, iface: r.iface, dscp, exp: labelled ? e : undefined });
      e = outPolicyExp(d, r.iface, dscp, e) ?? e;
      const n = owner(r.nextHop);
      if (!n) return `Next hop ${formatIpv4(r.nextHop)} not found from ${name(d)}`;
      d = n.deviceId;
    }
    return 'Path too long';
  };
  const peerIface = (h: Hop) => {
    const l3 = sim.interfaces(h.deviceId).find((i) => i.name === h.iface);
    const st = sim.phys.ports.get(portKey(h.deviceId, l3?.port ?? h.iface));
    if (!st?.peer) return undefined;
    const peerIfs = sim.interfaces(st.peer.deviceId).filter((i) => i.port === st.peer!.portId);
    return (peerIfs.find((i) => i.kind === 'port') ?? peerIfs[0])?.name;
  };
  const outPolicyExp = (d: string, iface: string, dsc: number, e: number | undefined) => {
    const c = sim.config(d)!;
    const pol = c.interfaces[iface]?.servicePolicyOut;
    if (e === undefined || !pol) return e;
    return classify(c, pol, dsc, e).cls?.setExpTopmost ?? e;
  };

  for (let guard = 0; guard < 64; guard++) {
    const o = owner(dst);
    // A host behind the egress PE has no VRF of its own: only a router's own address must sit in the flow's VRF.
    if (o?.deviceId === dev && (guard === 0 || !vrf || !sim.forwards(dev) || sim.interfaces(dev).find((i) => i.name === o.iface)?.vrf === vrf))
      return { hops };
    const dcfg = sim.config(dev)!;
    impExp = undefined;
    if (ingress && dcfg.interfaces[ingress]?.servicePolicyIn) {
      const { cls } = classify(dcfg, dcfg.interfaces[ingress].servicePolicyIn, dscp);
      if (cls?.setDscp !== undefined) dscp = cls.setDscp;
      impExp = cls?.setExpImposition;
    }
    if (guard > 0 && !sim.forwards(dev)) return { hops, error: `${name(dev)} does not route` };
    if (ingress) vrf = sim.interfaces(dev).find((i) => i.name === ingress)?.vrf;

    // Pseudowire attachment circuit: the frame crosses the core to the remote PE.
    const xc = ingress ? dcfg.interfaces[ingress]?.xconnect : undefined;
    if (xc) {
      let e = sim.pw.endpoints.find((x) => x.deviceId === dev && (('vfi' in xc && x.vfi === xc.vfi) || x.iface === ingress) && x.status === 'UP');
      if (e && 'vfi' in xc) {
        const dstDev = o?.deviceId;
        e =
          sim.pw.endpoints.find((x) => {
            if (x.deviceId !== dev || x.vfi !== xc.vfi || x.status !== 'UP' || !x.remote) return false;
            const acs = sim.pw.vfiAcs.get(`${x.remote.deviceId}|${x.remote.vfi}`) ?? [];
            return acs.some((a) => sim.phys.ports.get(portKey(x.remote!.deviceId, a))?.peer?.deviceId === dstDev);
          }) ?? undefined;
      }
      if (!e?.remote) return { hops, error: `Pseudowire from ${name(dev)} ${ingress} is not up (or the destination is not behind it)` };
      const c = core(dev, e.peer, impExp ?? 0, true);
      if (typeof c === 'string') return { hops, error: c };
      const rem = e.remote;
      const acIf = rem.vfi
        ? (sim.pw.vfiAcs.get(`${rem.deviceId}|${rem.vfi}`) ?? []).find(
            (a) => sim.phys.ports.get(portKey(rem.deviceId, a))?.peer?.deviceId === o?.deviceId,
          )
        : rem.iface;
      if (!acIf) return { hops, error: `No attachment circuit towards ${formatIpv4(dst)} on ${name(rem.deviceId)}` };
      hops.push({ deviceId: rem.deviceId, iface: acIf, dscp });
      return { hops };
    }

    const table = sim.routingTable(dev, vrf);
    const vpn = vrf ? lookup(table, dst) : undefined;
    if (vrf && vpn?.vpnLabel !== undefined && vpn.nextHop !== undefined) {
      const c = core(dev, vpn.nextHop, impExp ?? dscp >> 3, true);
      if (typeof c === 'string') return { hops, error: c };
      const pe = c.dev;
      vrf = sim.bgp.vpnLabels.get(`${pe}|${vpn.vpnLabel}`)?.vrf;
      dev = pe;
      ingress = undefined;
      // Egress PE: route in its VRF.
      const t2 = sim.routingTable(dev, vrf);
      const r2 = resolve(t2, dst);
      if (!r2) return { hops, error: `No route to ${formatIpv4(dst)} in VRF ${vrf} on ${name(dev)}` };
      if (owner(dst)?.deviceId === dev) return { hops };
      hops.push({ deviceId: dev, iface: r2.iface, dscp });
      const n = owner(r2.nextHop);
      if (!n) return { hops, error: `Next hop ${formatIpv4(r2.nextHop)} not found from ${name(dev)}` };
      dev = n.deviceId;
      ingress = n.iface;
      continue;
    }
    const r = resolve(table, dst);
    if (!r) return { hops, error: `No route to ${formatIpv4(dst)} on ${name(dev)}` };
    const lsp = !vrf ? sim.teHead(dev, r.iface) : undefined;
    if (lsp) {
      const th = teHops(sim, lsp);
      const e = impExp ?? dscp >> 3;
      th.forEach((h, i) => hops.push({ ...h, dscp, exp: i < th.length - 1 ? e : undefined }));
      dev = lsp.tail!;
      ingress = peerIface(hops[hops.length - 1]);
      continue;
    }
    let exp: number | undefined;
    if (!vrf) {
      const fecRoute = r.route.protocol === 'B' && r.route.nextHop !== undefined ? (lookup(table, r.route.nextHop) ?? r.route) : r.route;
      const ftn = sim.ldp.byFec
        .get(`${dev}|${prefixKey(fecRoute.network, fecRoute.prefixLen)}`)
        ?.find((x) => x.nextHop === r.nextHop && x.iface === r.iface);
      if (ftn && typeof ftn.out === 'number') exp = impExp ?? dscp >> 3;
    }
    hops.push({ deviceId: dev, iface: r.iface, dscp, exp });
    const n = owner(r.nextHop);
    if (!n) return { hops, error: `Next hop ${formatIpv4(r.nextHop)} not found from ${name(dev)}` };
    // A labelled packet keeps being label-switched by the next LSRs.
    if (exp !== undefined && !vrf) {
      const c = core(n.deviceId, dst, exp, false);
      if (typeof c === 'string') return { hops, error: c };
      dev = c.dev;
      ingress = c.ingress;
      continue;
    }
    dev = n.deviceId;
    ingress = n.iface;
  }
  return { hops, error: 'Path too long' };
}
