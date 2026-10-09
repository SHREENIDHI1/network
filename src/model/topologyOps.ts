import { getTemplate } from './catalog';
import { checkLink, defaultOptical, getLinkKindInfo, type CheckResult } from './linkRules';
import type { Device, DeviceKind, Link, LinkEnd, LinkKind, Topology, XY } from './types';

/**
 * Pure, immutable topology operations. Every function returns a new Topology
 * and never mutates its input, so they are trivially testable and undo-friendly.
 */

let fallbackCounter = 0;

export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID().slice(0, 8)}`;
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${fallbackCounter.toString(36)}`;
}

export function emptyTopology(name = 'Untitled topology'): Topology {
  return { meta: { name }, devices: [], links: [] };
}

/** Next free auto-name like "PDMUX-3" for a template prefix. */
export function nextDeviceName(devices: Device[], prefix: string): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const d of devices) {
    const m = re.exec(d.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

export function createDevice(devices: Device[], kind: DeviceKind, position: XY): Device {
  const t = getTemplate(kind);
  return {
    id: newId('dev'),
    kind,
    name: nextDeviceName(devices, t.prefix),
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    ports: t.buildPorts(),
    config: {},
  };
}

export function addDevice(topo: Topology, kind: DeviceKind, position: XY): { topology: Topology; device: Device } {
  const device = createDevice(topo.devices, kind, position);
  return { topology: { ...topo, devices: [...topo.devices, device] }, device };
}

export type DevicePatch = Partial<Pick<Device, 'name' | 'station' | 'notes' | 'position'>>;

export function updateDevice(topo: Topology, id: string, patch: DevicePatch): Topology {
  return { ...topo, devices: topo.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

/** Removing a device also removes every link attached to it. */
export function removeDevice(topo: Topology, id: string): Topology {
  return {
    ...topo,
    devices: topo.devices.filter((d) => d.id !== id),
    links: topo.links.filter((l) => l.a.deviceId !== id && l.b.deviceId !== id),
  };
}

export interface NewLinkInput {
  kind: LinkKind;
  a: LinkEnd;
  b: LinkEnd;
  lengthKm?: number;
  cores?: 1 | 2;
}

export function buildLink(topo: Topology, input: NewLinkInput): Link {
  const info = getLinkKindInfo(input.kind);
  const lengthKm = input.lengthKm ?? info.defaultLengthKm;
  const link: Link = { id: newId('lnk'), kind: input.kind, a: input.a, b: input.b, lengthKm };
  if (input.kind === 'ofc') {
    const da = topo.devices.find((d) => d.id === input.a.deviceId);
    const pa = da?.ports.find((p) => p.id === input.a.portId);
    link.cores = input.cores ?? 2;
    if (pa) link.optical = defaultOptical(pa, lengthKm);
  }
  return link;
}

export function addLink(
  topo: Topology,
  input: NewLinkInput,
): { ok: true; topology: Topology; link: Link } | { ok: false; reason: string } {
  const link = buildLink(topo, input);
  const check = checkLink(link, topo.devices, topo.links);
  if (!check.ok) return check;
  return { ok: true, topology: { ...topo, links: [...topo.links, link] }, link };
}

export type LinkPatch = Partial<Pick<Link, 'lengthKm' | 'cores' | 'optical' | 'label'>>;

export function updateLink(topo: Topology, id: string, patch: LinkPatch): { topology: Topology; check: CheckResult } {
  const existing = topo.links.find((l) => l.id === id);
  if (!existing) return { topology: topo, check: { ok: false, reason: 'Link not found.' } };
  const updated: Link = { ...existing, ...patch };
  const check = checkLink(updated, topo.devices, topo.links);
  if (!check.ok) return { topology: topo, check };
  return { topology: { ...topo, links: topo.links.map((l) => (l.id === id ? updated : l)) }, check };
}

export function removeLink(topo: Topology, id: string): Topology {
  return { ...topo, links: topo.links.filter((l) => l.id !== id) };
}

/** Returns the link (if any) attached to a given device port. */
export function linkOnPort(topo: Topology, deviceId: string, portId: string): Link | undefined {
  return topo.links.find(
    (l) => (l.a.deviceId === deviceId && l.a.portId === portId) || (l.b.deviceId === deviceId && l.b.portId === portId),
  );
}
