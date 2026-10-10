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

describe('labs A4–A15 and B1–B13', () => {
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
      'B7',
      'B7',
      'B8',
      'B9',
      'B10',
      'B10',
      'B11',
      'B12',
      'B13',
      'B14',
      'B15',
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

  it('LB7.1: the Data Logger VC is a port-mode Ethernet circuit', async () => {
    const out = await solvedCli('LB7.1', 'MTD-LSR', ['show mpls l2transport vc']);
    expect(out).toMatch(/^Gi0\/3\/2\s+Ethernet\s+10\.0\.1\.1\s+1301\s+UP$/m);
  });

  it('LB7.2: JU lists three VFI neighbours', async () => {
    const out = await solvedCli('LB7.2', 'JU-LSR', ['show vfi CCTV']);
    expect(out.split('\n').filter((l) => /^\s+\d+\.\d+\.\d+\.\d+\s+104\s+Y\s+UP$/.test(l))).toHaveLength(3);
  });

  it('LB8.1: the BPAC circuit on KQW is SATOP E1', async () => {
    const out = await solvedCli('LB8.1', 'KQW-LER', ['show mpls l2transport vc']);
    expect(out).toMatch(/^CE0\/2\/0\s+SATOP E1\s+\S+\s+2101\s+UP$/m);
  });

  it('LB9.1: only Railnet loses traffic on the MTD–PPR span', async () => {
    const { analyseTraffic } = await import('../engine/qos/analysis');
    const lab = LABS.find((l) => l.id === 'LB9.1')!;
    const { topology, sim } = await start(lab);
    applySolution(topology, sim, lab.solution!);
    const lossy = analyseTraffic(sim)
      .flows.filter((f) => f.lossPct > 0.1)
      .map((f) => f.app);
    expect(lossy).toEqual(['Railnet / Internet']);
  });

  it('LB10.1: DNA-LSR is a midpoint of MTD-LSR_t1', async () => {
    const out = await solvedCli('LB10.1', 'DNA-LSR', ['show mpls traffic-eng tunnels brief']);
    expect(out).toMatch(/^MTD-LSR_t1\s+10\.0\.1\.1\s+Te0\/0\/0\s+Te0\/0\/1\s+up\/up$/m);
  });

  it('LB10.2: after reoptimize Tunnel1 runs MTD → DNA → JU', async () => {
    const out = await solvedCli('LB10.2', 'MTD-LSR', ['enable', 'mpls traffic-eng reoptimize', 'show mpls traffic-eng tunnels tunnel1']);
    expect(out).toContain('Path: MTD-LSR → DNA-LSR → JU-LSR');
  });

  it('LB11.1: the NMS manages four devices', async () => {
    const lab = LABS.find((l) => l.id === 'LB11.1')!;
    const { topology, sim } = await start(lab);
    applySolution(topology, sim, lab.solution!);
    expect(sim.nmsView().devices.filter((d) => d.state === 'managed')).toHaveLength(4);
  });

  it('LB12.1: {{loopback}} renders to 10.0.1.13 on MTD-LSR', async () => {
    const { templateVars } = await import('../engine/automation/automation');
    const lab = LABS.find((l) => l.id === 'LB12.1')!;
    const { sim } = await start(lab);
    expect(templateVars(sim, sim.deviceByName('MTD-LSR')!).loopback).toBe('10.0.1.13');
  });

  it('LB13.1: JU learns the Jaipur UTS LAN from FL over iBGP', async () => {
    const out = await solvedCli('LB13.1', 'JU-LSR', ['show ip route vrf UTS']);
    expect(out).toMatch(/^B\s+10\.150\.1\.0\/24 \[200\/0\] via 10\.0\.3\.10/m);
  });

  it('LB14.1: MTD-LSR uses local label 16001 for the JU loopback', async () => {
    const { lo } = await import('../topologies/bgpLabs');
    const out = await solvedCli('LB14.1', 'MTD-LSR', ['show mpls forwarding-table']);
    const row = out.split('\n').find((l) => l.includes(`${lo('JU')}/32`));
    expect(row).toMatch(/^16001\s/);
  });

  it('LB15.1: JU-LSR lists three VPNv4 neighbours', async () => {
    const out = await solvedCli('LB15.1', 'JU-LSR', ['show bgp vpnv4 unicast all summary']);
    expect(out.split('\n').filter((l) => /^10\.0\.\d+\.\d+\s+4\s+65000/.test(l))).toHaveLength(3);
  });

  it('LB15.1: a seed draws 10 distinct tickets, the same for the same seed', () => {
    const lab = LABS.find((l) => l.id === 'LB15.1')!;
    const a = challenges(lab, 7);
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(challenges(lab, 7)).toEqual(a);
    expect(challenges(lab, 8)).not.toEqual(a);
  });
});
