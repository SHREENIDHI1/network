import type { Topology } from '../../model/types';
import { effectivePort, isBridgeRole, roleOf, type NetConfig } from '../config/netConfig';
import { baseMac } from '../core/mac';
import { portKey, type PhysicalState } from '../physical/linkState';
import { emptyEtherChannel, type EtherChannelState } from './etherchannel';

/**
 * Simplified Rapid Spanning Tree (IEEE 802.1w / 802.1D-2004 port costs).
 *
 * - One spanning-tree instance for all VLANs (like 802.1Q CST / MSTI 0).
 * - Roles are computed directly from the topology (root election, root port,
 *   designated port, alternate port) instead of exchanging BPDUs with
 *   timers; convergence is instantaneous. See Model Limitations.
 * - An EtherChannel bundle is one STP port: its representative member takes
 *   part in the election (cost from the summed member speed) and every other
 *   bundled member copies its role/state. Suspended members are disabled.
 */

export type StpRole = 'root' | 'designated' | 'alternate' | 'disabled';
export type StpPortState = 'forwarding' | 'discarding';

export interface BridgeId {
  priority: number;
  mac: string;
}

export interface StpBridge {
  deviceId: string;
  bridgeId: BridgeId;
  rootId: BridgeId;
  rootCost: number;
  rootPortId?: string;
  isRoot: boolean;
}

export interface StpPort {
  deviceId: string;
  portId: string;
  role: StpRole;
  state: StpPortState;
  cost: number;
  portPriority: number;
  portNumber: number;
  /** True when the port faces a non-bridge (host/router): edge port. */
  edge: boolean;
}

export interface StpState {
  bridges: Map<string, StpBridge>;
  ports: Map<string, StpPort>;
}

/** IEEE 802.1D-2004 long path cost: 20 Tbit/s ÷ link speed. */
export function stpPortCost(speedGbps: number): number {
  if (speedGbps <= 0) return 200_000_000;
  return Math.round(20_000 / speedGbps);
}

export function compareBridgeId(a: BridgeId, b: BridgeId): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0;
}

export function formatBridgeId(b: BridgeId): string {
  return `${b.priority}.${b.mac}`;
}

type Vec = [cost: number, bid: BridgeId, pid: number, ownPid: number];

function compareVec(a: Vec, b: Vec): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  const c = compareBridgeId(a[1], b[1]);
  if (c) return c;
  if (a[2] !== b[2]) return a[2] - b[2];
  return a[3] - b[3];
}

