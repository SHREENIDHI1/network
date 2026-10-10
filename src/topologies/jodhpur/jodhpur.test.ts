import { describe, expect, it } from 'vitest';
import { execIos, newSession } from '../../engine/cli/ios';
import { Sim } from '../../engine/sim';
import type { Topology } from '../../model/types';
import { j2Length, JODHPUR } from '../data/jodhpur';
import { BOARD_SECTIONS, j1Core, j2, j3, j4 } from './generate';
import { ipPlan, planOverlaps, planSpans } from './plan';

function cli(t: Topology, sim: Sim, dev: string, line: string): string {
  return execIos(line, newSession(t.devices.find((d) => d.name === dev)!.id), { topology: t, sim, simulationMode: false }).output;
}

describe('Jodhpur IP plan', () => {
  it('has a loopback per station and no overlapping prefixes', () => {
    const plan = ipPlan();
    expect(plan.loopbacks.size).toBe(JODHPUR.stations.length);
    expect(planOverlaps(plan.rows)).toEqual([]);
  });

  it('J2 span lengths add up to the map chainage', () => {
    const total = planSpans(JODHPUR, ['S1', 'S2', 'S3']).reduce((a, s) => a + s.km, 0);
    expect(Math.round(total * 100) / 100).toBeCloseTo(j2Length().total, 1);
  });
});

describe('Jodhpur topology generators', () => {
  it('J1–J4 build with valid links and the expected device roles', () => {
    const one = j1Core('none');
    expect(one.devices.filter((d) => d.kind === 'neon-lsr')).toHaveLength(10);
    expect(one.links.every((l) => l.optical === undefined && l.label?.startsWith('Express path'))).toBe(true);
    const two = j2('none');
    expect(two.devices.filter((d) => d.kind !== 'adj-division').map((d) => d.station)).toEqual(
      expect.arrayContaining(['JU', 'MTD', 'DNA', 'FL', 'GOTN']),
    );
    for (const b of Object.keys(BOARD_SECTIONS) as Array<keyof typeof BOARD_SECTIONS>) expect(j3(b, 'none').devices.length).toBeGreaterThan(5);
    const four = j4('none');
    expect(four.devices.filter((d) => d.kind !== 'adj-division')).toHaveLength(JODHPUR.stations.length);
    expect(four.devices.filter((d) => d.kind === 'adj-division')).toHaveLength(5);
  });

  it('J4 with MPLS: every LDP session up and an LSP across the division', () => {
    const t = j4('mpls');
    const sim = new Sim(t);
    sim.runUntilIdle();
    expect(sim.ldp.sessions.length).toBeGreaterThan(150);
    expect(sim.ldp.sessions.every((s) => s.state === 'OPERATIONAL')).toBe(true);
    // Multi-area OSPF: junctions between boards are ABRs.
    const abrs = [...sim.ospf.abrs].map((id) => sim.device(id)!.station);
    expect(abrs).toEqual(expect.arrayContaining(['MTD', 'DNA', 'LN']));
    // Munabao (far west) to Phulera (east boundary): LSP ping over ~40 hops.
    const fl = '10.0.3.10/32';
    expect(ipPlan().loopbacks.get('FL')).toBe('10.0.3.10');
    expect(cli(t, sim, 'MBF-LER', `ping mpls ipv4 ${fl}`)).toContain('Success rate is 100 percent (5/5)');
  });

  it('J1 core with OSPF: loopbacks reachable over express links', () => {
    const t = j1Core('ospf');
    const sim = new Sim(t);
    sim.runUntilIdle();
    expect(cli(t, sim, 'JSM-LSR', 'show ip route')).toMatch(/O\s+10\.0\.2\.6\/32/);
  });
});
