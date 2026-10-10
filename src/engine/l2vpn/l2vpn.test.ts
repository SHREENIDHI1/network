import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { host } from '../testing/fixtures';
import { Sim } from '../sim';

/**
 * H1 — PE1 — P1 — PE2 — H2, and PE3 on P1 with H3 (VPLS).
 * Core: OSPF + LDP, loopbacks 10.0.0.1 (PE1), .2 (P1), .3 (PE2), .4 (PE3).
 */
function topo(): Topology {
  let t = buildTopology(
    'l2vpn',
    '',
    [
      { key: 'h1', kind: 'pc', name: 'H1', x: 0, y: 0 },
      { key: 'pe1', kind: 'neon-ler', name: 'PE1', x: 0, y: 0 },
      { key: 'p1', kind: 'neon-lsr', name: 'P1', x: 0, y: 0 },
      { key: 'pe2', kind: 'neon-ler', name: 'PE2', x: 0, y: 0 },
      { key: 'pe3', kind: 'neon-ler', name: 'PE3', x: 0, y: 0 },
      { key: 'h2', kind: 'pc', name: 'H2', x: 0, y: 0 },
      { key: 'h3', kind: 'pc', name: 'H3', x: 0, y: 0 },
    ],
    [
      { kind: 'cat6', a: ['h1', 'eth0'], b: ['pe1', 'Gi0/1/0'] },
      { kind: 'ofc', a: ['pe1', 'Te0/0/0'], b: ['p1', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['p1', 'Te0/0/1'], b: ['pe2', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['p1', 'Te0/0/2'], b: ['pe3', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'cat6', a: ['pe2', 'Gi0/1/0'], b: ['h2', 'eth0'] },
      { kind: 'cat6', a: ['pe3', 'Gi0/1/0'], b: ['h3', 'eth0'] },
    ],
  );
  t = host(t, 'H1', '192.168.50.1', '192.168.50.254');
  t = host(t, 'H2', '192.168.50.2', '192.168.50.254');
  t = host(t, 'H3', '192.168.50.3', '192.168.50.254');
  return t;
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
const core = (lo: string, ifs: Array<[string, string]>) => [
  ...C,
  'interface loopback0',
  `ip address ${lo} 255.255.255.255`,
  ...ifs.flatMap(([i, a]) => [`interface ${i}`, `ip address ${a} 255.255.255.254`, 'no shutdown', 'mpls ip']),
  'exit',
  'router ospf 1',
  'network 10.0.0.0 0.255.255.255 area 0',
  'exit',
  'mpls ldp router-id loopback0 force',
];

function build(): Lab {
  const lab = new Lab(topo());
  lab.run('PE1', [...core('10.0.0.1', [['te0/0/0', '10.255.0.0']]), 'end']);
  lab.run('P1', [
    ...core('10.0.0.2', [
      ['te0/0/0', '10.255.0.1'],
      ['te0/0/1', '10.255.0.2'],
      ['te0/0/2', '10.255.0.4'],
    ]),
    'end',
  ]);
  lab.run('PE2', [...core('10.0.0.3', [['te0/0/0', '10.255.0.3']]), 'end']);
  lab.run('PE3', [...core('10.0.0.4', [['te0/0/0', '10.255.0.5']]), 'end']);
  return lab;
}

const vpws = (lab: Lab, pe1 = ['xconnect 10.0.0.3 100 encapsulation mpls'], pe2 = ['xconnect 10.0.0.1 100 encapsulation mpls']) => {
  lab.run('PE1', [...C, 'interface gi0/1/0', 'no shutdown', ...pe1, 'end']);
  lab.run('PE2', [...C, 'interface gi0/1/0', 'no shutdown', ...pe2, 'end']);
};

describe('L2VPN: VPWS, VPLS and CEM pseudowires', () => {
  it('VPWS: hosts in one subnet talk across the MPLS core', () => {
    const lab = build();
    vpws(lab);
    const vc = lab.cli('PE1', ['show mpls l2transport vc']);
    expect(vc).toMatch(/Gi0\/1\/0\s+Ethernet\s+10\.0\.0\.3\s+100\s+UP/);
    lab.cli('H1', ['ping 192.168.50.2']);
    const out = lab.cli('H1', ['ping 192.168.50.2']);
    expect(out).toMatch(/Received = 4|Success rate is 100|bytes from 192\.168\.50\.2/);
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => s.frame?.pw && (s.frame.mpls?.length ?? 0) === 2))).toBe(true);
    expect(lab.cli('PE1', ['ping mpls pseudowire 10.0.0.3 100'])).toContain('Success rate is 100 percent (5/5)');
    expect(lab.cli('PE1', ['show mpls l2transport vc detail'])).toMatch(/MPLS VC labels: local \d+, remote \d+/);
  });

  it('VPWS failure reasons: VC ID and MTU mismatch', () => {
    const vcLab = build();
    vpws(vcLab, undefined, ['xconnect 10.0.0.1 101 encapsulation mpls']);
    expect(vcLab.cli('PE1', ['show mpls l2transport vc'])).toMatch(/DOWN[\s\S]*no pseudowire with VC ID 100 .*it has VC ID 101/);
    expect(vcLab.cli('H1', ['ping 192.168.50.2'])).toMatch(/Success rate is 0 percent/);
    const mtuLab = build();
    vpws(mtuLab, ['mtu 1600', 'xconnect 10.0.0.3 100 encapsulation mpls']);
    expect(mtuLab.cli('PE2', ['show mpls l2transport vc'])).toMatch(/MTU mismatch: local 1500, remote 1600/);
  });

  it('VLAN-based VPWS rewrites the tag at each end', () => {
    const lab = build();
    lab.run('PE1', [...C, 'interface gi0/1/0', 'no shutdown', 'interface gi0/1/0.10', 'encapsulation dot1Q 10', 'xconnect 10.0.0.3 200 encapsulation mpls', 'end']);
    lab.run('PE2', [...C, 'interface gi0/1/0', 'no shutdown', 'xconnect 10.0.0.1 200 encapsulation mpls', 'end']);
    expect(lab.cli('PE1', ['show mpls l2transport vc'])).toMatch(/Gi0\/1\/0\.10\s+Eth VLAN 10\s+10\.0\.0\.3\s+200\s+UP/);
  });

  it('VPLS: three sites in one bridge domain with MAC learning and split horizon', () => {
    const lab = build();
    const vfi = (dev: string, peers: string[]) =>
      lab.run(dev, [...C, 'l2 vfi CCTV manual', 'vpn id 104', ...peers.map((p) => `neighbor ${p} encapsulation mpls`), 'exit', 'interface gi0/1/0', 'no shutdown', 'xconnect vfi CCTV', 'end']);
    vfi('PE1', ['10.0.0.3', '10.0.0.4']);
    vfi('PE2', ['10.0.0.1', '10.0.0.4']);
    vfi('PE3', ['10.0.0.1', '10.0.0.3']);
    expect(lab.cli('PE1', ['show vfi CCTV'])).toMatch(/VFI name: CCTV, state: up[\s\S]*10\.0\.0\.3\s+104\s+Y\s+UP[\s\S]*10\.0\.0\.4\s+104\s+Y\s+UP/);
    lab.cli('H1', ['ping 192.168.50.2', 'ping 192.168.50.3']);
    expect(lab.cli('H1', ['ping 192.168.50.3'])).toMatch(/Success rate is 100 percent/);
    expect(lab.cli('H2', ['ping 192.168.50.3'])).toMatch(/Success rate is (80|100) percent/);
    const macs = lab.sim.vfiMacs.get(`${lab.sim.deviceByName('PE1')!.id}|CCTV`)!;
    expect(macs.size).toBeGreaterThanOrEqual(2);
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => /split horizon/.test(s.detail)))).toBe(true);
    // Partial mesh: PE3 forgets PE2 → PE2's VC to PE3 goes down with a reason.
    lab.run('PE3', [...C, 'l2 vfi CCTV manual', 'no neighbor 10.0.0.3', 'end']);
    expect(lab.cli('PE2', ['show vfi'])).toMatch(/10\.0\.0\.4: remote PE PE3 has no xconnect \/ VFI neighbour/);
  });

  it('CEM: SAToP and CESoPSN pseudowires on logical E1 controllers', () => {
    const lab = build();
    const cem = (dev: string, peer: string, group: string) =>
      lab.run(dev, [...C, 'controller E1 0/4/0', group, 'exit', 'interface CEM0/4/0', 'cem 0', `xconnect ${peer} 300 encapsulation mpls`, 'end']);
    cem('PE1', '10.0.0.3', 'cem-group 0 unframed');
    cem('PE2', '10.0.0.1', 'cem-group 0 unframed');
    expect(lab.cli('PE1', ['show mpls l2transport vc'])).toMatch(/CE0\/4\/0\s+SATOP E1\s+10\.0\.0\.3\s+300\s+UP/);
    expect(lab.cli('PE1', ['ping mpls pseudowire 10.0.0.3 300'])).toContain('Success rate is 100 percent');
    const rc = lab.cli('PE1', ['enable', 'show running-config']);
    expect(rc).toContain('controller E1 0/4/0\n cem-group 0 unframed');
    expect(rc).toContain('interface CEM0/4/0\n no ip address\n cem 0\n  xconnect 10.0.0.3 300 encapsulation mpls');
    // CESoPSN with different timeslots on each side → down with the reason.
    lab.run('PE1', [...C, 'controller E1 0/4/0', 'no cem-group 0', 'cem-group 0 timeslots 1-4', 'exit', 'interface CEM0/4/0', 'cem 0', 'xconnect 10.0.0.3 300 encapsulation mpls', 'end']);
    lab.run('PE2', [...C, 'controller E1 0/4/0', 'no cem-group 0', 'cem-group 0 timeslots 1-3', 'exit', 'interface CEM0/4/0', 'cem 0', 'xconnect 10.0.0.1 300 encapsulation mpls', 'end']);
    expect(lab.cli('PE1', ['show mpls l2transport vc'])).toMatch(/CESoPSN timeslots mismatch: local 1-4, remote 1-3/);
    expect(lab.cli('PE1', ['ping mpls pseudowire 10.0.0.3 300'])).toMatch(/QQQQQ/);
  });

  it('CEM is refused on devices without E1 interfaces', () => {
    const lab = build();
    expect(lab.cli('P1', [...C, 'controller E1 0/4/0'])).toMatch(/no E1 controllers/);
  });
});
