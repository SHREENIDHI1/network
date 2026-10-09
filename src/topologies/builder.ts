import { ENABLE_LEGACY_TDM } from '../config/features';
import * as ops from '../model/topologyOps';
import type { DeviceKind, LinkKind, Topology } from '../model/types';

/**
 * Small declarative builder for preloaded topologies. Devices are referenced
 * by a local key; every link is validated through the same rules as the UI,
 * so a preloaded topology can never contain an invalid connection.
 */

export interface DeviceSpec {
  key: string;
  kind: DeviceKind;
  name: string;
  station?: string;
  x: number;
  y: number;
  notes?: string;
}

export interface LinkSpec {
  kind: LinkKind;
  a: [key: string, port: string];
  b: [key: string, port: string];
  lengthKm?: number;
  label?: string;
}

export function buildTopology(
  name: string,
  description: string,
  devices: DeviceSpec[],
  links: LinkSpec[],
  /** Build with legacy TDM ports (for legacy fixtures), regardless of the UI mode. */
  legacy = ENABLE_LEGACY_TDM,
): Topology {
  let topo = ops.emptyTopology(name);
  topo.meta.description = description;
  const ids = new Map<string, string>();

  for (const spec of devices) {
    const res = ops.addDevice(topo, spec.kind, { x: spec.x, y: spec.y }, legacy);
    topo = ops.updateDevice(res.topology, res.device.id, { name: spec.name, station: spec.station, notes: spec.notes });
    ids.set(spec.key, res.device.id);
  }

  for (const l of links) {
    const aId = ids.get(l.a[0]);
    const bId = ids.get(l.b[0]);
    if (!aId || !bId) throw new Error(`Unknown device key in link ${l.a[0]} - ${l.b[0]}`);
    const res = ops.addLink(topo, {
      kind: l.kind,
      a: { deviceId: aId, portId: l.a[1] },
      b: { deviceId: bId, portId: l.b[1] },
      lengthKm: l.lengthKm,
    });
    if (!res.ok) throw new Error(`Invalid link ${l.a.join(':')} - ${l.b.join(':')}: ${res.reason}`);
    topo = res.topology;
    if (l.label) topo = ops.updateLink(topo, res.link.id, { label: l.label }).topology;
  }
  return topo;
}
