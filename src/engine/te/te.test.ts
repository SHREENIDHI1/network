import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { Sim } from '../sim';
import { analyseTraffic } from '../qos/analysis';
import { configure, host } from '../testing/fixtures';

/**
 * Ring R1 – R2 – R3 – R4 – R1 (LSRs, loopbacks 10.0.0.1–4). R1–R4 has OSPF cost 20,
 * so the IGP path R1 → R3 is via R2.
 */
function topo(): Topology {
  return buildTopology(
    'te',
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
  cut(a: string, b: string): void {
    const ida = this.topology.devices.find((d) => d.name === a)!.id;
    const idb = this.topology.devices.find((d) => d.name === b)!.id;
    const l = this.topology.links.find((x) => (x.a.deviceId === ida && x.b.deviceId === idb) || (x.a.deviceId === idb && x.b.deviceId === ida))!;
    this.sim.cutLink(l.id);
    this.sim.runUntilIdle();
  }
}

const C = ['enable', 'configure terminal'];
// Link addresses: R1–R2 10.254.0.0/31, R2–R3 .2/31, R3–R4 .4/31, R4–R1 .6/31.
const ADDR: Record<string, Array<[string, string, number?]>> = {
  R1: [['te0/0/0', '10.254.0.0'], ['te0/0/1', '10.254.0.7', 20]],
  R2: [['te0/0/0', '10.254.0.1'], ['te0/0/1', '10.254.0.2']],
  R3: [['te0/0/0', '10.254.0.3'], ['te0/0/1', '10.254.0.4']],
  R4: [['te0/0/0', '10.254.0.5'], ['te0/0/1', '10.254.0.6', 20]],
};

function build(rsvp: Record<string, string> = {}): Lab {
  const lab = new Lab(topo());
  for (const [dev, ifs] of Object.entries(ADDR)) {
    const n = Number(dev.slice(1));
    lab.run(dev, [
      ...C,
      'mpls traffic-eng tunnels',
      'interface loopback0',
      `ip address 10.0.0.${n} 255.255.255.255`,
      ...ifs.flatMap(([i, a, cost]) => [
        `interface ${i}`,
        `ip address ${a} 255.255.255.254`,
        'no shutdown',
        'mpls ip',
        'mpls traffic-eng tunnels',
        rsvp[`${dev} ${i}`] ?? 'ip rsvp bandwidth',
        ...(cost ? [`ip ospf cost ${cost}`] : []),
      ]),
      'exit',
      'router ospf 1',
      'network 10.0.0.0 0.255.255.255 area 0',
      'mpls traffic-eng router-id loopback0',
      'mpls traffic-eng area 0',
      'end',
    ]);
  }
  return lab;
}

const tunnel = (extra: string[]) => [...C, 'interface tunnel1', 'ip unnumbered loopback0', 'tunnel mode mpls traffic-eng', 'tunnel destination 10.0.0.3', 'tunnel mpls traffic-eng autoroute announce', ...extra, 'end'];
const names = (lab: Lab, key: string) => {
  const [dev, tun] = key.split('|');
  const l = lab.sim.te.lsps.find((x) => x.tunnel === tun && lab.sim.device(x.head)!.name === dev)!;
  return l.state === 'up' ? l.hops.map((h) => lab.sim.device(h.dev)!.name) : [`down: ${l.reason}`];
};

describe('MPLS TE: RSVP-TE tunnels, CSPF, autoroute, FRR', () => {
  it('dynamic tunnel follows the IGP path and carries autorouted traffic', () => {
    const lab = build();
    lab.run('R1', tunnel(['tunnel mpls traffic-eng path-option 1 dynamic']));
    expect(names(lab, 'R1|Tunnel1')).toEqual(['R1', 'R2', 'R3']);
    expect(lab.cli('R1', ['show ip route'])).toMatch(/10\.0\.0\.3\/32 .*Tunnel1/);
    expect(lab.cli('R1', ['show mpls traffic-eng tunnels brief'])).toMatch(/R1_t1\s+10\.0\.0\.3\s+-\s+Te0\/0\/0\s+up\/up/);
    expect(lab.cli('R2', ['show mpls traffic-eng tunnels brief'])).toMatch(/R1_t1\s+10\.0\.0\.3\s+Te0\/0\/0\s+Te0\/0\/1\s+up\/up/);
    expect(lab.cli('R1', ['ping 10.0.0.3'])).toMatch(/Success rate is (80|100) percent/);
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => /RSVP-TE/.test(s.detail)))).toBe(true);
  });

  it('explicit path via R4, bandwidth admission and fallback path-option', () => {
    const lab = build({ 'R1 te0/0/1': 'ip rsvp bandwidth 100000' });
    lab.run('R1', [...C, 'ip explicit-path name VIA_R4 enable', 'next-address 10.254.0.6', 'next-address 10.254.0.4', 'exit']);
    lab.run('R1', tunnel(['tunnel mpls traffic-eng bandwidth 50000', 'tunnel mpls traffic-eng path-option 1 explicit name VIA_R4']));
    expect(names(lab, 'R1|Tunnel1')).toEqual(['R1', 'R4', 'R3']);
    expect(lab.cli('R1', ['traceroute 10.0.0.3'])).toMatch(/10\.254\.0\.6/);
    // Ask for more than R1–R4 can reserve: the explicit option fails, the dynamic one takes R2.
    lab.run('R1', [...C, 'interface tunnel1', 'tunnel mpls traffic-eng bandwidth 200000', 'tunnel mpls traffic-eng path-option 2 dynamic', 'end']);
    expect(names(lab, 'R1|Tunnel1')).toEqual(['R1', 'R2', 'R3']);
    lab.run('R1', [...C, 'interface tunnel1', 'no tunnel mpls traffic-eng path-option 2', 'end']);
    expect(lab.cli('R1', ['show mpls traffic-eng tunnels brief'])).toMatch(/up\/down[\s\S]*has only 100000 kbit\/s unreserved/);
    expect(lab.cli('R1', ['show ip rsvp interface'])).toMatch(/Te0\/0\/1\s+ena\s+0\s+100000/);
  });

  it('FRR: link protection keeps the LSP up on the backup until re-optimised', () => {
    const lab = build();
    lab.run('R1', tunnel(['tunnel mpls traffic-eng path-option 1 dynamic', 'tunnel mpls traffic-eng fast-reroute']));
    lab.run('R2', [
      ...C,
      'ip explicit-path name AVOID_R2R3 enable',
      'exclude-address 10.254.0.3',
      'exit',
      'interface tunnel2',
      'ip unnumbered loopback0',
      'tunnel mode mpls traffic-eng',
      'tunnel destination 10.0.0.3',
      'tunnel mpls traffic-eng path-option 1 explicit name AVOID_R2R3',
      'exit',
      'interface te0/0/1',
      'mpls traffic-eng backup-path tunnel2',
      'end',
    ]);
    expect(names(lab, 'R2|Tunnel2')).toEqual(['R2', 'R1', 'R4', 'R3']);
    expect(lab.cli('R1', ['show mpls traffic-eng tunnels tunnel1'])).toMatch(/Fast Reroute: enabled, Protection: ready/);
    expect(lab.cli('R2', ['show mpls traffic-eng fast-reroute database'])).toMatch(/R1_t1\s+\d+\s+Te0\/0\/1:Pop\s+Tu2:\d+\s+Ready/);
    lab.cut('R2', 'R3');
    const t1 = lab.sim.te.lsps.find((l) => l.tunnel === 'Tunnel1')!;
    expect(t1.state).toBe('up');
    expect(t1.frr.state).toBe('active');
    lab.cli('R1', ['ping 10.0.0.3']);
    expect(lab.cli('R1', ['ping 10.0.0.3'])).toContain('Success rate is 100 percent');
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => /FAST REROUTE/.test(s.detail)))).toBe(true);
    // Head end re-optimises: new path via R4, FRR no longer active.
    lab.cli('R1', ['enable', 'mpls traffic-eng reoptimize']);
    expect(names(lab, 'R1|Tunnel1')).toEqual(['R1', 'R4', 'R3']);
    expect(lab.sim.te.lsps.find((l) => l.tunnel === 'Tunnel1')!.frr.state).not.toBe('active');
  });

  it('without FRR the head re-signals at once; explicit-only tunnel goes down', () => {
    const lab = build();
    lab.run('R1', [...C, 'ip explicit-path name VIA_R2 enable', 'next-address 10.254.0.1', 'next-address 10.254.0.3', 'exit']);
    lab.run('R1', tunnel(['tunnel mpls traffic-eng path-option 1 explicit name VIA_R2']));
    lab.cut('R2', 'R3');
    expect(lab.cli('R1', ['show mpls traffic-eng tunnels brief'])).toMatch(/next-address 10\.254\.0\.3 is not a TE neighbour of R2/);
    // IGP + LDP still deliver the traffic (autoroute is withdrawn with the tunnel).
    expect(lab.cli('R1', ['show ip route'])).not.toMatch(/Tunnel1/);
  });

  it('running-config shows TE sections', () => {
    const lab = build();
    lab.run('R1', tunnel(['tunnel mpls traffic-eng bandwidth 1000', 'tunnel mpls traffic-eng path-option 1 dynamic']));
    const rc = lab.cli('R1', ['enable', 'show running-config']);
    expect(rc).toContain('mpls traffic-eng tunnels\n');
    expect(rc).toContain('interface Tunnel1\n ip unnumbered Loopback0\n tunnel mode mpls traffic-eng\n tunnel destination 10.0.0.3');
    expect(rc).toContain(' tunnel mpls traffic-eng path-option 1 dynamic');
    expect(rc).toContain(' ip rsvp bandwidth\n');
    expect(rc).toContain(' mpls traffic-eng router-id Loopback0\n mpls traffic-eng area 0');
  });
});

