import { describe, expect, it } from 'vitest';
import { demoTwoStation } from '../topologies/demoTwoStation';
import { FILE_FORMAT, parseTopology, serializeTopology } from './serialize';

describe('save / load', () => {
  it('round-trips a topology losslessly', () => {
    const t = demoTwoStation();
    const text = serializeTopology(t, new Date('2026-01-01T00:00:00Z'));
    const r = parseTopology(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology).toEqual(t);
  });

  it('rejects non-JSON and wrong format tags', () => {
    expect(parseTopology('not json').ok).toBe(false);
    expect(parseTopology(JSON.stringify({ format: 'other', version: 1, topology: {} })).ok).toBe(false);
  });

  it('rejects newer file versions', () => {
    const file = JSON.parse(serializeTopology(demoTwoStation()));
    file.version = 99;
    const r = parseTopology(JSON.stringify(file));
    expect(r.ok).toBe(false);
  });

  it('re-validates physical rules on load (hand-edited impossible link)', () => {
    const file = JSON.parse(serializeTopology(demoTwoStation()));
    expect(file.format).toBe(FILE_FORMAT);
    // Re-point the OFC onto an E1 port: physically impossible.
    const ofc = file.topology.links.find((l: { kind: string }) => l.kind === 'ofc');
    ofc.a.portId = 'E1-10';
    const r = parseTopology(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/OFC must terminate/);
  });

  it('rejects a port used by two links', () => {
    const file = JSON.parse(serializeTopology(demoTwoStation()));
    const dup = { ...file.topology.links[1], id: 'lnk-dup' };
    file.topology.links.push(dup);
    const r = parseTopology(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/already connected/);
  });
});

describe('device configs in files', () => {
  it('round-trips a stored net config and rejects an invalid one', async () => {
    const { configure, ipIf } = await import('../engine/testing/fixtures');
    const { demoNetworking } = await import('../topologies/demoNetworking');
    const t = configure(demoNetworking(), 'GOTN-LER', (c) => ipIf(c, 'Gi0/0/0', '10.9.9.1', '255.255.255.0', { shutdown: false }));
    const r = parseTopology(serializeTopology(t));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology).toEqual(t);

    const file = JSON.parse(serializeTopology(t));
    const ler = file.topology.devices.find((d: { name: string }) => d.name === 'GOTN-LER');
    ler.config.net.interfaces['Gi0/0/0'].ip.address = 'not-an-ip';
    const bad = parseTopology(JSON.stringify(file));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/GOTN-LER config\.net\.interfaces/);
  });
});
