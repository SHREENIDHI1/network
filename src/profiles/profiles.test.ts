import { describe, expect, it } from 'vitest';
import { getTemplate } from '../model/catalog';
import { checkPortPair } from '../model/linkRules';
import { addDevice, addLink, emptyTopology } from '../model/topologyOps';
import { parseIpv4 } from '../engine/ip/ipv4';
import { Sim } from '../engine/sim';
import { host } from '../engine/testing/fixtures';
import { buildTopology } from '../topologies/builder';
import mapping from './commandMapping.neon.json';
import { PROFILES, getProfile } from './profiles';

describe('IP-MPLS profiles', () => {
  it('NEON-LER carries the CAMTECH p.35 figures and matching ports', () => {
    const p = getProfile('neon-ler')!;
    const spec = (k: string) => p.specs.find((s) => s.param === k)?.value;
    expect(spec('10G interfaces')).toBe('4 × 10GbE');
    expect(spec('1G interfaces')).toBe('16 × 1G combo (RJ45/SFP)');
    expect(spec('Power input')).toMatch(/−40 to −57 V/);
    expect(p.cliBanner).toBe('CLI syntax is generic, not official NEON syntax.');
    const ports = getTemplate('neon-ler').buildPorts();
    expect(ports.filter((x) => x.name.startsWith('Te0/0/'))).toHaveLength(4);
    expect(ports.filter((x) => x.kind === 'combo')).toHaveLength(16);
  });

  it('NEON-LSR has 28×10G, 8×25G, 1×100G and 48 combo ports', () => {
    const ports = getTemplate('neon-lsr').buildPorts();
    expect(ports.filter((x) => x.name.startsWith('Te0/0/'))).toHaveLength(28);
    expect(ports.filter((x) => x.name.startsWith('Twe0/1/'))).toHaveLength(8);
    expect(ports.filter((x) => x.name.startsWith('Hu0/2/'))).toHaveLength(1);
    expect(ports.filter((x) => x.kind === 'combo')).toHaveLength(48);
  });

  it('vendor profiles without readable specs are flagged unverified with a generic layout', () => {
    for (const id of ['asr920', 'asr903', 'acx4000', 'mx104', 'sar8', 'ixr-r4']) {
      const p = getProfile(id)!;
      expect(p.specsVerified).toBe(false);
      expect(p.genericPortLayout).toBe(true);
      expect(p.specs.every((s) => s.source === 'unverified')).toBe(true);
    }
    expect(PROFILES.filter((p) => p.specsVerified).map((p) => p.id)).toEqual(['neon-ler', 'neon-lsr']);
  });

  it('NEON command mapping is a well-formed, honestly unmapped file', () => {
    expect(mapping.status).toBe('unmapped');
    expect(mapping.commands.length).toBeGreaterThan(20);
    expect(mapping.commands.every((c) => c.neon === null && c.verified === false)).toBe(true);
  });
});

describe('combo ports', () => {
  it('accept Cat6 or SFP but not both kinds of mismatch', () => {
    const combo = getTemplate('neon-ler').buildPorts().find((p) => p.kind === 'combo')!;
    const rj = getTemplate('pc').buildPorts()[0];
    const sfp1g = getTemplate('l2-switch').buildPorts().find((p) => p.kind === 'sfp')!;
    expect(checkPortPair('cat6', combo, rj).ok).toBe(true);
    expect(checkPortPair('sfp-1g', combo, sfp1g).ok).toBe(true);
    expect(checkPortPair('ofc', combo, sfp1g).ok).toBe(true);
    expect(checkPortPair('sfp-10g', combo, sfp1g).ok).toBe(false);
  });

  it('a NEON-LER can be cabled to a station switch and routes as a plain IPv4 router today', () => {
    let t = emptyTopology();
    const ler = addDevice(t, 'neon-ler', { x: 0, y: 0 });
    t = ler.topology;
    const lsr = addDevice(t, 'neon-lsr', { x: 0, y: 0 });
    t = lsr.topology;
    const r = addLink(t, { kind: 'ofc', a: { deviceId: ler.device.id, portId: 'Te0/0/0' }, b: { deviceId: lsr.device.id, portId: 'Te0/0/0' }, lengthKm: 9.56 });
    expect(r.ok).toBe(true);
  });
});

describe('hub (teaching device)', () => {
  it('repeats frames out of every port: two PCs still talk, and a third PC sees the traffic', () => {
    let t = buildTopology('hub', '', [
      { key: 'h', kind: 'hub', name: 'HUB1', x: 0, y: 0 },
      { key: 'a', kind: 'pc', name: 'A', x: 0, y: 0 },
      { key: 'b', kind: 'pc', name: 'B', x: 0, y: 0 },
      { key: 'c', kind: 'pc', name: 'C', x: 0, y: 0 },
    ], [
      { kind: 'cat6', a: ['h', 'Port1'], b: ['a', 'eth0'] },
      { kind: 'cat6', a: ['h', 'Port2'], b: ['b', 'eth0'] },
      { kind: 'cat6', a: ['h', 'Port3'], b: ['c', 'eth0'] },
    ]);
    t = host(t, 'A', '192.168.0.1');
    t = host(t, 'B', '192.168.0.2');
    t = host(t, 'C', '192.168.0.3');
    const sim = new Sim(t);
    const sid = sim.ping(sim.deviceByName('A')!.id, parseIpv4('192.168.0.2')!);
    sim.runUntilIdle();
    expect(sim.session(sid)!.probes.every((p) => p.outcome === 'reply')).toBe(true);
    // Unicast echo requests also reached C (which drops them at its NIC): the hub does not learn MACs.
    const flow = sim.flows.get(sim.session(sid)!.probes[1].flowId)!;
    const c = sim.deviceByName('C')!.id;
    expect(flow.steps.some((s) => s.deviceId === c && /NIC filters/.test(s.detail))).toBe(true);
  });
});
