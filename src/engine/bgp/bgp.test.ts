import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { configure, host } from '../testing/fixtures';
import { parseIpv4 } from '../ip/ipv4';
import { Sim } from '../sim';

/**
 * CE1 (AS 65101, eBGP) — PE1 — P1 (route reflector) — PE2 — H2 (VRF A) / H3 (VRF B).
 * Core: OSPF + LDP, loopbacks 10.0.0.1–3, AS 65000.
 */
function topo(): Topology {
  let t = buildTopology(
    'l3vpn',
    '',
    [
      { key: 'ce1', kind: 'router', name: 'CE1', x: 0, y: 0 },
      { key: 'pe1', kind: 'neon-ler', name: 'PE1', x: 0, y: 0 },
      { key: 'p1', kind: 'neon-lsr', name: 'P1', x: 0, y: 0 },
      { key: 'pe2', kind: 'neon-ler', name: 'PE2', x: 0, y: 0 },
      { key: 'h2', kind: 'pc', name: 'H2', x: 0, y: 0 },
      { key: 'h3', kind: 'pc', name: 'H3', x: 0, y: 0 },
    ],
    [
      { kind: 'cat6', a: ['ce1', 'Gi0/0'], b: ['pe1', 'Gi0/1/0'] },
      { kind: 'ofc', a: ['pe1', 'Te0/0/0'], b: ['p1', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['p1', 'Te0/0/1'], b: ['pe2', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'cat6', a: ['pe2', 'Gi0/1/0'], b: ['h2', 'eth0'] },
      { kind: 'cat6', a: ['pe2', 'Gi0/1/1'], b: ['h3', 'eth0'] },
    ],
  );
  t = host(t, 'H2', '10.2.2.10', '10.2.2.1');
  t = host(t, 'H3', '10.3.3.10', '10.3.3.1');
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
];
const vrf = (name: string, rd: string, rt: string) => [`vrf definition ${name}`, `rd ${rd}`, 'address-family ipv4', `route-target both ${rt}`, 'exit-address-family', 'exit'];

function build(opts: { pe2As?: number; pe2NoUpdateSource?: boolean; pe2ImportA?: string } = {}): Lab {
  const lab = new Lab(topo());
  const run = (dev: string, lines: string[]) => {
    const out = lab.cli(dev, lines);
    expect(out, dev).not.toMatch(/% (Invalid|Incomplete|Ambiguous|Bad|Specify)/);
  };
  run('CE1', [...C, 'interface gi0/0', 'ip address 192.168.1.2 255.255.255.252', 'no shutdown', 'interface loopback0', 'ip address 172.16.1.1 255.255.255.0', 'exit', 'router bgp 65101', 'neighbor 192.168.1.1 remote-as 65000', 'network 172.16.1.0 mask 255.255.255.0', 'end']);
  run('PE1', [
    ...core('10.0.0.1', [['te0/0/0', '10.255.0.0']]),
    ...vrf('A', '10.0.0.1:1', '65000:1'),
    'interface gi0/1/0',
    'vrf forwarding A',
    'ip address 192.168.1.1 255.255.255.252',
    'no shutdown',
    'exit',
    'router bgp 65000',
    'neighbor 10.0.0.2 remote-as 65000',
    'neighbor 10.0.0.2 update-source loopback0',
    'address-family vpnv4',
    'neighbor 10.0.0.2 activate',
    'neighbor 10.0.0.2 send-community extended',
    'exit-address-family',
    'address-family ipv4 vrf A',
    'neighbor 192.168.1.2 remote-as 65101',
    'neighbor 192.168.1.2 activate',
    'redistribute connected',
    'end',
  ]);
  run('P1', [
    ...core('10.0.0.2', [
      ['te0/0/0', '10.255.0.1'],
      ['te0/0/1', '10.255.0.2'],
    ]),
    'router bgp 65000',
    'neighbor 10.0.0.1 remote-as 65000',
    'neighbor 10.0.0.1 update-source loopback0',
    'neighbor 10.0.0.3 remote-as 65000',
    'neighbor 10.0.0.3 update-source loopback0',
    'address-family vpnv4',
    'neighbor 10.0.0.1 activate',
    'neighbor 10.0.0.1 route-reflector-client',
    'neighbor 10.0.0.3 activate',
    'neighbor 10.0.0.3 route-reflector-client',
    'end',
  ]);
  run('PE2', [
    ...core('10.0.0.3', [['te0/0/0', '10.255.0.3']]),
    'vrf definition A',
    'rd 10.0.0.3:1',
    'address-family ipv4',
    'route-target export 65000:1',
    `route-target import ${opts.pe2ImportA ?? '65000:1'}`,
    'exit-address-family',
    'exit',
    ...vrf('B', '10.0.0.3:2', '65000:2'),
    'interface gi0/1/0',
    'vrf forwarding A',
    'ip address 10.2.2.1 255.255.255.0',
    'no shutdown',
    'interface gi0/1/1',
    'vrf forwarding B',
    'ip address 10.3.3.1 255.255.255.0',
    'no shutdown',
    'exit',
    `router bgp ${opts.pe2As ?? 65000}`,
    'neighbor 10.0.0.2 remote-as 65000',
    ...(opts.pe2NoUpdateSource ? [] : ['neighbor 10.0.0.2 update-source loopback0']),
    'address-family vpnv4',
    'neighbor 10.0.0.2 activate',
    'exit-address-family',
    'address-family ipv4 vrf A',
    'redistribute connected',
    'exit-address-family',
    'address-family ipv4 vrf B',
    'redistribute connected',
    'end',
  ]);
  return lab;
}

const ip = (s: string) => parseIpv4(s)!;
const id = (lab: Lab, n: string) => lab.topology.devices.find((d) => d.name === n)!.id;

describe('BGP / MP-BGP L3VPN', () => {
  it('iBGP via the route reflector and PE–CE eBGP come up', () => {
    const lab = build();
    const est = lab.sim.bgp.peerings.filter((p) => p.state === 'Established');
    expect(est.map((p) => `${lab.sim.device(p.dev)!.name}${p.vrf ? `#${p.vrf}` : ''}>${p.neighbor}`).sort()).toEqual(
      ['CE1>3232235777', 'P1>167772161', 'P1>167772163', 'PE1#A>3232235778', 'PE1>167772162', 'PE2>167772162'].sort(),
    );
    expect(lab.cli('P1', ['show bgp vpnv4 unicast all summary'])).toMatch(/10\.0\.0\.1\s+4\s+65000\s.*\s\d+$/m);
  });

  it('VPN routes are exchanged by RT through the RR, with VPN labels', () => {
    const lab = build();
    const pe1A = lab.sim.routingTable(id(lab, 'PE1'), 'A');
    const r = pe1A.find((x) => x.network === ip('10.2.2.0'));
    expect(r?.protocol).toBe('B');
    expect(r?.vpnLabel).toBeGreaterThanOrEqual(1000);
    expect(r?.nextHop).toBe(ip('10.0.0.3'));
    // VRF B is not imported into A.
    expect(pe1A.some((x) => x.network === ip('10.3.3.0'))).toBe(false);
    // CE1 learns H2's subnet via eBGP from PE1.
    expect(lab.cli('CE1', ['show ip route'])).toMatch(/B\s+10\.2\.2\.0\/24 \[20\/0\] via 192\.168\.1\.1/);
    expect(lab.cli('PE1', ['show ip route vrf A'])).toMatch(/Routing Table: A[\s\S]*B\s+10\.2\.2\.0\/24 \[200\/0\] via 10\.0\.0\.3/);
    expect(lab.cli('PE2', ['show bgp vpnv4 unicast all labels'])).toMatch(/10\.2\.2\.0\/24\s+0\.0\.0\.0\s+\d+\/nolabel\(A\)/);
  });

  it('traffic crosses the MPLS core in the VRF; other VRFs stay isolated', () => {
    const lab = build();
    lab.cli('CE1', ['ping 10.2.2.10']); // warm ARP
    const out = lab.cli('CE1', ['ping 10.2.2.10']);
    expect(out).toContain('Success rate is 100 percent (5/5)');
    expect(lab.cli('CE1', ['ping 10.3.3.10'])).toContain('Success rate is 0 percent');
    expect(lab.cli('PE1', ['ping vrf A 10.2.2.10'])).toMatch(/Success rate is (80|100) percent/);
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => (s.frame?.mpls?.length ?? 0) === 2))).toBe(true);
    // Traceroute from the CE shows the P router with the two-label stack (ICMP forwarded along the LSP).
    const tr = lab.cli('CE1', ['traceroute 10.2.2.10']);
    expect(tr).toMatch(/^\s+2 10\.255\.0\.1 \[MPLS: Labels \d+\/\d+ Exp 0\/0\]/m);
    expect(tr).toMatch(/10\.2\.2\.10/);
  });

  it('session failure reasons: remote-as and update-source mismatch', () => {
    const asLab = build({ pe2As: 65001 });
    const p = asLab.sim.bgp.peerings.find((x) => asLab.sim.device(x.dev)!.name === 'P1' && x.neighbor === ip('10.0.0.3'))!;
    expect(p.state).not.toBe('Established');
    expect(p.reason).toMatch(/remote-as mismatch/);
    const srcLab = build({ pe2NoUpdateSource: true });
    const q = srcLab.sim.bgp.peerings.find((x) => srcLab.sim.device(x.dev)!.name === 'P1' && x.neighbor === ip('10.0.0.3'))!;
    expect(q.reason).toMatch(/update-source mismatch|does not expect a session/);
  });

  it('a wrong import RT breaks the VPN in one direction', () => {
    const lab = build({ pe2ImportA: '65000:99' });
    expect(lab.sim.routingTable(id(lab, 'PE2'), 'A').some((x) => x.network === ip('172.16.1.0'))).toBe(false);
    expect(lab.sim.routingTable(id(lab, 'PE1'), 'A').some((x) => x.network === ip('10.2.2.0'))).toBe(true);
  });

  it('running-config shows the VRF and BGP sections', () => {
    const lab = build();
    const rc = lab.cli('PE1', ['enable', 'show running-config']);
    expect(rc).toContain('vrf definition A');
    expect(rc).toContain(' rd 10.0.0.1:1');
    expect(rc).toContain('  route-target export 65000:1');
    expect(rc).toMatch(/interface GigabitEthernet0\/1\/0\n vrf forwarding A\n ip address 192\.168\.1\.1/);
    expect(rc).toContain(' address-family ipv4 vrf A');
    expect(rc).toContain('  neighbor 192.168.1.2 remote-as 65101');
    void configure;
  });
});
