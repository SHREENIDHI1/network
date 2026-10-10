import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { Sim } from '../sim';
import { configure, host, ipIf } from '../testing/fixtures';

const ip = (s: string) => parseIpv4(s)!;
const STN = ['JU', 'RKB', 'JUCT', 'BNO'];

/**
 * Four station routers in a ring over OFC (Gi0/4 → next, Gi0/5 ← previous),
 * each with a station LAN 10.<n>.0.0/24 on Gi0/0 and a PC.
 * Ring links: 10.255.<n>.0/30 between station n and n+1.
 */
function ring(opts: { lanArea?: (stn: string) => number } = {}): Topology {
  const devs = STN.flatMap((s, i) => [
    { key: `r${i}`, kind: 'router' as const, name: `${s}-R`, station: s, x: i * 200, y: 0 },
    { key: `p${i}`, kind: 'pc' as const, name: `${s}-PC`, station: s, x: i * 200, y: 200 },
  ]);
  const links = STN.flatMap((_, i) => [
    { kind: 'ofc' as const, a: [`r${i}`, 'Gi0/4'] as [string, string], b: [`r${(i + 1) % 4}`, 'Gi0/5'] as [string, string], lengthKm: 5 },
    { kind: 'cat6' as const, a: [`r${i}`, 'Gi0/0'] as [string, string], b: [`p${i}`, 'eth0'] as [string, string] },
  ]);
  let t = buildTopology('ring', '', devs, links);
  STN.forEach((s, i) => {
    const prev = (i + 3) % 4;
    t = configure(t, `${s}-R`, (c) => {
      ipIf(c, 'Gi0/0', `10.${i + 1}.0.1`, '255.255.255.0', { shutdown: false });
      ipIf(c, 'Gi0/4', `10.255.${i}.1`, '255.255.255.252', { shutdown: false });
      ipIf(c, 'Gi0/5', `10.255.${prev}.2`, '255.255.255.252', { shutdown: false });
      c.ospf = {
        processId: 1,
        networks: [
          { address: `10.${i + 1}.0.0`, wildcard: '0.0.0.255', area: opts.lanArea?.(s) ?? 0 },
          { address: '10.255.0.0', wildcard: '0.0.255.255', area: 0 },
        ],
        passive: ['Gi0/0'],
        defaultOriginate: 'off',
        redistributeStatic: false,
        referenceBandwidth: 100,
        ldpSync: false,
        ldpAutoconfig: false,
      };
    });
    t = host(t, `${s}-PC`, `10.${i + 1}.0.10`, `10.${i + 1}.0.1`);
  });
  return t;
}

const dev = (sim: Sim, name: string) => sim.deviceByName(name)!.id;
const route = (sim: Sim, name: string, prefix: string) =>
  sim.routingTable(dev(sim, name)).find((r) => `${formatIpv4(r.network)}/${r.prefixLen}` === prefix);

describe('OSPF single area ring', () => {
  it('forms FULL adjacencies with DR/BDR on every ring link', () => {
    const sim = new Sim(ring());
    const nbrs = sim.ospf.neighbors;
    expect(nbrs).toHaveLength(8); // 4 links × 2 directions
    expect(nbrs.every((n) => n.state === 'FULL')).toBe(true);
    // Passive LAN interfaces form no neighbours.
    expect(nbrs.some((n) => n.iface === 'Gi0/0')).toBe(false);
  });

  it('learns all remote LANs as O routes with correct cost and ECMP to the opposite station', () => {
    const sim = new Sim(ring());
    const r = route(sim, 'JU-R', '10.2.0.0/24')!;
    expect(r.protocol).toBe('O');
    expect(r.ad).toBe(110);
    expect(r.metric).toBe(2); // 1G link cost 1 (ref 100 Mbps) + LAN stub cost 1
    const opposite = route(sim, 'JU-R', '10.3.0.0/24')!; // JUCT is two hops either way
    expect(opposite.paths).toHaveLength(2);
    expect(opposite.metric).toBe(3);
  });

  it('end-to-end ping works and a fibre cut reroutes the other way round the ring', () => {
    const t = ring();
    const sim = new Sim(t);
    const pc = dev(sim, 'JU-PC');
    sim.ping(pc, ip('10.2.0.10'));
    sim.runUntilIdle();
    expect(route(sim, 'JU-R', '10.2.0.0/24')!.iface).toBe('Gi0/4');

    const juRkb = t.links.find((l) => l.kind === 'ofc' && l.a.deviceId === dev(sim, 'JU-R'))!;
    sim.cutLink(juRkb.id);
    const r = route(sim, 'JU-R', '10.2.0.0/24')!;
    expect(r.iface).toBe('Gi0/5'); // now via BNO
    expect(r.metric).toBe(4);
    // First ping after reroute warms ARP on the new path (each router drops the ARP-triggering packet).
    sim.ping(pc, ip('10.2.0.10'));
    sim.runUntilIdle();
    const sid = sim.ping(pc, ip('10.2.0.10'));
    sim.runUntilIdle();
    expect(sim.session(sid)!.probes.every((p) => p.outcome === 'reply')).toBe(true);
  });

  it('ip ospf cost steers traffic', () => {
    const t = configure(ring(), 'JU-R', (c) => (c.interfaces['Gi0/4'].ospfCost = 100));
    const sim = new Sim(t);
    expect(route(sim, 'JU-R', '10.2.0.0/24')!.iface).toBe('Gi0/5');
  });
});

