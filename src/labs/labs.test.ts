import { describe, expect, it } from 'vitest';
import { Sim } from '../engine/sim';
import { engineSections } from '../engine/snapshotSections';
import { getTopologyEntry, TOPOLOGY_IDS } from '../topologies';
import { buildSnapshot } from './framework/snapshot';
import { applySolution } from './framework/solution';
import type { Lab } from './framework/types';
import { validateRegistry } from './framework/validate';
import { challenges } from '../store/labStore';
import { labLockReason, LABS } from './registry';

const snap = (sim: Sim) => buildSnapshot(sim.topology, engineSections(sim));

async function start(lab: Lab) {
  const topology = await getTopologyEntry(lab.topologyId)!.load();
  const sim = new Sim(topology);
  sim.runUntilIdle();
  return { topology, sim };
}

describe('labs A4–A15 and B1–B6', () => {
  it('registry is valid and P2/P3 labs are unlocked', () => {
    expect(validateRegistry(LABS, TOPOLOGY_IDS)).toEqual([]);
    for (const l of LABS) expect(labLockReason(l), l.id).toBeNull();
    expect(LABS.map((l) => l.lessonId)).toEqual([
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
      'A10',
      'A11',
      'A12',
      'A13',
      'A14',
      'A15',
      'B1',
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
      'B6',
    ]);
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

      it('break-fix: every fault breaks the service and its fix restores it', async () => {
        const { topology, sim } = await start(lab);
        let current = applySolution(topology, sim, lab.solution!).topology;
        const list = challenges(lab);
        expect(list.length).toBeGreaterThan(0);
        // Tickets are applied one after another to the learner's (fixed) network, as in the UI.
        for (const [i, c] of list.entries()) {
          const broken = c.apply(current);
          const sim2 = new Sim(broken);
          sim2.runUntilIdle();
          expect(c.check(snap(sim2)).pass, `${lab.id} challenge ${i + 1} should fail the check`).toBe(false);
          const fixed = applySolution(broken, sim2, c.fix);
          expect(fixed.errors).toEqual([]);
          expect(c.check(snap(sim2)), `${lab.id} challenge ${i + 1} fix`).toMatchObject({ pass: true });
          current = fixed.topology;
        }
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
  it('L9.1: Gi0/0.20 has the PRS gateway, up/up', async () => {
    const out = await solvedCli('L9.1', 'MTD-R1', ['show ip interface brief']);
    expect(out.split('\n').find((l) => l.startsWith('GigabitEthernet0/0.20'))).toMatch(/10\.52\.20\.1\s+YES manual up\s+up/);
  });

  it('L10.1: after the cut, JU-R1 reaches 10.4.1.0/24 via 10.255.1.13', async () => {
    const out = await solvedCli('L10.1', 'JU-R1', ['show ip route']);
    expect(out.split('\n').find((l) => l.includes('10.4.1.0/24'))).toContain('via 10.255.1.13');
  });

  it('L10.2: DNA-R1 is an L2 neighbour of MTD-R1', async () => {
    const out = await solvedCli('L10.2', 'MTD-R1', ['show isis neighbors']);
    const dna = out.split('\n').filter((l) => l.startsWith('DNA-R1'));
    expect(dna).toHaveLength(1);
    expect(dna[0]).toMatch(/^DNA-R1\s+L2\s/);
  });

  it('L11.1: inside global of JU-ADMIN is 203.0.113.2', async () => {
    const out = await solvedCli('L11.1', 'JU-R1', ['enable', 'show ip nat translations']);
    expect(out.split('\n').find((l) => l.includes('10.1.1.20'))).toMatch(/^icmp 203\.0\.113\.2:/);
  });

  it('L12.1: SSH from Railnet is refused', async () => {
    const lab = LABS.find((l) => l.id === 'L12.1')!;
    const { topology, sim } = await start(lab);
    const t = applySolution(topology, sim, lab.solution!).topology;
    const { execHost } = await import('../engine/cli/host');
    const out = execHost('ssh admin@10.52.50.1', t.devices.find((d) => d.name === 'MTD-RAILNET-PC')!, { sim, simulationMode: false });
    expect(out).toContain('Connection refused');
  });

  it('L13.1: after the cut MTD-R2 is Active', async () => {
    const out = await solvedCli('L13.1', 'MTD-R2', ['show standby brief']);
    expect(out.split('\n').find((l) => l.startsWith('Gi0/0'))).toMatch(/\b10\s+100 P Active/);
  });

  it('L14.1: the bottleneck at the start is MTD-R1 Gi0/1', async () => {
    const lab = LABS.find((l) => l.id === 'L14.1')!;
    const { sim } = await start(lab);
    const { analyseTraffic } = await import('../engine/qos/analysis');
    const r1 = sim.topology.devices.find((d) => d.name === 'MTD-R1')!.id;
    for (const f of analyseTraffic(sim).flows) expect(f.bottleneck).toEqual({ deviceId: r1, iface: 'Gi0/1' });
  });

  it('L15.1: MTD-L3SW default route is O*E2', async () => {
    const out = await solvedCli('L15.1', 'MTD-L3SW', ['show ip route']);
    expect(out).toMatch(/^O\*E2\s+0\.0\.0\.0\/0/m);
  });
  it('L10.1 break-fix hint: show ip ospf interface reveals the hello mismatch', async () => {
    const lab = LABS.find((l) => l.id === 'L10.1')!;
    const { topology, sim } = await start(lab);
    const broken = lab.breakFix!.apply(applySolution(topology, sim, lab.solution!).topology);
    const sim2 = new Sim(broken);
    sim2.runUntilIdle();
    const { execIos, newSession } = await import('../engine/cli/ios');
    const out = execIos('show ip ospf interface gi0/1', newSession(broken.devices.find((d) => d.name === 'JWL-R1')!.id), {
      topology: broken,
      sim: sim2,
      simulationMode: false,
    }).output;
    expect(out).toContain('GigabitEthernet0/1 is up, line protocol is up');
    expect(out).toContain('Hello 5, Dead 20');
    expect(out).toContain('Adjacent neighbor count is 0');
  });
  it('LB1.1: Loopback0 is up/up with the plan address', async () => {
    const out = await solvedCli('LB1.1', 'BNO-LER', ['show ip interface brief']);
    expect(out.split('\n').find((l) => l.startsWith('Loopback0'))).toMatch(/10\.0\.1\.3\s+YES manual up\s+up/);
  });

  it('LB2.1: SMR-LSR has three OSPF neighbours', async () => {
    const out = await solvedCli('LB2.1', 'SMR-LSR', ['show ip ospf neighbor']);
    expect(out.split('\n').filter((l) => /FULL/.test(l))).toHaveLength(3);
  });

  it('LB3.1: MTD-LSR pops the label for DNA', async () => {
    const out = await solvedCli('LB3.1', 'MTD-LSR', ['show mpls forwarding-table']);
    expect(out.split('\n').find((l) => l.includes('10.0.2.6/32'))).toMatch(/Pop Label/);
  });

  it('LB4.1: 25 labelled hops before FL answers', async () => {
    const out = await solvedCli('LB4.1', 'JU-LSR', ['traceroute mpls ipv4 10.0.3.10/32']);
    const lines = out.split('\n');
    expect(lines.filter((l) => /^L \d+ /.test(l))).toHaveLength(25);
    expect(lines.filter((l) => /^! \d+ /.test(l))).toHaveLength(1);
  });

  it('LB5.1: JU-LSR lists three BGP neighbours', async () => {
    const out = await solvedCli('LB5.1', 'JU-LSR', ['show ip bgp summary']);
    expect(out.split('\n').filter((l) => /^\d+\.\d+\.\d+\.\d+\s+4\s/.test(l))).toHaveLength(3);
  });

  it('LB6.1: the RAILNET default route on MTD-LSR is B*', async () => {
    const out = await solvedCli('LB6.1', 'MTD-LSR', ['show ip route vrf RAILNET']);
    expect(out.split('\n').find((l) => l.includes('0.0.0.0/0'))).toMatch(/^B\*/);
  });

  it('LB6.2: NMS-MGMT reaches the RTU LAN via MTD', async () => {
    const out = await solvedCli('LB6.2', 'JU-LSR', ['show ip route vrf NMS-MGMT']);
    expect(out).toMatch(/^B\s+10\.103\.13\.128\/25 \[200\/0\] via 10\.0\.1\.13/m);
  });
});
