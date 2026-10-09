import type { NetConfig, QosClass } from '../config/netConfig';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { resolve } from '../ip/routing';
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
  hops: Array<{ deviceId: string; iface: string; dscp: number }>;
  bottleneck?: { deviceId: string; iface: string };
  error?: string;
}

export interface QosReport {
  flows: FlowStat[];
  queues: QueueStat[];
}

const SVI_CAPACITY_MBPS = 1000;

function classify(cfg: NetConfig, policyName: string | undefined, dscp: number): { cls?: QosClass; name: string } {
  const pm = policyName ? cfg.qos.policyMaps[policyName] : undefined;
  if (!pm) return { name: 'class-default' };
  for (const c of pm.classes) {
    if (c.name === 'class-default') continue;
    const cm = cfg.qos.classMaps[c.name];
    if (!cm) continue;
    const hit = cm.matchAll ? cm.dscp.length === 1 && cm.dscp[0] === dscp : cm.dscp.includes(dscp);
    if (hit) return { cls: c, name: c.name };
  }
  return { cls: pm.classes.find((c) => c.name === 'class-default'), name: 'class-default' };
}

interface Item {
  flow: number;
  hop: number;
  rate: number;
  dscp: number;
}

/** Allocates capacity among items at one queue; returns delivered rate per item and class stats. */
export function allocate(capacity: number, items: Item[], cfg: NetConfig | undefined, policy: string | undefined): { delivered: number[]; classes: QueueClassStat[] } {
  const total = items.reduce((a, b) => a + b.rate, 0);
  const pm = policy && cfg ? cfg.qos.policyMaps[policy] : undefined;
  if (!pm || !cfg) {
    const k = total > capacity ? capacity / total : 1;
    return { delivered: items.map((i) => i.rate * k), classes: [{ name: 'FIFO', kind: 'fifo', offeredMbps: total, deliveredMbps: Math.min(total, capacity) }] };
  }
  // Group items by class.
  const groups = new Map<string, { cls?: QosClass; idx: number[]; offered: number }>();
  items.forEach((it, i) => {
    const { cls, name } = classify(cfg, policy, it.dscp);
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
    classes.push({ name: n, kind: g.cls?.priorityPercent ? 'priority' : n === 'class-default' ? 'default' : 'bandwidth', offeredMbps: g.offered, deliveredMbps: v });
  }
  return { delivered, classes };
}

export function analyseTraffic(sim: Sim): QosReport {
  const flows: FlowStat[] = [];
  for (const d of sim.topology.devices) {
    const cfg = sim.config(d.id);
    for (const f of cfg?.traffic ?? []) {
      const stat: FlowStat = { id: f.id, srcDeviceId: d.id, dst: f.dst, app: appClass(f.app)?.label ?? f.app, dscp: f.dscp, offeredMbps: f.rateMbps, deliveredMbps: 0, lossPct: 100, hops: [] };
      const dst = parseIpv4(f.dst);
      if (dst === null) {
        stat.error = 'Invalid destination';
        flows.push(stat);
        continue;
      }
      let dev = d.id;
      let ingress: string | undefined;
      let dscp = f.dscp;
      for (let guard = 0; guard < 32; guard++) {
        const owner = sim.addressOwner(dst);
        if (owner?.deviceId === dev) break;
        const dcfg = sim.config(dev)!;
        if (ingress && dcfg.interfaces[ingress]?.servicePolicyIn) {
          const { cls } = classify(dcfg, dcfg.interfaces[ingress].servicePolicyIn, dscp);
          if (cls?.setDscp !== undefined) dscp = cls.setDscp;
        }
        if (guard > 0 && !sim.forwards(dev)) {
          stat.error = `${sim.device(dev)?.name} does not route`;
          break;
        }
        const r = resolve(sim.routingTable(dev), dst);
        if (!r) {
          stat.error = `No route to ${f.dst} on ${sim.device(dev)?.name}`;
          break;
        }
        stat.hops.push({ deviceId: dev, iface: r.iface, dscp });
        const next = sim.addressOwner(r.nextHop);
        if (!next) {
          stat.error = `Next hop ${formatIpv4(r.nextHop)} not found from ${sim.device(dev)?.name}`;
          break;
        }
        dev = next.deviceId;
        ingress = next.iface;
      }
      flows.push(stat);
    }
  }

  // Queue points and iterative allocation.
  const queueOf = new Map<string, Item[]>();
  flows.forEach((f, fi) => {
    if (f.error) return;
    f.hops.forEach((h, hi) => {
      const k = `${h.deviceId}|${h.iface}`;
      queueOf.set(k, [...(queueOf.get(k) ?? []), { flow: fi, hop: hi, rate: 0, dscp: h.dscp }]);
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
