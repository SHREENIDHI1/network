import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { parseIpv4 } from '../ip/ipv4';
import { portKey } from '../physical/linkState';
import { Sim } from '../sim';
import { configure, host, setIf } from '../testing/fixtures';

const ip = (s: string) => parseIpv4(s)!;

/** SW1 ⇉ SW2 over two Cat6 links (Gi0/23, Gi0/24), one PC on each switch. */
function twin(): Topology {
  let t = buildTopology(
    'ec',
    '',
    [
      { key: 's1', kind: 'l2-switch', name: 'SW1', x: 0, y: 0 },
      { key: 's2', kind: 'l2-switch', name: 'SW2', x: 0, y: 0 },
      { key: 'a', kind: 'pc', name: 'PCA', x: 0, y: 0 },
      { key: 'b', kind: 'pc', name: 'PCB', x: 0, y: 0 },
    ],
    [
      { kind: 'cat6', a: ['s1', 'Gi0/23'], b: ['s2', 'Gi0/23'] },
      { kind: 'cat6', a: ['s1', 'Gi0/24'], b: ['s2', 'Gi0/24'] },
      { kind: 'cat6', a: ['s1', 'Gi0/1'], b: ['a', 'eth0'] },
      { kind: 'cat6', a: ['s2', 'Gi0/1'], b: ['b', 'eth0'] },
    ],
  );
  t = host(t, 'PCA', '10.0.0.1');
  t = host(t, 'PCB', '10.0.0.2');
  return t;
}

function cli(t: Topology, dev: string, lines: string[]) {
  const sim = new Sim(t);
  let session = newSession(t.devices.find((d) => d.name === dev)!.id);
  let topo = t;
  const out: string[] = [];
  for (const l of lines) {
    const r = execIos(l, session, { topology: topo, sim, simulationMode: false });
    out.push(r.output);
    session = r.session;
    if (r.topology) topo = r.topology;
  }
  return { topology: topo, out };
}

const bundle = (t: Topology, sw: string, mode: string) =>
  cli(t, sw, ['enable', 'conf t', 'int gi0/23', `channel-group 1 mode ${mode}`, 'int gi0/24', `channel-group 1 mode ${mode}`, 'end']).topology;

function stpStates(sim: Sim, sw: string) {
  const id = sim.deviceByName(sw)!.id;
  return ['Gi0/23', 'Gi0/24'].map((p) => sim.stp.ports.get(portKey(id, p))!.state);
}

