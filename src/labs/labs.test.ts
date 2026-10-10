import { describe, expect, it } from 'vitest';
import { Sim } from '../engine/sim';
import { engineSections } from '../engine/snapshotSections';
import { getTopologyEntry, TOPOLOGY_IDS } from '../topologies';
import { buildSnapshot } from './framework/snapshot';
import { applySolution } from './framework/solution';
import type { Lab } from './framework/types';
import { validateRegistry } from './framework/validate';
import { labLockReason, LABS } from './registry';

const snap = (sim: Sim) => buildSnapshot(sim.topology, engineSections(sim));

async function start(lab: Lab) {
  const topology = await getTopologyEntry(lab.topologyId)!.load();
  const sim = new Sim(topology);
  sim.runUntilIdle();
  return { topology, sim };
}

describe('foundation labs (A4–A8)', () => {
  it('registry is valid and P2 labs are unlocked', () => {
    expect(validateRegistry(LABS, TOPOLOGY_IDS)).toEqual([]);
    for (const l of LABS) expect(labLockReason(l), l.id).toBeNull();
    expect(LABS.map((l) => l.lessonId)).toEqual(['A4', 'A5', 'A6', 'A7', 'A8']);
  });

  for (const lab of LABS) {
    describe(lab.id, () => {
      it('start: every task fails with a helpful message', async () => {
        const { sim } = await start(lab);
        const s = snap(sim);
        for (const t of lab.tasks) {
          const r = t.check(s);
          expect(r.pass, `${lab.id} ${t.id} should fail at start`).toBe(false);
          expect(r.detail.length, `${lab.id} ${t.id} detail`).toBeGreaterThan(10);
          expect(r.detail).not.toMatch(/needs the .* engine module/);
        }
      });

      it('solved: the reference solution passes every task', async () => {
        const { topology, sim } = await start(lab);
        const res = applySolution(topology, sim, lab.solution!);
        expect(res.errors).toEqual([]);
        const s = snap(sim);
        for (const t of lab.tasks) expect(t.check(s), `${lab.id} ${t.id}`).toMatchObject({ pass: true });
      });

      it('break-fix: the fault breaks the service and the fix restores it', async () => {
        const { topology, sim } = await start(lab);
        const solved = applySolution(topology, sim, lab.solution!).topology;
        const broken = lab.breakFix!.apply(solved);
        const sim2 = new Sim(broken);
        sim2.runUntilIdle();
        expect(lab.breakFix!.check(snap(sim2)).pass, `${lab.id} break should fail the check`).toBe(false);
        const fixed = applySolution(broken, sim2, lab.breakFix!.fix);
        expect(fixed.errors).toEqual([]);
        expect(lab.breakFix!.check(snap(sim2)), `${lab.id} fix`).toMatchObject({ pass: true });
      });
    });
  }
});

describe('practical quiz answers match the engine', () => {
  async function solvedCli(labId: string, device: string, lines: string[]) {
    const lab = LABS.find((l) => l.id === labId)!;
    const { topology, sim } = await start(lab);
    const t = applySolution(topology, sim, lab.solution!).topology;
    const { execIos, newSession } = await import('../engine/cli/ios');
    let session = newSession(t.devices.find((d) => d.name === device)!.id);
    const out: string[] = [];
    for (const l of lines) {
      const r = execIos(l, session, { topology: t, sim, simulationMode: false });
      session = r.session;
      out.push(r.output);
    }
    return out.join('\n');
  }

  it('L6.1: three interfaces up/up with IPs', async () => {
    const out = await solvedCli('L6.1', 'MTD-R1', ['show ip interface brief']);
    expect(out.split('\n').filter((l) => /10\.52\.20\.\d+.*\bup\s+up$/.test(l))).toHaveLength(3);
  });

  it('L7.1: VLAN 40 lists Gi0/3 on MTD-SW2', async () => {
    const out = await solvedCli('L7.1', 'MTD-SW2', ['show vlan brief']);
    expect(out.split('\n').find((l) => l.startsWith('40 '))).toContain('Gi0/3');
  });

  it('L8.1: root port of MTD-SW-COUNTER is Po1', async () => {
    const out = await solvedCli('L8.1', 'MTD-SW-COUNTER', ['enable', 'show spanning-tree']);
    expect(out).toMatch(/Port\s+\d+ \(Port-channel1\)/);
    expect(out.split('\n').find((l) => l.startsWith('Po1'))).toMatch(/Root FWD/);
  });
});