export function computeStp(topo: Topology, configs: ReadonlyMap<string, NetConfig>, phys: PhysicalState, ec: EtherChannelState = emptyEtherChannel()): StpState {
  const bridges = new Map<string, StpBridge>();
  const ports = new Map<string, StpPort>();
  const devById = new Map(topo.devices.map((d) => [d.id, d]));

  const bundleOf = (deviceId: string, portId: string) => {
    const name = ec.logical.get(portKey(deviceId, portId));
    return name ? ec.bundles.get(deviceId)?.find((b) => b.name === name) : undefined;
  };
  /** Suspended/down members and non-representative bundled members do not form adjacencies. */
  const inElection = (deviceId: string, portId: string) => {
    const flag = ec.flags.get(portKey(deviceId, portId));
    if (flag === 's' || flag === 'D') return false;
    const b = bundleOf(deviceId, portId);
    return !b || b.primary === portId;
  };

  const isSwitchport = (deviceId: string, portId: string) => {
    const d = devById.get(deviceId);
    if (!d) return false;
    const role = roleOf(d.kind);
    return isBridgeRole(role) && effectivePort(role, configs.get(deviceId)?.interfaces[portId]).switchport === true;
  };

  for (const d of topo.devices) {
    if (!isBridgeRole(roleOf(d.kind))) continue;
    const bid = { priority: configs.get(d.id)?.stpPriority ?? 32768, mac: baseMac(d.id) };
    bridges.set(d.id, { deviceId: d.id, bridgeId: bid, rootId: bid, rootCost: 0, isRoot: true });
    d.ports.forEach((p, i) => {
      if (!isSwitchport(d.id, p.id)) return;
      const st = phys.ports.get(portKey(d.id, p.id));
      const flag = ec.flags.get(portKey(d.id, p.id));
      const up = !!st?.operUp && flag !== 's' && flag !== 'D';
      const bundle = bundleOf(d.id, p.id);
      ports.set(portKey(d.id, p.id), {
        deviceId: d.id,
        portId: p.id,
        role: up ? 'designated' : 'disabled',
        state: up ? 'forwarding' : 'discarding',
        cost: stpPortCost(bundle ? bundle.speedGbps : (st?.speedGbps ?? 0)),
        portPriority: 128,
        portNumber: i + 1,
        edge: true,
      });
    });
  }

  // Bridge-to-bridge adjacencies over up links between two switchports.
  interface Adj {
    linkId: string;
    a: string;
    pa: string;
    b: string;
    pb: string;
  }
  const adjs: Adj[] = [];
  for (const l of topo.links) {
    if (!phys.links.get(l.id)?.up) continue;
    if (!bridges.has(l.a.deviceId) || !bridges.has(l.b.deviceId)) continue;
    if (!isSwitchport(l.a.deviceId, l.a.portId) || !isSwitchport(l.b.deviceId, l.b.portId)) continue;
    if (!inElection(l.a.deviceId, l.a.portId) || !inElection(l.b.deviceId, l.b.portId)) {
      // Bundled members still face a bridge (not an edge port).
      for (const e of [l.a, l.b]) {
        const sp = ports.get(portKey(e.deviceId, e.portId));
        if (sp) sp.edge = false;
      }
      continue;
    }
    adjs.push({ linkId: l.id, a: l.a.deviceId, pa: l.a.portId, b: l.b.deviceId, pb: l.b.portId });
    ports.get(portKey(l.a.deviceId, l.a.portId))!.edge = false;
    ports.get(portKey(l.b.deviceId, l.b.portId))!.edge = false;
  }

  const pid = (dev: string, port: string) => {
    const p = ports.get(portKey(dev, port))!;
    return p.portPriority * 4096 + p.portNumber;
  };
  const cost = (dev: string, port: string) => ports.get(portKey(dev, port))!.cost;

  // Connected components of bridges.
  const seen = new Set<string>();
  for (const start of bridges.keys()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const a of adjs) {
        const n = a.a === x ? a.b : a.b === x ? a.a : null;
        if (n && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    const compSet = new Set(comp);
    const compAdjs = adjs.filter((a) => compSet.has(a.a));

    // Root election.
    let root = comp[0];
    for (const b of comp) if (compareBridgeId(bridges.get(b)!.bridgeId, bridges.get(root)!.bridgeId) < 0) root = b;
    const rootId = bridges.get(root)!.bridgeId;

    // Shortest root path cost (Dijkstra; small graphs, O(V^2) is fine).
    const dist = new Map<string, number>(comp.map((b) => [b, Infinity]));
    dist.set(root, 0);
    const done = new Set<string>();
    while (done.size < comp.length) {
      let u: string | undefined;
      for (const b of comp) if (!done.has(b) && (u === undefined || dist.get(b)! < dist.get(u)!)) u = b;
      if (u === undefined || dist.get(u) === Infinity) break;
      done.add(u);
      for (const a of compAdjs) {
        const [n, nPort] = a.a === u ? [a.b, a.pb] : a.b === u ? [a.a, a.pa] : [null, null];
        if (!n || !nPort) continue;
        const alt = dist.get(u)! + cost(n, nPort);
        if (alt < dist.get(n)!) dist.set(n, alt);
      }
    }

    // Root port per non-root bridge.
    for (const b of comp) {
      const br = bridges.get(b)!;
      br.rootId = rootId;
      br.isRoot = b === root;
      br.rootCost = dist.get(b) ?? Infinity;
      if (br.isRoot) continue;
      let best: { vec: Vec; port: string } | undefined;
      for (const a of compAdjs) {
        const [own, n, nPort] = a.a === b ? [a.pa, a.b, a.pb] : a.b === b ? [a.pb, a.a, a.pa] : [null, null, null];
        if (!own || !n || !nPort) continue;
        const vec: Vec = [dist.get(n)! + cost(b, own), bridges.get(n)!.bridgeId, pid(n, nPort), pid(b, own)];
        if (!best || compareVec(vec, best.vec) < 0) best = { vec, port: own };
      }
      br.rootPortId = best?.port;
    }

    // Designated / root / alternate per bridge link.
    for (const a of compAdjs) {
      const va: Vec = [dist.get(a.a)!, bridges.get(a.a)!.bridgeId, pid(a.a, a.pa), 0];
      const vb: Vec = [dist.get(a.b)!, bridges.get(a.b)!.bridgeId, pid(a.b, a.pb), 0];
      const [desDev, desPort, othDev, othPort] = compareVec(va, vb) <= 0 ? [a.a, a.pa, a.b, a.pb] : [a.b, a.pb, a.a, a.pa];
      const des = ports.get(portKey(desDev, desPort))!;
      des.role = 'designated';
      des.state = 'forwarding';
      const oth = ports.get(portKey(othDev, othPort))!;
      if (bridges.get(othDev)!.rootPortId === othPort) {
        oth.role = 'root';
        oth.state = 'forwarding';
      } else {
        oth.role = 'alternate';
        oth.state = 'discarding';
      }
    }
  }

  // Bundled members mirror the representative member of their port-channel.
  for (const bundles of ec.bundles.values())
    for (const b of bundles) {
      if (!b.primary) continue;
      const rep = ports.get(portKey(b.deviceId, b.primary));
      if (!rep) continue;
      for (const m of b.members) {
        if (m.flag !== 'P' || m.portId === b.primary) continue;
        const sp = ports.get(portKey(b.deviceId, m.portId));
        if (sp) Object.assign(sp, { role: rep.role, state: rep.state, cost: rep.cost, edge: rep.edge });
      }
    }

  return { bridges, ports };
}
