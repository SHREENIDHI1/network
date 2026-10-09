import { describe, expect, it } from 'vitest';
import { parseTopology, serializeTopology } from '../io/serialize';
import { demoNetworking } from '../topologies/demoNetworking';
import { demoTwoStation } from '../topologies/demoTwoStation';
import { DEVICE_TEMPLATES } from './catalog';
import { checkLink } from './linkRules';
import {
  hasHiddenLegacy,
  isLegacyDeviceKind,
  LEGACY_PORT_KINDS,
  visibleDeviceTemplates,
  visibleLinkKinds,
  visibleTopology,
} from './networkingMode';
import { addDevice, emptyTopology } from './topologyOps';

const NETWORKING_KINDS = [
  'pc', 'uts-prs', 'fois', 'ip-phone', 'cctv', 'nvr', 'wifi-ap', 'l2-switch', 'l3-switch',
  'router', 'firewall', 'nms', 'dns-dhcp', 'ler', 'lsr', 'rr', 'ucpe',
];

describe('networking-only mode', () => {
  it('palette shows exactly the 17 networking device kinds', () => {
    expect(visibleDeviceTemplates(false).map((t) => t.kind).sort()).toEqual([...NETWORKING_KINDS].sort());
    expect(visibleDeviceTemplates(true)).toHaveLength(DEVICE_TEMPLATES.length);
  });

  it('link dialog offers only networking media', () => {
    expect(visibleLinkKinds(false).map((k) => k.kind).sort()).toEqual(['cat6', 'ofc', 'sfp-100g', 'sfp-10g', 'sfp-1g', 'sfp-25g']);
    expect(visibleLinkKinds(true).length).toBe(9);
  });

  it('new devices get no legacy TDM ports (router without E1) unless legacy is enabled', () => {
    const r = addDevice(emptyTopology(), 'router', { x: 0, y: 0 }, false).device;
    expect(r.ports.some((p) => LEGACY_PORT_KINDS.has(p.kind))).toBe(false);
    const legacyR = addDevice(emptyTopology(), 'router', { x: 0, y: 0 }, true).device;
    expect(legacyR.ports.some((p) => p.kind === 'e1')).toBe(true);
  });

  it('old files with legacy devices still parse, and legacy items are hidden not dropped', () => {
    const text = serializeTopology(demoTwoStation());
    const res = parseTopology(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(hasHiddenLegacy(res.topology, false)).toBe(true);
    const v = visibleTopology(res.topology, false);
    expect(v.devices.every((d) => !isLegacyDeviceKind(d.kind))).toBe(true);
    // A-SW, A-SM-PC, A-UTS and their two Cat6 links remain; the ADM–switch Cat6 is hidden with the ADM.
    expect(v.devices.map((d) => d.name).sort()).toEqual(['A-SM-PC', 'A-SW', 'A-UTS']);
    expect(v.links).toHaveLength(2);
    expect(v.hiddenDevices + v.devices.length).toBe(res.topology.devices.length);
    // Round-trip keeps everything.
    expect(parseTopology(serializeTopology(res.topology)).ok).toBe(true);
    expect(visibleTopology(res.topology, true).hiddenDevices).toBe(0);
  });

  it('networking demo is valid, legacy-free and fully visible', () => {
    const t = demoNetworking();
    expect(t.devices.some((d) => isLegacyDeviceKind(d.kind))).toBe(false);
    expect(hasHiddenLegacy(t, false)).toBe(false);
    for (const l of t.links) expect(checkLink(l, t.devices, t.links.filter((x) => x.id !== l.id)).ok).toBe(true);
  });
});