describe('EtherChannel (LACP, simplified)', () => {
  it('without a bundle, STP blocks one of the two parallel links', () => {
    const sim = new Sim(twin());
    expect([...stpStates(sim, 'SW1'), ...stpStates(sim, 'SW2')].filter((s) => s === 'discarding')).toHaveLength(1);
  });

  it('active + passive bundles both links: both forward, one STP port, ping works', () => {
    const t = bundle(bundle(twin(), 'SW1', 'active'), 'SW2', 'passive');
    const sim = new Sim(t);
    const b1 = sim.etherChannels(sim.deviceByName('SW1')!.id)[0];
    expect(b1.name).toBe('Po1');
    expect(b1.protocol).toBe('LACP');
    expect(b1.members.map((m) => m.flag)).toEqual(['P', 'P']);
    expect(b1.speedGbps).toBe(2);
    expect([...stpStates(sim, 'SW1'), ...stpStates(sim, 'SW2')]).toEqual(['forwarding', 'forwarding', 'forwarding', 'forwarding']);
    const sid = sim.ping(sim.deviceByName('PCA')!.id, ip('10.0.0.2'));
    sim.runUntilIdle();
    expect(sim.session(sid)!.probes.every((p) => p.outcome === 'reply')).toBe(true);
    // MACs are learned on the logical port.
    expect(sim.macTable(sim.deviceByName('SW1')!.id).find((m) => m.port.startsWith('Po'))?.port).toBe('Po1');
  });

  it('show etherchannel summary and running-config reflect the bundle', () => {
    const t = bundle(bundle(twin(), 'SW1', 'active'), 'SW2', 'active');
    const { out } = cli(t, 'SW1', ['enable', 'show etherchannel summary', 'show running-config']);
    expect(out[1]).toMatch(/Po1\(SU\)\s+LACP\s+Gi0\/23\(P\)\s+Gi0\/24\(P\)/);
    expect(out[2]).toContain('interface Port-channel1');
    expect(out[2]).toContain(' channel-group 1 mode active');
  });

  it('passive + passive never negotiates: members stand alone (I) and STP blocks one', () => {
    const t = bundle(bundle(twin(), 'SW1', 'passive'), 'SW2', 'passive');
    const sim = new Sim(t);
    expect(sim.etherChannels(sim.deviceByName('SW1')!.id)[0].members.map((m) => m.flag)).toEqual(['I', 'I']);
    expect([...stpStates(sim, 'SW1'), ...stpStates(sim, 'SW2')].filter((s) => s === 'discarding')).toHaveLength(1);
  });

  it('on vs LACP is a mode mismatch: members suspended, explained in the summary', () => {
    const t = bundle(bundle(twin(), 'SW1', 'on'), 'SW2', 'active');
    const sim = new Sim(t);
    const b = sim.etherChannels(sim.deviceByName('SW1')!.id)[0];
    expect(b.members.map((m) => m.flag)).toEqual(['s', 's']);
    expect(b.up).toBe(false);
    const { out } = cli(t, 'SW1', ['enable', 'show etherchannel summary']);
    expect(out[1]).toContain('channel mode mismatch');
  });

  it('a member whose VLAN settings differ from the port-channel is suspended', () => {
    let t = bundle(bundle(twin(), 'SW1', 'active'), 'SW2', 'active');
    t = configure(t, 'SW1', (c) => setIf(c, 'Gi0/24', { accessVlan: 20 }));
    const sim = new Sim(t);
    const flags = sim.etherChannels(sim.deviceByName('SW1')!.id)[0].members.map((m) => m.flag);
    expect(flags).toEqual(['P', 's']);
    // The far end loses its partner on that link too.
    expect(sim.etherChannels(sim.deviceByName('SW2')!.id)[0].members.map((m) => m.flag)).toEqual(['P', 's']);
  });

  it('settings on interface port-channel are copied to the members', () => {
    let t = bundle(bundle(twin(), 'SW1', 'active'), 'SW2', 'active');
    t = cli(t, 'SW1', ['enable', 'conf t', 'interface port-channel 1', 'switchport mode trunk', 'end']).topology;
    t = cli(t, 'SW2', ['enable', 'conf t', 'int po1', 'switchport mode trunk', 'end']).topology;
    const sim = new Sim(t);
    expect(sim.config(sim.deviceByName('SW1')!.id)!.interfaces['Gi0/24'].mode).toBe('trunk');
    expect(sim.etherChannels(sim.deviceByName('SW1')!.id)[0].members.map((m) => m.flag)).toEqual(['P', 'P']);
  });

  it('losing one member keeps the bundle up on the other', () => {
    const t = bundle(bundle(twin(), 'SW1', 'active'), 'SW2', 'active');
    const sim = new Sim(t);
    const link = t.links.find((l) => l.a.portId === 'Gi0/23' && l.b.portId === 'Gi0/23')!;
    sim.cutLink(link.id);
    const b = sim.etherChannels(sim.deviceByName('SW1')!.id)[0];
    expect(b.members.map((m) => m.flag)).toEqual(['D', 'P']);
    expect(b.up).toBe(true);
    const sid = sim.ping(sim.deviceByName('PCA')!.id, ip('10.0.0.2'));
    sim.runUntilIdle();
    expect(sim.session(sid)!.probes.every((p) => p.outcome === 'reply')).toBe(true);
  });

  it('interface range applies channel-group to every member', () => {
    const t1 = cli(twin(), 'SW1', ['enable', 'conf t', 'interface range gi0/23 - 24', 'channel-group 1 mode active', 'end']);
    expect(t1.out[2]).toBe('');
    const t2 = cli(t1.topology, 'SW2', ['enable', 'conf t', 'int range gi0/23-gi0/24', 'channel-group 1 mode active', 'end']);
    const sim = new Sim(t2.topology);
    expect(sim.etherChannels(sim.deviceByName('SW2')!.id)[0].members.map((m) => m.flag)).toEqual(['P', 'P']);
    expect(cli(twin(), 'SW1', ['enable', 'conf t', 'interface range gi0/99 - 100']).out[2]).toContain('Invalid interface range');
  });

  it('rejects channel-group on routers and on routed ports', () => {
    const t = buildTopology('r', '', [{ key: 'r', kind: 'router', name: 'R1', x: 0, y: 0 }], []);
    const { out } = cli(t, 'R1', ['enable', 'conf t', 'int gi0/1', 'channel-group 1 mode active']);
    expect(out[3]).toContain('Invalid input');
  });
});

describe('Duplex', () => {
  it('forced full on the switch + auto on the PC = mismatch: loss and error counters', () => {
    const t = configure(twin(), 'SW1', (c) => setIf(c, 'Gi0/1', { duplex: 'full' }));
    const sim = new Sim(t);
    const sw = sim.deviceByName('SW1')!.id;
    const st = sim.phys.ports.get(portKey(sw, 'Gi0/1'))!;
    expect(st.duplex).toBe('full');
    expect(st.duplexMismatch).toBe(true);
    expect(sim.phys.ports.get(portKey(sim.deviceByName('PCA')!.id, 'eth0'))!.duplex).toBe('half');
    const sid = sim.ping(sim.deviceByName('PCA')!.id, ip('10.0.0.2'), { count: 10 });
    sim.runUntilIdle();
    const outs = sim.session(sid)!.probes.map((p) => p.outcome);
    expect(outs.filter((o) => o !== 'reply').length).toBeGreaterThan(0);
    expect(outs.filter((o) => o === 'reply').length).toBeGreaterThan(0);
    expect(sim.portCounters(sw, 'Gi0/1').crc).toBeGreaterThan(0);
    expect(sim.portCounters(sim.deviceByName('PCA')!.id, 'eth0').lateCollisions).toBeGreaterThan(0);
  });

  it('auto/auto and full/full are clean', () => {
    const sim = new Sim(twin());
    expect(sim.phys.ports.get(portKey(sim.deviceByName('SW1')!.id, 'Gi0/1'))!.duplexMismatch).toBe(false);
    const { out } = cli(twin(), 'SW1', ['enable', 'conf t', 'int gi0/25', 'duplex half']);
    expect(out[3]).toContain('SFP/fibre ports always run full duplex');
  });
});
