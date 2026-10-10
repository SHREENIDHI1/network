import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { Sim } from '../sim';
import { parseNet } from './isis';

/** R1–R2–R3 triangle, Cat6 between routers. */
function triangle(): Topology {
  return buildTopology('tri', '', [
    { key: 'r1', kind: 'router', name: 'R1', x: 0, y: 0 },
    { key: 'r2', kind: 'router', name: 'R2', x: 0, y: 0 },
    { key: 'r3', kind: 'router', name: 'R3', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r1', 'Gi0/0'], b: ['r2', 'Gi0/0'] },
    { kind: 'cat6', a: ['r2', 'Gi0/1'], b: ['r3', 'Gi0/1'] },
    { kind: 'cat6', a: ['r3', 'Gi0/0'], b: ['r1', 'Gi0/1'] },
  ]);
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

const ADDR: Record<string, Array<[string, string]>> = {
  R1: [['gi0/0', '10.0.12.1'], ['gi0/1', '10.0.13.1']],
  R2: [['gi0/0', '10.0.12.2'], ['gi0/1', '10.0.23.2']],
  R3: [['gi0/1', '10.0.23.3'], ['gi0/0', '10.0.13.3']],
};

function isisTriangle(opts: Partial<Record<string, { area?: string; type?: string; extra?: string[] }>> = {}): Topology {
  let t = triangle();
  ['R1', 'R2', 'R3'].forEach((r, i) => {
    const o = opts[r] ?? {};
    const n = i + 1;
    t = cli(t, r, [
      'enable',
      'configure terminal',
      'interface loopback 0',
      `ip address ${n}.${n}.${n}.${n} 255.255.255.255`,
      'ip router isis',
      ...ADDR[r].flatMap(([ifn, a]) => [`interface ${ifn}`, `ip address ${a} 255.255.255.0`, 'no shutdown', 'ip router isis']),
      'router isis',
      `net ${o.area ?? '49.0001'}.0000.0000.000${n}.00`,
      ...(o.type ? [`is-type ${o.type}`] : []),
      ...(o.extra ?? []),
      'end',
    ]).topology;
  });
  return t;
}

const route = (sim: Sim, dev: string, prefix: string) => {
  const [net, len] = prefix.split('/');
  return sim.routingTable(sim.deviceByName(dev)!.id).find((r) => r.network === parseIpv4(net) && r.prefixLen === Number(len));
};

function ping(sim: Sim, from: string, to: string) {
  const sid = sim.ping(sim.deviceByName(from)!.id, parseIpv4(to)!);
  sim.runUntilIdle();
  return sim.session(sid)!.probes.map((p) => p.outcome);
}

describe('loopbacks', () => {
  it('are up, routed as connected /32 and preferred as OSPF router-id', () => {
    let t = triangle();
    t = cli(t, 'R1', ['enable', 'conf t', 'int lo0', 'ip address 1.1.1.1 255.255.255.255', 'int gi0/0', 'ip address 10.0.12.1 255.255.255.0', 'no shut', 'router ospf 1', 'network 0.0.0.0 255.255.255.255 area 0', 'end']).topology;
    t = cli(t, 'R2', ['enable', 'conf t', 'int gi0/0', 'ip address 10.0.12.2 255.255.255.0', 'no shut', 'router ospf 1', 'network 0.0.0.0 255.255.255.255 area 0', 'end']).topology;
    const sim = new Sim(t);
    expect(formatIpv4(sim.ospf.routerIds.get(sim.deviceByName('R1')!.id)!)).toBe('1.1.1.1');
    expect(route(sim, 'R2', '1.1.1.1/32')).toMatchObject({ protocol: 'O', metric: 2 });
    expect(ping(sim, 'R2', '1.1.1.1').filter((o) => o === 'reply').length).toBeGreaterThan(0);
    const { out } = cli(t, 'R1', ['enable', 'show ip interface brief', 'show running-config']);
    expect(out[1]).toMatch(/Loopback0\s+1\.1\.1\.1\s+YES manual up\s+up/);
    expect(out[2]).toContain('interface Loopback0');
  });
});

describe('IS-IS', () => {
  it('parses NETs', () => {
    expect(parseNet('49.0001.0000.0000.0001.00')).toEqual({ area: '49.0001', systemId: '0000.0000.0001' });
    expect(parseNet('49.0001.0000.0000.0001.01')).toBeNull();
    expect(parseNet('49.0001.00.00')).toBeNull();
  });

  it('single area L1/L2: adjacencies on every link, loopbacks learned (metric 10 + 10)', () => {
    const sim = new Sim(isisTriangle());
    const r1 = sim.deviceByName('R1')!.id;
    expect(sim.isis.adjacencies.filter((a) => a.deviceId === r1).map((a) => a.level).sort()).toEqual([1, 1, 2, 2]);
    expect(route(sim, 'R1', '2.2.2.2/32')).toMatchObject({ protocol: 'i L1', ad: 115, metric: 20 });
    expect(route(sim, 'R1', '10.0.23.0/24')).toMatchObject({ protocol: 'i L1', metric: 20 });
    expect(route(sim, 'R1', '10.0.23.0/24')!.paths).toHaveLength(2); // ECMP via R2 and R3
    expect(ping(sim, 'R1', '3.3.3.3').filter((o) => o === 'reply').length).toBeGreaterThan(0);
  });

  it('isis metric steers the path', () => {
    let t = isisTriangle();
    t = cli(t, 'R1', ['enable', 'conf t', 'int gi0/0', 'isis metric 50', 'end']).topology;
    const sim = new Sim(t);
    const r = route(sim, 'R1', '2.2.2.2/32')!;
    expect(r.metric).toBe(30);
    expect(r.iface).toBe('Gi0/1');
  });

  it('two areas: L2 between them, L1/L2 routers leak and set ATT, L1-only router gets a default', () => {
    const t = isisTriangle({ R1: { type: 'level-1' }, R3: { area: '49.0002' } });
    const sim = new Sim(t);
    // R1 (L1 only) ↔ R3 (other area): no adjacency, explained.
    expect(sim.isis.problems.some((p) => /area mismatch/.test(p.text))).toBe(true);
    expect(route(sim, 'R2', '3.3.3.3/32')).toMatchObject({ protocol: 'i L2' });
    expect(sim.isis.attached.has(sim.deviceByName('R2')!.id)).toBe(true);
    expect(route(sim, 'R1', '0.0.0.0/0')).toMatchObject({ protocol: 'i L1', nextHop: parseIpv4('10.0.12.2') });
    expect(route(sim, 'R1', '3.3.3.3/32')).toBeUndefined();
    expect(ping(sim, 'R1', '3.3.3.3').filter((o) => o === 'reply').length).toBeGreaterThan(0);
    const { out } = cli(t, 'R1', ['enable', 'show ip route', 'show isis neighbors', 'show isis database']);
    expect(out[1]).toMatch(/i\*L1\s+0\.0\.0\.0\/0 \[115\/10\] via 10\.0\.12\.2/);
    expect(out[2]).toMatch(/R2\s+L1\s+Gi0\/0\s+10\.0\.12\.2\s+UP/);
    expect(out[2]).toContain('area mismatch');
    expect(out[3]).toMatch(/R2\.00-00\s+.*1\/0\/0/); // ATT bit seen in R1's L1 database
  });

  it('rejects a bad NET and shows the config', () => {
    const t = triangle();
    const { out, topology } = cli(t, 'R1', ['enable', 'conf t', 'router isis', 'net 49.0001.1234.00', 'net 49.0001.0000.0000.0001.00', 'is-type level-2-only', 'end', 'show running-config']);
    expect(out[3]).toContain('Invalid NET');
    expect(out[7]).toContain(' net 49.0001.0000.0000.0001.00');
    expect(out[7]).toContain(' is-type level-2-only');
    expect(topology).toBeDefined();
  });
});

describe('RIP (demo)', () => {
  function ripChain(version: 1 | 2) {
    let t = triangle();
    // Use only R1–R2 and R2–R3 (cut R3–R1 by leaving it unaddressed/shut).
    for (const r of ['R1', 'R2', 'R3']) {
      t = cli(t, r, [
        'enable',
        'conf t',
        ...ADDR[r].filter(([, a]) => !a.startsWith('10.0.13.')).flatMap(([i, a]) => [`interface ${i}`, `ip address ${a} 255.255.255.0`, 'no shutdown']),
        'router rip',
        ...(version === 2 ? ['version 2'] : []),
        'network 10.0.0.0',
        'no auto-summary',
        'end',
      ]).topology;
    }
    return t;
  }

  it('v2: hop-count routes across the chain', () => {
    const sim = new Sim(ripChain(2));
    expect(route(sim, 'R1', '10.0.23.0/24')).toMatchObject({ protocol: 'R', ad: 120, metric: 1, nextHop: parseIpv4('10.0.12.2') });
    expect(ping(sim, 'R1', '10.0.23.3').filter((o) => o === 'reply').length).toBeGreaterThan(0);
    const { out } = cli(ripChain(2), 'R1', ['enable', 'show ip protocols', 'show ip route rip']);
    expect(out[1]).toContain('Routing Protocol is "rip"');
    expect(out[1]).toContain('10.0.12.2');
    expect(out[2]).toMatch(/R\s+10\.0\.23\.0\/24 \[120\/1\] via 10\.0\.12\.2/);
  });

  it('v1 is not simulated: no routes and a clear message', () => {
    const t = ripChain(1);
    const sim = new Sim(t);
    expect(route(sim, 'R1', '10.0.23.0/24')).toBeUndefined();
    expect(sim.rip.problems[0].text).toContain('version 2');
  });

  it('OSPF beats RIP for the same prefix (AD 110 < 120)', () => {
    let t = ripChain(2);
    for (const r of ['R1', 'R2', 'R3']) t = cli(t, r, ['enable', 'conf t', 'router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'end']).topology;
    const sim = new Sim(t);
    expect(route(sim, 'R1', '10.0.23.0/24')!.protocol).toBe('O');
  });
});
