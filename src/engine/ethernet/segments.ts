import type { Topology } from '../../model/types';
import { effectivePort, isBridgeRole, roleOf, type NetConfig } from '../config/netConfig';
import { portCarriesVlan, vlanExists, type L3Interface } from '../ip/interfaces';
import { portKey, type PhysicalState } from '../physical/linkState';
import type { StpState } from './stp';

/**
 * Broadcast-domain discovery: which L3 interfaces can reach each other at
 * Layer 2 (through switches, VLANs, trunks and STP-forwarding ports).
 * Used by control-plane protocols that run on a segment (OSPF hellos,
 * HSRP/VRRP), which the simulator computes directly instead of exchanging
 * periodic packets.
 */

export interface IfRef {
  deviceId: string;
  iface: string;
}

export interface Segment {
  id: number;
  members: IfRef[];
}

export function computeSegments(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  phys: PhysicalState,
  stp: StpState,
  l3: ReadonlyMap<string, L3Interface[]>,
): Segment[] {
  const devById = new Map(topo.devices.map((d) => [d.id, d]));
  const seenIf = new Set<string>();
  const segments: Segment[] = [];

  const ifKey = (r: IfRef) => `${r.deviceId}|${r.iface}`;
  const forwarding = (dev: string, port: string) =>
    !!phys.ports.get(portKey(dev, port))?.operUp && stp.ports.get(portKey(dev, port))?.state === 'forwarding';

  for (const [devId, ifs] of l3) {
    for (const start of ifs) {
      if (!start.up || seenIf.has(ifKey({ deviceId: devId, iface: start.name }))) continue;
      const members: IfRef[] = [];
      const seenVlan = new Set<string>(); // `${bridge}|${vlan}`
      const seenEmit = new Set<string>();
      const stack: Array<() => void> = [];

      const addIf = (r: IfRef) => {
        const k = ifKey(r);
        if (seenIf.has(k)) return;
        seenIf.add(k);
        members.push(r);
      };

      /** Frame leaves (dev, port) with tag; follow the link to the far end. */
      const emit = (dev: string, port: string, tag: number | undefined) => {
        const k = `${dev}|${port}|${tag ?? '-'}`;
        if (seenEmit.has(k)) return;
        seenEmit.add(k);
        const st = phys.ports.get(portKey(dev, port));
        if (!st?.operUp || !st.peer) return;
        stack.push(() => arrive(st.peer!.deviceId, st.peer!.portId, tag));
      };

      /** Flood inside a bridge's VLAN: reach its SVI and all member ports. */
      const visitVlan = (dev: string, vlan: number) => {
        const k = `${dev}|${vlan}`;
        if (seenVlan.has(k)) return;
        seenVlan.add(k);
        const d = devById.get(dev)!;
        const cfg = configs.get(dev)!;
        const role = roleOf(d.kind);
        const svi = l3.get(dev)?.find((i) => i.kind === 'svi' && i.vlan === vlan && i.up);
        if (svi) addIf({ deviceId: dev, iface: svi.name });
        for (const p of d.ports) {
          if (!portCarriesVlan(cfg, role, p.id, vlan) || !forwarding(dev, p.id)) continue;
          const e = effectivePort(role, cfg.interfaces[p.id]);
          emit(dev, p.id, e.mode === 'trunk' && vlan !== e.nativeVlan ? vlan : undefined);
        }
      };

      const arrive = (dev: string, port: string, tag: number | undefined) => {
        const d = devById.get(dev);
        if (!d) return;
        const role = roleOf(d.kind);
        const cfg = configs.get(dev)!;
        if (isBridgeRole(role) && effectivePort(role, cfg.interfaces[port]).switchport) {
          if (!forwarding(dev, port)) return;
          const e = effectivePort(role, cfg.interfaces[port]);
          let vlan: number;
          if (e.mode === 'access') {
            if (tag !== undefined) return;
            vlan = e.accessVlan!;
          } else {
            vlan = tag ?? e.nativeVlan!;
            if (!(e.trunkAllowed === 'all' || (e.trunkAllowed ?? []).includes(vlan))) return;
          }
          if (!vlanExists(cfg, vlan)) return;
          visitVlan(dev, vlan);
          return;
        }
        if (role === 'hub') {
          // A hub repeats everything out of every other port.
          for (const p of d.ports) if (p.id !== port) emit(dev, p.id, tag);
          return;
        }
        const ifs = l3.get(dev) ?? [];
        const target =
          tag !== undefined
            ? ifs.find((i) => i.kind === 'sub' && i.port === port && i.vlan === tag && !i.native)
            : (ifs.find((i) => i.kind === 'sub' && i.port === port && i.native) ?? ifs.find((i) => i.kind === 'port' && i.port === port));
        if (target?.up) addIf({ deviceId: dev, iface: target.name });
      };

      addIf({ deviceId: devId, iface: start.name });
      if (start.kind === 'loop') {
        // A loopback is a segment of its own: nothing else can attach to it.
        segments.push({ id: segments.length + 1, members });
        continue;
      }
      if (start.kind === 'svi') visitVlan(devId, start.vlan!);
      else emit(devId, start.port!, start.kind === 'sub' && !start.native ? start.vlan : undefined);
      while (stack.length) stack.pop()!();

      segments.push({ id: segments.length + 1, members });
    }
  }
  return segments;
}