describe('MPLS QoS: EXP in the core', () => {
  const withHosts = () => {
    let t = topo();
    t = buildTopology(
      'teq',
      '',
      [
        ...['r1', 'r2', 'r3', 'r4'].map((k) => ({ key: k, kind: 'neon-lsr' as const, name: k.toUpperCase(), x: 0, y: 0 })),
        { key: 'ph', kind: 'pc' as const, name: 'PHONE', x: 0, y: 0 },
        { key: 'cam', kind: 'pc' as const, name: 'CAM', x: 0, y: 0 },
        { key: 'srv', kind: 'pc' as const, name: 'SRV', x: 0, y: 0 },
      ],
      [
        { kind: 'ofc', a: ['r1', 'Te0/0/0'], b: ['r2', 'Te0/0/0'], lengthKm: 10 },
        { kind: 'ofc', a: ['r2', 'Te0/0/1'], b: ['r3', 'Te0/0/0'], lengthKm: 10 },
        { kind: 'ofc', a: ['r3', 'Te0/0/1'], b: ['r4', 'Te0/0/0'], lengthKm: 10 },
        { kind: 'ofc', a: ['r4', 'Te0/0/1'], b: ['r1', 'Te0/0/1'], lengthKm: 10 },
        { kind: 'cat6', a: ['ph', 'eth0'], b: ['r1', 'Gi0/3/0'] },
        { kind: 'cat6', a: ['cam', 'eth0'], b: ['r1', 'Gi0/3/1'] },
        { kind: 'cat6', a: ['srv', 'eth0'], b: ['r3', 'Gi0/3/0'] },
      ],
    );
    t = host(t, 'PHONE', '10.10.1.10', '10.10.1.1');
    t = host(t, 'CAM', '10.10.2.10', '10.10.2.1');
    t = host(t, 'SRV', '10.30.1.10', '10.30.1.1');
    t = configure(t, 'PHONE', (c) => void (c.traffic = [{ id: 'v', dst: '10.30.1.10', app: 'voip', dscp: 46, rateMbps: 50 }]));
    t = configure(t, 'CAM', (c) => void (c.traffic = [{ id: 'c', dst: '10.30.1.10', app: 'cctv', dscp: 34, rateMbps: 900 }]));
    const lab = new Lab(t);
    for (const [dev, ifs] of Object.entries(ADDR)) {
      const n = Number(dev.slice(1));
      lab.run(dev, [
        ...C,
        'mpls traffic-eng tunnels',
        'interface loopback0',
        `ip address 10.0.0.${n} 255.255.255.255`,
        ...ifs.flatMap(([i, a, cost]) => [`interface ${i}`, `ip address ${a} 255.255.255.254`, 'no shutdown', 'mpls ip', 'mpls traffic-eng tunnels', 'ip rsvp bandwidth', ...(cost ? [`ip ospf cost ${cost}`] : [])]),
        ...(dev === 'R1' ? ['interface gi0/3/0', 'ip address 10.10.1.1 255.255.255.0', 'no shutdown', 'interface gi0/3/1', 'ip address 10.10.2.1 255.255.255.0', 'no shutdown'] : []),
        ...(dev === 'R3' ? ['interface gi0/3/0', 'ip address 10.30.1.1 255.255.255.0', 'no shutdown'] : []),
        'exit',
        'router ospf 1',
        'network 10.0.0.0 0.255.255.255 area 0',
        'mpls traffic-eng router-id loopback0',
        'mpls traffic-eng area 0',
        'end',
      ]);
    }
    return lab;
  };
  const flow = (lab: Lab, app: string) => analyseTraffic(lab.sim).flows.find((f) => f.app.toLowerCase().includes(app))!;

  it('a "match dscp" class does not see labelled packets; "match mpls experimental topmost" does', () => {
    const lab = withHosts();
    // Imposition at R1: EXP = IP precedence (EF 46 → 5, AF41 34 → 4).
    const v = flow(lab, 'voip');
    expect(v.hops.find((h) => h.deviceId === lab.sim.deviceByName('R1')!.id && h.iface === 'Te0/0/0')?.exp).toBe(5);
    expect(v.lossPct).toBeCloseTo(0);
    // Congest the R1–R2 core link (forced to 100 Mbit/s): 950 Mbit/s offered.
    lab.run('R1', [...C, 'interface te0/0/0', 'speed 100', 'end']);
    lab.run('R2', [...C, 'interface te0/0/0', 'speed 100', 'end']);
    expect(flow(lab, 'voip').lossPct).toBeGreaterThan(50);
    lab.run('R1', [...C, 'class-map match-any VOICE-IP', 'match dscp ef', 'exit', 'policy-map CORE', 'class VOICE-IP', 'priority percent 60', 'exit', 'exit', 'interface te0/0/0', 'service-policy output CORE', 'end']);
    expect(flow(lab, 'voip').lossPct).toBeGreaterThan(10);
    lab.run('R1', [...C, 'class-map match-any VOICE-EXP', 'match mpls experimental topmost 5', 'exit', 'policy-map CORE', 'no class VOICE-IP', 'class VOICE-EXP', 'priority percent 60', 'end']);
    expect(flow(lab, 'voip').lossPct).toBeCloseTo(0);
    expect(lab.cli('R1', ['enable', 'show running-config'])).toContain('class-map match-any VOICE-EXP\n match mpls experimental topmost 5');
  });

  it('set mpls experimental imposition re-marks at the PE; TE tunnels steer the flow', () => {
    const lab = withHosts();
    lab.run('R1', [...C, 'class-map match-any ALL', 'match dscp af41', 'exit', 'policy-map MARK', 'class ALL', 'set mpls experimental imposition 1', 'exit', 'exit', 'interface gi0/3/1', 'service-policy input MARK', 'end']);
    const c = flow(lab, 'cctv');
    expect(c.hops.find((h) => h.iface === 'Te0/0/0')?.exp).toBe(1);
    lab.run('R1', [...C, 'ip explicit-path name VIA_R4 enable', 'next-address 10.254.0.6', 'next-address 10.254.0.4', 'exit']);
    lab.run('R1', tunnel(['tunnel mpls traffic-eng path-option 1 explicit name VIA_R4']));
    const via = flow(lab, 'cctv').hops.map((h) => lab.sim.device(h.deviceId)!.name);
    expect(via).toContain('R4');
    expect(via).not.toContain('R2');
  });
});
