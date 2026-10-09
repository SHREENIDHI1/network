import { describe, expect, it } from 'vitest';
import { DEVICE_TEMPLATES } from './catalog';
import { addDevice, addLink, emptyTopology, nextDeviceName, removeDevice, updateLink } from './topologyOps';

describe('catalog', () => {
  it('every template builds ports with unique ids', () => {
    for (const t of DEVICE_TEMPLATES) {
      const ports = t.buildPorts();
      expect(ports.length, t.kind).toBeGreaterThan(0);
      expect(new Set(ports.map((p) => p.id)).size, t.kind).toBe(ports.length);
    }
  });

  it('PD-Mux exposes E1 aggregates and VF cards', () => {
    const t = DEVICE_TEMPLATES.find((x) => x.kind === 'pdmux')!;
    const kinds = new Set(t.buildPorts().map((p) => p.kind));
    expect(kinds).toEqual(new Set(['e1', 'vf2w', 'vf4w', 'rj45']));
  });
});

describe('topology operations', () => {
  it('auto-names devices with the next free number', () => {
    let t = emptyTopology();
    t = addDevice(t, 'router', { x: 0, y: 0 }).topology;
    t = addDevice(t, 'router', { x: 0, y: 0 }).topology;
    expect(t.devices.map((d) => d.name)).toEqual(['R-1', 'R-2']);
    expect(nextDeviceName(t.devices, 'R')).toBe('R-3');
  });

  it('rejects double-booking a port and removes links with their device', () => {
    let t = emptyTopology();
    const a = addDevice(t, 'pc', { x: 0, y: 0 });
    t = a.topology;
    const s = addDevice(t, 'l2-switch', { x: 0, y: 0 });
    t = s.topology;
    const p = addDevice(t, 'pc', { x: 0, y: 0 });
    t = p.topology;

    const r1 = addLink(t, { kind: 'cat6', a: { deviceId: a.device.id, portId: 'eth0' }, b: { deviceId: s.device.id, portId: 'Gi0/1' } });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    t = r1.topology;

    const r2 = addLink(t, { kind: 'cat6', a: { deviceId: p.device.id, portId: 'eth0' }, b: { deviceId: s.device.id, portId: 'Gi0/1' } });
    expect(r2.ok).toBe(false);

    t = removeDevice(t, s.device.id);
    expect(t.links).toHaveLength(0);
    expect(t.devices).toHaveLength(2);
  });

  it('creates OFC links with default optics and validates length edits', () => {
    let t = emptyTopology();
    const a = addDevice(t, 'adm-stm1', { x: 0, y: 0 }, true);
    t = a.topology;
    const b = addDevice(t, 'adm-stm1', { x: 0, y: 0 }, true);
    t = b.topology;
    const r = addLink(t, { kind: 'ofc', a: { deviceId: a.device.id, portId: 'STM1-E' }, b: { deviceId: b.device.id, portId: 'STM1-W' }, lengthKm: 30 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.link.optical?.profile).toBe('L-1.1');
    expect(r.link.cores).toBe(2);

    const bad = updateLink(r.topology, r.link.id, { lengthKm: -1 });
    expect(bad.check.ok).toBe(false);
    expect(bad.topology).toBe(r.topology);
  });

  it('enforces Cat6 100 m limit', () => {
    let t = emptyTopology();
    const a = addDevice(t, 'pc', { x: 0, y: 0 });
    t = a.topology;
    const b = addDevice(t, 'pc', { x: 0, y: 0 });
    t = b.topology;
    const r = addLink(t, { kind: 'cat6', a: { deviceId: a.device.id, portId: 'eth0' }, b: { deviceId: b.device.id, portId: 'eth0' }, lengthKm: 0.2 });
    expect(r.ok).toBe(false);
  });
});
