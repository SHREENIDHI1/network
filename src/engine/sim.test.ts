import { describe, expect, it } from 'vitest';
import { addLink, removeLink } from '../model/topologyOps';
import type { Topology } from '../model/types';
import { buildTopology } from '../topologies/builder';
import { parseIpv4 } from './ip/ipv4';
import { Sim } from './sim';
import { addVlans, configure, host, ipIf, setIf } from './testing/fixtures';

const ip = (s: string) => parseIpv4(s)!;

function run(topo: Topology, src: string, dst: string, kind: 'ping' | 'traceroute' = 'ping') {
  const sim = new Sim(topo);
  const id = sim.deviceByName(src)!.id;
  const sid = kind === 'ping' ? sim.ping(id, ip(dst)) : sim.traceroute(id, ip(dst));
  sim.runUntilIdle();
  return { sim, s: sim.session(sid)! };
}

const outcomes = (s: { probes: { outcome: string }[] }) => s.probes.map((p) => p.outcome);

// ---------------------------------------------------------------------------

function lan(): Topology {
  return buildTopology('lan', '', [
    { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
    { key: 'p1', kind: 'pc', name: 'PC1', x: 0, y: 0 },
    { key: 'p2', kind: 'pc', name: 'PC2', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['p1', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['p2', 'eth0'] },
  ]);
}

describe('Ethernet: same VLAN', () => {
  let t = lan();
  t = host(t, 'PC1', '10.10.10.1');
  t = host(t, 'PC2', '10.10.10.2');

  it('hosts ping each other and the switch learns both MACs', () => {
    const { sim, s } = run(t, 'PC1', '10.10.10.2');
    expect(outcomes(s)).toEqual(['reply', 'reply', 'reply', 'reply', 'reply']); // hosts queue packets while ARP resolves
    const macs = sim.macTable(sim.deviceByName('SW')!.id);
    expect(macs.map((m) => `${m.vlan}:${m.port}`).sort()).toEqual(['1:Gi0/1', '1:Gi0/2']);
    expect(sim.arpTable(sim.deviceByName('PC1')!.id).map((a) => a.ip)).toEqual([ip('10.10.10.2')]);
  });

  it('records a hop-by-hop trace with the deciding tables', () => {
    const { sim, s } = run(t, 'PC1', '10.10.10.2');
    const flow = sim.flows.get(s.probes[1].flowId)!;
    const tables = new Set(flow.steps.map((x) => x.table));
    expect(tables.has('MAC table')).toBe(true);
    expect(tables.has('ICMP')).toBe(true);
    expect(flow.steps.some((x) => x.frame?.ip?.icmp.startsWith('echo-reply'))).toBe(true);
  });

  it('different access VLANs isolate the hosts', () => {
    const t2 = configure(t, 'SW', (c) => {
      addVlans(c, 20);
      setIf(c, 'Gi0/2', { accessVlan: 20 });
    });
    const { s } = run(t2, 'PC1', '10.10.10.2');
    expect(outcomes(s).every((o) => o === 'timeout')).toBe(true);
  });

  it('an access port in a VLAN missing from the database drops frames', () => {
    const t2 = configure(t, 'SW', (c) => {
      setIf(c, 'Gi0/1', { accessVlan: 30 });
      setIf(c, 'Gi0/2', { accessVlan: 30 });
    });
    const { sim, s } = run(t2, 'PC1', '10.10.10.2');
    expect(outcomes(s).every((o) => o === 'timeout')).toBe(true);
    const arpFlow = [...sim.flows.values()].find((f) => f.label.startsWith('ARP'))!;
    expect(arpFlow.steps.some((x) => x.table === 'VLAN' && /does not exist/.test(x.detail))).toBe(true);
  });

  it('port-security shutdown err-disables on a new MAC, shutdown/no shutdown recovers', () => {
    let t2 = configure(t, 'SW', (c) => setIf(c, 'Gi0/1', { portSecurity: { enabled: true, maximum: 1, violation: 'shutdown' } }));
    const sim = new Sim(t2);
    const sw = sim.deviceByName('SW')!.id;
    sim.ping(sim.deviceByName('PC1')!.id, ip('10.10.10.2'));
    sim.runUntilIdle();
    expect(sim.secureMacs(sw, 'Gi0/1')).toHaveLength(1);

    // Move the cable: PC2 is unplugged and an intruder PC3 is plugged into Gi0/1.
    const pc1Link = t2.links.find((l) => l.a.portId === 'Gi0/1')!;
    t2 = removeLink(t2, pc1Link.id);
    t2 = buildWith(t2);
    sim.setTopology(t2);
    sim.ping(sim.deviceByName('PC3')!.id, ip('10.10.10.2'), { count: 1 });
    sim.runUntilIdle();
    expect(sim.isErrDisabled(sw, 'Gi0/1')).toBe(true);
    expect(sim.phys.ports.get(`${sw}|Gi0/1`)?.reason).toBe('err-disabled');

    // shutdown then no shutdown clears err-disabled and the old secure MAC.
    t2 = configure(t2, 'SW', (c) => setIf(c, 'Gi0/1', { shutdown: true }));
    sim.setTopology(t2);
    t2 = configure(t2, 'SW', (c) => setIf(c, 'Gi0/1', { shutdown: false }));
    sim.setTopology(t2);
    expect(sim.isErrDisabled(sw, 'Gi0/1')).toBe(false);
    const sid = sim.ping(sim.deviceByName('PC3')!.id, ip('10.10.10.2'));
    sim.runUntilIdle();
    expect(sim.session(sid)!.probes.at(-1)!.outcome).toBe('reply');
  });
});

/** Adds an intruder PC3 (10.10.10.3) on SW Gi0/1. */
function buildWith(t: Topology): Topology {
  const extra = buildTopology('x', '', [{ key: 'p3', kind: 'pc', name: 'PC3', x: 0, y: 0 }], []);
  let merged: Topology = { ...t, devices: [...t.devices, ...extra.devices] };
  const sw = merged.devices.find((d) => d.name === 'SW')!;
  const p3 = merged.devices.find((d) => d.name === 'PC3')!;
  const r = addLink(merged, { kind: 'cat6', a: { deviceId: sw.id, portId: 'Gi0/1' }, b: { deviceId: p3.id, portId: 'eth0' } });
  if (!r.ok) throw new Error(r.reason);
  merged = host(r.topology, 'PC3', '10.10.10.3');
  return merged;
}

// ---------------------------------------------------------------------------

function roas(): Topology {
  let t = buildTopology('roas', '', [
    { key: 'r', kind: 'router', name: 'R1', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
    { key: 'p10', kind: 'uts-prs', name: 'UTS', x: 0, y: 0 },
    { key: 'p20', kind: 'fois', name: 'FOIS', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['p10', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['p20', 'eth0'] },
  ]);
  t = configure(t, 'SW', (c) => {
    addVlans(c, 10, 20);
    setIf(c, 'Gi0/1', { accessVlan: 10 });
    setIf(c, 'Gi0/2', { accessVlan: 20 });
    setIf(c, 'Gi0/24', { mode: 'trunk', trunkAllowed: [10, 20] });
  });
  t = configure(t, 'R1', (c) => {
    setIf(c, 'Gi0/0', { shutdown: false });
    ipIf(c, 'Gi0/0.10', '10.0.10.1', '255.255.255.0', { encapsulation: { vlan: 10, native: false } });
    ipIf(c, 'Gi0/0.20', '10.0.20.1', '255.255.255.0', { encapsulation: { vlan: 20, native: false } });
  });
  t = host(t, 'UTS', '10.0.10.10', '10.0.10.1');
  t = host(t, 'FOIS', '10.0.20.10', '10.0.20.1');
  return t;
}

describe('IP: inter-VLAN routing', () => {
  it('router-on-a-stick: first probe lost to router ARP, then replies (.!!!!)', () => {
    const { sim, s } = run(roas(), 'UTS', '10.0.20.10');
    expect(outcomes(s)).toEqual(['timeout', 'reply', 'reply', 'reply', 'reply']);
    const r1 = sim.deviceByName('R1')!.id;
    expect(sim.routingTable(r1).filter((r) => r.protocol === 'C')).toHaveLength(2);
    // Frames between switch and router are tagged.
    const flow = sim.flows.get(s.probes[1].flowId)!;
    expect(flow.steps.some((x) => x.frame?.vlanTag === 20)).toBe(true);
  });

  it('router ports are shut down by default', () => {
    const t = configure(roas(), 'R1', (c) => setIf(c, 'Gi0/0', { shutdown: undefined }));
    const { s } = run(t, 'UTS', '10.0.20.10');
    expect(outcomes(s).every((o) => o === 'timeout')).toBe(true);
  });

  it('a VLAN missing from the trunk breaks only that VLAN', () => {
    const t = configure(roas(), 'SW', (c) => setIf(c, 'Gi0/24', { trunkAllowed: [10] }));
    expect(run(t, 'UTS', '10.0.10.1').s.probes.at(-1)!.outcome).toBe('reply');
    expect(run(t, 'FOIS', '10.0.20.1').s.probes.every((p) => p.outcome === 'timeout')).toBe(true);
  });

  it('SVI routing on an L3 switch needs "ip routing"', () => {
    let t = buildTopology('svi', '', [
      { key: 'l3', kind: 'l3-switch', name: 'L3', x: 0, y: 0 },
      { key: 'a', kind: 'pc', name: 'A', x: 0, y: 0 },
      { key: 'b', kind: 'pc', name: 'B', x: 0, y: 0 },
    ], [
      { kind: 'cat6', a: ['l3', 'Gi1/0/1'], b: ['a', 'eth0'] },
      { kind: 'cat6', a: ['l3', 'Gi1/0/2'], b: ['b', 'eth0'] },
    ]);
    t = configure(t, 'L3', (c) => {
      addVlans(c, 10, 20);
      setIf(c, 'Gi1/0/1', { accessVlan: 10 });
      setIf(c, 'Gi1/0/2', { accessVlan: 20 });
      ipIf(c, 'Vlan10', '10.0.10.1', '255.255.255.0', { shutdown: false });
      ipIf(c, 'Vlan20', '10.0.20.1', '255.255.255.0', { shutdown: false });
    });
    t = host(t, 'A', '10.0.10.10', '10.0.10.1');
    t = host(t, 'B', '10.0.20.10', '10.0.20.1');
    expect(run(t, 'A', '10.0.20.10').s.probes.every((p) => p.outcome === 'timeout')).toBe(true);
    const routed = configure(t, 'L3', (c) => (c.ipRouting = true));
    expect(outcomes(run(routed, 'A', '10.0.20.10').s)).toEqual(['timeout', 'reply', 'reply', 'reply', 'reply']);
  });
});

// ---------------------------------------------------------------------------

function twoRouters(withStatics: boolean): Topology {
  let t = buildTopology('static', '', [
    { key: 'ra', kind: 'router', name: 'MTD-R', station: 'MTD', x: 0, y: 0 },
    { key: 'rb', kind: 'router', name: 'JU-R', station: 'JU', x: 0, y: 0 },
    { key: 'pa', kind: 'pc', name: 'MTD-PC', x: 0, y: 0 },
    { key: 'pb', kind: 'pc', name: 'JU-PC', x: 0, y: 0 },
  ], [
    { kind: 'ofc', a: ['ra', 'Gi0/4'], b: ['rb', 'Gi0/4'], lengthKm: 5 },
    { kind: 'cat6', a: ['ra', 'Gi0/0'], b: ['pa', 'eth0'] },
    { kind: 'cat6', a: ['rb', 'Gi0/0'], b: ['pb', 'eth0'] },
  ]);
  t = configure(t, 'MTD-R', (c) => {
    ipIf(c, 'Gi0/0', '10.1.1.1', '255.255.255.0', { shutdown: false });
    ipIf(c, 'Gi0/4', '10.0.0.1', '255.255.255.252', { shutdown: false });
    if (withStatics) c.staticRoutes.push({ prefix: '10.2.2.0', mask: '255.255.255.0', nextHop: '10.0.0.2' });
  });
  t = configure(t, 'JU-R', (c) => {
    ipIf(c, 'Gi0/0', '10.2.2.1', '255.255.255.0', { shutdown: false });
    ipIf(c, 'Gi0/4', '10.0.0.2', '255.255.255.252', { shutdown: false });
    if (withStatics) c.staticRoutes.push({ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.1' });
  });
  t = host(t, 'MTD-PC', '10.1.1.10', '10.1.1.1');
  t = host(t, 'JU-PC', '10.2.2.10', '10.2.2.1');
  return t;
}

describe('IP: static routing MTD ↔ JU', () => {
  it('without routes the first router answers destination unreachable', () => {
    const { s } = run(twoRouters(false), 'MTD-PC', '10.2.2.10');
    expect(outcomes(s).every((o) => o === 'unreachable')).toBe(true);
  });

  it('with static + default routes the ping succeeds after ARP warm-up', () => {
    const { sim, s } = run(twoRouters(true), 'MTD-PC', '10.2.2.10');
    expect(s.probes.slice(2).every((p) => p.outcome === 'reply')).toBe(true);
    const mtd = sim.deviceByName('MTD-R')!.id;
    expect(sim.routingTable(mtd).some((r) => r.protocol === 'S')).toBe(true);
  });

  it('traceroute lists each router hop then the destination', () => {
    const t = twoRouters(true);
    const sim = new Sim(t);
    // Warm ARP caches first, like a learner who pinged before tracing.
    sim.ping(sim.deviceByName('MTD-PC')!.id, ip('10.2.2.10'));
    sim.runUntilIdle();
    const sid = sim.traceroute(sim.deviceByName('MTD-PC')!.id, ip('10.2.2.10'));
    sim.runUntilIdle();
    const s = sim.session(sid)!;
    const hops = [0, 1, 2].map((h) => s.probes.slice(h * 3, h * 3 + 3).find((p) => p.from !== undefined)?.from);
    expect(hops).toEqual([ip('10.1.1.1'), ip('10.0.0.2'), ip('10.2.2.10')]);
    expect(s.done).toBe(true);
    expect(s.probes).toHaveLength(9);
  });

  it('a fibre cut takes the link down and the ping fails; restore brings it back', () => {
    const t = twoRouters(true);
    const sim = new Sim(t);
    const ofc = t.links.find((l) => l.kind === 'ofc')!;
    sim.cutLink(ofc.id);
    expect(sim.phys.links.get(ofc.id)?.reason).toBe('fibre cut');
    const pc = sim.deviceByName('MTD-PC')!.id;
    const a = sim.ping(pc, ip('10.2.2.10'));
    sim.runUntilIdle();
    expect(sim.session(a)!.probes.every((p) => p.outcome !== 'reply')).toBe(true);
    sim.restoreLink(ofc.id);
    const b = sim.ping(pc, ip('10.2.2.10'));
    sim.runUntilIdle();
    expect(sim.session(b)!.probes.at(-1)!.outcome).toBe('reply');
  });
});

// ---------------------------------------------------------------------------

function triangle(): Topology {
  let t = buildTopology('stp', '', [
    { key: 's1', kind: 'l2-switch', name: 'SW1', x: 0, y: 0 },
    { key: 's2', kind: 'l2-switch', name: 'SW2', x: 0, y: 0 },
    { key: 's3', kind: 'l2-switch', name: 'SW3', x: 0, y: 0 },
    { key: 'a', kind: 'pc', name: 'A', x: 0, y: 0 },
    { key: 'b', kind: 'pc', name: 'B', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['s1', 'Gi0/23'], b: ['s2', 'Gi0/23'] },
    { kind: 'cat6', a: ['s2', 'Gi0/24'], b: ['s3', 'Gi0/24'] },
    { kind: 'cat6', a: ['s3', 'Gi0/23'], b: ['s1', 'Gi0/24'] },
    { kind: 'cat6', a: ['s1', 'Gi0/1'], b: ['a', 'eth0'] },
    { kind: 'cat6', a: ['s3', 'Gi0/1'], b: ['b', 'eth0'] },
  ]);
  t = host(t, 'A', '192.168.1.1');
  t = host(t, 'B', '192.168.1.2');
  return t;
}

describe('Ethernet: spanning tree', () => {
  it('blocks exactly one port in a triangle and still delivers traffic', () => {
    const { sim, s } = run(triangle(), 'A', '192.168.1.2');
    const roles = [...sim.stp.ports.values()].filter((p) => !p.edge);
    expect(roles.filter((p) => p.role === 'alternate')).toHaveLength(1);
    expect(roles.filter((p) => p.role === 'root')).toHaveLength(2);
    expect(outcomes(s)).toEqual(['reply', 'reply', 'reply', 'reply', 'reply']);
    expect([...sim.stp.bridges.values()].filter((b) => b.isRoot)).toHaveLength(1);
  });

  it('lowest bridge priority becomes root', () => {
    const t = configure(triangle(), 'SW3', (c) => (c.stpPriority = 4096));
    const sim = new Sim(t);
    const root = [...sim.stp.bridges.values()].find((b) => b.isRoot)!;
    expect(sim.device(root.deviceId)!.name).toBe('SW3');
  });

  it('re-converges when a link fails: the blocked port starts forwarding', () => {
    const t = triangle();
    const sim = new Sim(t);
    const blocked = [...sim.stp.ports.values()].find((p) => p.role === 'alternate')!;
    const otherLink = t.links.find((l) => sim.phys.links.get(l.id)!.up && l.kind === 'cat6' && ![l.a.deviceId, l.b.deviceId].includes(blocked.deviceId) )!;
    sim.cutLink(otherLink.id);
    expect(sim.stp.ports.get(`${blocked.deviceId}|${blocked.portId}`)!.state).toBe('forwarding');
  });
});

describe('lab snapshot sections from the engine', () => {
  it('exposes switchports, MAC tables, routes, IPs and ping results to checkers', async () => {
    const { engineSections } = await import('./snapshotSections');
    const { buildSnapshot } = await import('../labs/framework/snapshot');
    const C = await import('../labs/framework/checks');
    const { sim } = run(roas(), 'UTS', '10.0.20.10');
    const snap = buildSnapshot(sim.topology, engineSections(sim));
    expect(C.vlanOnPort('SW', 'Gi0/1', 10)(snap).pass).toBe(true);
    expect(C.trunkAllows('SW', 'Gi0/24', [10, 20])(snap).pass).toBe(true);
    expect(C.routeExists('R1', '10.0.20.0/24', 'connected')(snap).pass).toBe(true);
    expect(C.ipInSubnet('R1', 'Gi0/0.10', '10.0.10.0/24')(snap).pass).toBe(true);
    expect(C.pingSucceeds('UTS', '10.0.20.10')(snap).pass).toBe(true);
    expect(C.noDuplicateIps()(snap).pass).toBe(true);
  });
});
