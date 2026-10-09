import { ENABLE_LEGACY_TDM } from '../config/features';
import { DEVICE_TEMPLATES, type DeviceTemplate } from './catalog';
import { LINK_KINDS, type LinkKindInfo } from './linkRules';
import type { Device, DeviceKind, Link, LinkKind, Port, PortKind, Topology } from './types';

/**
 * Networking-only mode: which device kinds, link kinds and port kinds belong
 * to the legacy TDM world, and helpers that hide them when the flag is off.
 * Every helper takes `legacyEnabled` so tests can exercise both modes.
 */

export const LEGACY_DEVICE_KINDS: ReadonlySet<DeviceKind> = new Set<DeviceKind>([
  'pdmux',
  'adm-stm1',
  'adm-stm4',
  'adm-stm16',
  'cwdm-mux',
  'control-phone',
  'block-instrument',
  'bpac',
  'data-logger',
  'lc-gate-phone',
  'exchange',
  'hybrid-agg',
]);

export const LEGACY_LINK_KINDS: ReadonlySet<LinkKind> = new Set<LinkKind>(['cwdm-lambda', 'e1-copper', 'quad']);

export const LEGACY_PORT_KINDS: ReadonlySet<PortKind> = new Set<PortKind>(['stm', 'e1', 'vf2w', 'vf4w', 'cwdm-line', 'cwdm-ch']);

export const LEGACY_HIDDEN_MESSAGE = 'This file contains legacy TDM devices, hidden in networking-only mode.';

export function isLegacyDeviceKind(kind: DeviceKind): boolean {
  return LEGACY_DEVICE_KINDS.has(kind);
}

export function isLegacyLinkKind(kind: LinkKind): boolean {
  return LEGACY_LINK_KINDS.has(kind);
}

export function visibleDeviceTemplates(legacyEnabled = ENABLE_LEGACY_TDM): DeviceTemplate[] {
  return DEVICE_TEMPLATES.filter((t) => legacyEnabled || !isLegacyDeviceKind(t.kind));
}

export function visibleLinkKinds(legacyEnabled = ENABLE_LEGACY_TDM): LinkKindInfo[] {
  return LINK_KINDS.filter((k) => legacyEnabled || !isLegacyLinkKind(k.kind));
}

export function isDeviceKindAllowed(kind: DeviceKind, legacyEnabled = ENABLE_LEGACY_TDM): boolean {
  return legacyEnabled || !isLegacyDeviceKind(kind);
}

/** Ports a newly created device gets in the current mode (e.g. no E1 WAN ports on a router). */
export function visiblePorts(ports: Port[], legacyEnabled = ENABLE_LEGACY_TDM): Port[] {
  return legacyEnabled ? ports : ports.filter((p) => !LEGACY_PORT_KINDS.has(p.kind));
}

export interface VisibleTopology {
  devices: Device[];
  links: Link[];
  hiddenDevices: number;
  hiddenLinks: number;
}

/**
 * Splits a topology into what is shown and what is hidden. A link is hidden
 * when its kind is legacy, either end device is hidden, or either end port is
 * a legacy port (e.g. E1 port on an old router).
 */
export function visibleTopology(topo: Topology, legacyEnabled = ENABLE_LEGACY_TDM): VisibleTopology {
  if (legacyEnabled) return { devices: topo.devices, links: topo.links, hiddenDevices: 0, hiddenLinks: 0 };
  const devices = topo.devices.filter((d) => !isLegacyDeviceKind(d.kind));
  const shown = new Map(devices.map((d) => [d.id, d]));
  const portVisible = (deviceId: string, portId: string) => {
    const p = shown.get(deviceId)?.ports.find((x) => x.id === portId);
    return !!p && !LEGACY_PORT_KINDS.has(p.kind);
  };
  const links = topo.links.filter(
    (l) => !isLegacyLinkKind(l.kind) && portVisible(l.a.deviceId, l.a.portId) && portVisible(l.b.deviceId, l.b.portId),
  );
  return {
    devices,
    links,
    hiddenDevices: topo.devices.length - devices.length,
    hiddenLinks: topo.links.length - links.length,
  };
}

export function hasHiddenLegacy(topo: Topology, legacyEnabled = ENABLE_LEGACY_TDM): boolean {
  const v = visibleTopology(topo, legacyEnabled);
  return v.hiddenDevices > 0 || v.hiddenLinks > 0;
}
