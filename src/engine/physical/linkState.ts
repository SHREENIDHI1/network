import type { Link, LinkKind, Topology } from '../../model/types';
import { effectivePort, roleOf, type NetConfig } from '../config/netConfig';
import { computeBudget } from './opticalBudget';

/**
 * Physical layer state: is each port/link up, and at what speed.
 *
 * A link is up only when: it is not cut, its optical budget is not LOS or
 * overload, and both ports are administratively up and not err-disabled.
 * When one end is shut down the other end goes down/down — as on real
 * equipment, where the far laser/PHY stops.
 */

export type PortDownReason =
  | 'administratively down'
  | 'err-disabled'
  | 'not connected'
  | 'fibre cut'
  | 'optical LOS'
  | 'optical overload'
  | 'peer down'
  | 'media not simulated';

export interface PortStatus {
  deviceId: string;
  portId: string;
  adminUp: boolean;
  operUp: boolean;
  reason?: PortDownReason;
  speedGbps: number;
  /** Negotiated/forced duplex (fibre and SFP links are always full). */
  duplex: 'full' | 'half';
  /** True when the two ends of the link ended up with different duplex. */
  duplexMismatch?: boolean;
  linkId?: string;
  peer?: { deviceId: string; portId: string };
}

export interface LinkStatus {
  linkId: string;
  up: boolean;
  reason?: PortDownReason;
  speedGbps: number;
}

export interface PhysicalState {
  ports: Map<string, PortStatus>; // key `${deviceId}|${portId}`
  links: Map<string, LinkStatus>;
}

const SPEED: Partial<Record<LinkKind, number>> = { cat6: 1, 'sfp-1g': 1, 'sfp-10g': 10, 'sfp-25g': 25, 'sfp-100g': 100 };

/** Ethernet speed of a link: fixed by patch type, or the best common SFP speed on OFC. */
export function linkSpeedGbps(link: Link, topo: Topology): number {
  const fixed = SPEED[link.kind];
  if (fixed) return fixed;
  if (link.kind === 'ofc') {
    const pa = topo.devices.find((d) => d.id === link.a.deviceId)?.ports.find((p) => p.id === link.a.portId);
    const pb = topo.devices.find((d) => d.id === link.b.deviceId)?.ports.find((p) => p.id === link.b.portId);
    const common = (pa?.speedsGbps ?? []).filter((s) => (pb?.speedsGbps ?? []).includes(s));
    return common.length ? Math.max(...common) : 0;
  }
  return 0;
}

export const portKey = (deviceId: string, portId: string) => `${deviceId}|${portId}`;

export function computePhysical(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  cuts: ReadonlySet<string>,
  errDisabled: ReadonlyMap<string, ReadonlySet<string>>,
): PhysicalState {
  const ports = new Map<string, PortStatus>();
  const links = new Map<string, LinkStatus>();

  const localDown = (deviceId: string, portId: string): PortDownReason | undefined => {
    const dev = topo.devices.find((d) => d.id === deviceId);
    if (!dev) return 'not connected';
    const role = roleOf(dev.kind);
    if (role === 'opaque') return 'media not simulated';
    const cfg = effectivePort(role, configs.get(deviceId)?.interfaces[portId]);
    if (cfg.shutdown) return 'administratively down';
    if (errDisabled.get(deviceId)?.has(portId)) return 'err-disabled';
    return undefined;
  };

  for (const d of topo.devices) {
    const role = roleOf(d.kind);
    for (const p of d.ports) {
      const adminUp = role !== 'opaque' && !effectivePort(role, configs.get(d.id)?.interfaces[p.id]).shutdown;
      ports.set(portKey(d.id, p.id), {
        deviceId: d.id,
        portId: p.id,
        adminUp,
        operUp: false,
        reason: localDown(d.id, p.id) ?? 'not connected',
        speedGbps: 0,
        duplex: 'full',
      });
    }
  }

  for (const l of topo.links) {
    // A forced "speed" on either end caps the link (both ends must agree on real gear).
    const forced = [configs.get(l.a.deviceId)?.interfaces[l.a.portId]?.speedMbps, configs.get(l.b.deviceId)?.interfaces[l.b.portId]?.speedMbps]
      .filter((x): x is number => x !== undefined)
      .map((m) => m / 1000);
    const nominal = linkSpeedGbps(l, topo);
    const speed = nominal > 0 && forced.length ? Math.min(nominal, ...forced) : nominal;
    let linkReason: PortDownReason | undefined;
    if (speed === 0) linkReason = 'media not simulated';
    else if (cuts.has(l.id)) linkReason = 'fibre cut';
    else if (l.kind === 'ofc' && l.optical) {
      const st = computeBudget(l.lengthKm, l.optical).status;
      if (st === 'los') linkReason = 'optical LOS';
      if (st === 'overload') linkReason = 'optical overload';
    }
    const aDown = localDown(l.a.deviceId, l.a.portId);
    const bDown = localDown(l.b.deviceId, l.b.portId);
    const up = !linkReason && !aDown && !bDown;
    links.set(l.id, { linkId: l.id, up, reason: linkReason ?? aDown ?? bDown, speedGbps: speed });

    const [duplexA, duplexB] = resolveDuplex(l, topo, configs);
    for (const [end, other, own, far] of [
      [l.a, l.b, aDown, bDown],
      [l.b, l.a, bDown, aDown],
    ] as const) {
      const st = ports.get(portKey(end.deviceId, end.portId));
      if (!st) continue;
      st.linkId = l.id;
      st.peer = { deviceId: other.deviceId, portId: other.portId };
      st.speedGbps = speed;
      st.duplex = end === l.a ? duplexA : duplexB;
      st.duplexMismatch = up && duplexA !== duplexB;
      st.operUp = up;
      st.reason = up ? undefined : (own ?? linkReason ?? (far ? 'peer down' : undefined));
    }
  }
  return { ports, links };
}

type DuplexSetting = 'auto' | 'full' | 'half';

/**
 * Duplex on copper (Cat6) links, IEEE 802.3 clause 28 simplified:
 * auto + auto → full; forced + auto → the auto end cannot negotiate and falls
 * back to half duplex (parallel detection), so forced full + auto = mismatch;
 * forced + forced → as configured. A hub port is always half duplex.
 */
export function resolveDuplex(link: Link, topo: Topology, configs: ReadonlyMap<string, NetConfig>): ['full' | 'half', 'full' | 'half'] {
  if (link.kind !== 'cat6') return ['full', 'full'];
  const setting = (end: Link['a']): DuplexSetting => {
    const dev = topo.devices.find((d) => d.id === end.deviceId);
    if (dev && roleOf(dev.kind) === 'hub') return 'half';
    return configs.get(end.deviceId)?.interfaces[end.portId]?.duplex ?? 'auto';
  };
  const a = setting(link.a);
  const b = setting(link.b);
  if (a === 'auto' && b === 'auto') return ['full', 'full'];
  if (a === 'auto') return ['half', b as 'full' | 'half'];
  if (b === 'auto') return [a, 'half'];
  return [a, b];
}
