import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { Sim } from '../sim';

/** Ring R1 – R2 – R3 – R4 – R1; R1–R4 has OSPF cost 20. No LDP unless asked. */
function topo(): Topology {
  return buildTopology(
    'sr',
    '',
    ['r1', 'r2', 'r3', 'r4'].map((k) => ({ key: k, kind: 'neon-lsr' as const, name: k.toUpperCase(), x: 0, y: 0 })),
    [
      { kind: 'ofc', a: ['r1', 'Te0/0/0'], b: ['r2', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['r2', 'Te0/0/1'], b: ['r3', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['r3', 'Te0/0/1'], b: ['r4', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['r4', 'Te0/0/1'], b: ['r1', 'Te0/0/1'], lengthKm: 10 },
    ],
  );
}

class Lab {
  topology: Topology;
  sim: Sim;
  constructor(t: Topology) {
    this.topology = t;
    this.sim = new Sim(t);
  }
  cli(dev: string, lines: string[]): string {
    let session = newSession(this.topology.devices.find((d) => d.name === dev)!.id);
    const out: string[] = [];
    for (const l of lines) {
      const r = execIos(l, session, { topology: this.topology, sim: this.sim, simulationMode: false });
      out.push(r.output);
      session = r.session;
      if (r.topology) {
        this.topology = r.topology;
        this.sim.setTopology(this.topology);
      }
    }
    this.sim.runUntilIdle();
    return out.join('\n');
  }
  run(dev: string, lines: string[]): void {
    expect(this.cli(dev, lines), dev).not.toMatch(/% /);
  }
}

const C = ['enable', 'configure terminal'];
const ADDR: Record<string, Array<[string, string, number?]>> = {
  R1: [
    ['te0/0/0', '10.254.0.0'],
    ['te0/0/1', '10.254.0.7', 20],
  ],
  R2: [
    ['te0/0/0', '10.254.0.1'],
    ['te0/0/1', '10.254.0.2'],
  ],
  R3: [
    ['te0/0/0', '10.254.0.3'],
    ['te0/0/1', '10.254.0.4'],
  ],
  R4: [
    ['te0/0/0', '10.254.0.5'],
    ['te0/0/1', '10.254.0.6', 20],
  ],
};

function build(o: { ldp?: boolean; index?: (n: number) => number } = {}): Lab {
  const lab = new Lab(topo());
  for (const [dev, ifs] of Object.entries(ADDR)) {
    const n = Number(dev.slice(1));
    lab.run(dev, [
      ...C,
      'interface loopback0',
      `ip address 10.0.0.${n} 255.255.255.255`,
      ...ifs.flatMap(([i, a, cost]) => [
        `interface ${i}`,
        `ip address ${a} 255.255.255.254`,
        'no shutdown',
        ...(o.ldp ? ['mpls ip'] : []),
        `ip ospf cost ${cost ?? 10}`,
      ]),
      'exit',
      'segment-routing mpls',
      'connected-prefix-sid-map',
      'address-family ipv4',
      `10.0.0.${n}/32 index ${o.index ? o.index(n) : n} range 1`,
      'exit-address-family',
      'exit',
      'exit',
      'router ospf 1',
      'network 10.0.0.0 0.255.255.255 area 0',
      'segment-routing mpls',
      'fast-reroute per-prefix enable prefix-priority low',
      'fast-reroute per-prefix ti-lfa',
      'end',
    ]);
  }
  return lab;
}

describe('Segment Routing (SR-MPLS, OSPF) and TI-LFA', () => {
  it('prefix SIDs give global labels, PHP at the penultimate hop, and real label switching', () => {
    const lab = build();
    expect(lab.cli('R1', ['show mpls forwarding-table'])).toMatch(/^16003\s+16003\s+10\.0\.0\.3\/32/m);
    expect(lab.cli('R2', ['show mpls forwarding-table'])).toMatch(/^16003\s+Pop Label\s+10\.0\.0\.3\/32/m);
    expect(lab.cli('R1', ['ping mpls ipv4 10.0.0.3/32'])).toContain('Success rate is 100 percent');
    lab.cli('R1', ['ping 10.0.0.3']);
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => /SR pop: label 16003/.test(s.detail)))).toBe(true);
    const rc = lab.cli('R1', ['enable', 'show running-config']);
    expect(rc).toContain(
      'segment-routing mpls\n !\n connected-prefix-sid-map\n  address-family ipv4\n   10.0.0.1/32 index 1 range 1\n  exit-address-family',
    );
    expect(rc).toContain(' segment-routing mpls\n fast-reroute per-prefix enable prefix-priority low\n fast-reroute per-prefix ti-lfa');
  });

  it('LDP is preferred while it runs; SR takes over without it', () => {
    const lab = build({ ldp: true });
    const r1 = lab.sim.deviceByName('R1')!.id;
    const ftn = lab.sim.ftn(r1, (10 << 24) | 3, 32);
    expect(typeof ftn?.out === 'number' && ftn.out < 16000).toBe(true);
  });

  it('a SID index conflict rejects both prefixes', () => {
    const lab = build({ index: (n) => (n === 4 ? 1 : n) });
    expect(lab.sim.sr.problems.some((p) => /SID index 1 conflict/.test(p.text))).toBe(true);
    expect(lab.sim.sr.sids.some((s) => s.index === 1)).toBe(false);
    expect(lab.cli('R3', ['ping mpls ipv4 10.0.0.1/32'])).toMatch(/Q/);
  });

  it('TI-LFA repair for R3 from R1 over the R4 side (PQ node R4)', () => {
    const lab = build();
    const r1 = lab.sim.deviceByName('R1')!.id;
    const t = lab.sim.sr.tiLfa.find((x) => x.deviceId === r1 && x.prefix === '10.0.0.3/32')!;
    expect(t.protectedIface).toBe('Te0/0/0');
    expect(t.path.map((d) => lab.sim.device(d)!.name)).toEqual(['R1', 'R4', 'R3']);
    expect(t.segments).toEqual(['node-SID R4 (16004)']);
    // R2 protecting its link to R3: R1 is not in Q-space (it would come back via R2), R4 is: node-SID then adjacency.
    const r2 = lab.sim.deviceByName('R2')!.id;
    const u = lab.sim.sr.tiLfa.find((x) => x.deviceId === r2 && x.prefix === '10.0.0.3/32')!;
    expect(u.path.map((d) => lab.sim.device(d)!.name)).toEqual(['R2', 'R1', 'R4', 'R3']);
    expect(u.segments.length).toBeGreaterThan(0);
  });
});