describe('OSPF troubleshooting conditions', () => {
  it('hello/dead mismatch prevents adjacency and is reported', () => {
    const t = configure(ring(), 'JU-R', (c) => (c.interfaces['Gi0/4'].ospfHello = 5));
    const sim = new Sim(t);
    const ju = dev(sim, 'JU-R');
    expect(sim.ospf.neighbors.some((n) => n.deviceId === ju && n.iface === 'Gi0/4')).toBe(false);
    expect(sim.ospf.problems.some((p) => p.deviceId === ju && /hello\/dead mismatch/.test(p.text))).toBe(true);
  });

  it('MTU mismatch leaves the neighbour stuck in EXSTART and no routes over that link', () => {
    const t = configure(ring(), 'JU-R', (c) => (c.interfaces['Gi0/4'].mtu = 1400));
    const sim = new Sim(t);
    const ju = dev(sim, 'JU-R');
    expect(sim.ospf.neighbors.find((n) => n.deviceId === ju && n.iface === 'Gi0/4')!.state).toBe('EXSTART');
    expect(route(sim, 'JU-R', '10.2.0.0/24')!.iface).toBe('Gi0/5');
  });

  it('area mismatch is reported', () => {
    const t = configure(ring(), 'RKB-R', (c) => (c.ospf!.networks[1].area = 5));
    const sim = new Sim(t);
    expect(sim.ospf.problems.some((p) => /area mismatch/.test(p.text))).toBe(true);
  });

  it('duplicate router-id is detected', () => {
    let t = configure(ring(), 'JU-R', (c) => (c.ospf!.routerId = '1.1.1.1'));
    t = configure(t, 'RKB-R', (c) => (c.ospf!.routerId = '1.1.1.1'));
    const sim = new Sim(t);
    expect(sim.ospf.problems.some((p) => /duplicate router ID 1\.1\.1\.1/.test(p.text))).toBe(true);
  });
});

describe('OSPF multi-area and externals', () => {
  it('ABR summarises a non-backbone area as O IA', () => {
    const sim = new Sim(ring({ lanArea: (s) => (s === 'BNO' ? 1 : 0) }));
    expect(sim.ospf.abrs.has(dev(sim, 'BNO-R'))).toBe(true);
    expect(route(sim, 'JU-R', '10.4.0.0/24')!.protocol).toBe('O IA');
    expect(route(sim, 'JU-R', '10.2.0.0/24')!.protocol).toBe('O');
  });

  it('default-information originate injects O*E2 everywhere', () => {
    const t = configure(ring(), 'JU-R', (c) => {
      c.staticRoutes.push({ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.1.0.254' });
      c.ospf!.defaultOriginate = 'on';
    });
    const sim = new Sim(t);
    const d = route(sim, 'JUCT-R', '0.0.0.0/0')!;
    expect(d.protocol).toBe('O E2');
    expect(d.metric).toBe(1);
    expect(sim.ospf.asbrs.has(dev(sim, 'JU-R'))).toBe(true);
    // Without the static default, "on" originates nothing.
    const t2 = configure(ring(), 'JU-R', (c) => (c.ospf!.defaultOriginate = 'on'));
    expect(route(new Sim(t2), 'JUCT-R', '0.0.0.0/0')).toBeUndefined();
  });

  it('static routes beat OSPF by administrative distance', () => {
    const t = configure(ring(), 'JU-R', (c) => c.staticRoutes.push({ prefix: '10.3.0.0', mask: '255.255.255.0', nextHop: '10.255.3.1' }));
    const sim = new Sim(t);
    expect(route(sim, 'JU-R', '10.3.0.0/24')!.protocol).toBe('S');
  });
});
