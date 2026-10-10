import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { updateDevice } from '../../model/topologyOps';
import { buildTopology } from '../../topologies/builder';
import { compliance, pushConfig, renderTemplate, templateVars } from '../automation/automation';
import { execIos, newSession } from '../cli/ios';
import { configure, host } from '../testing/fixtures';
import { Sim } from '../sim';

/** NMS — R1 — R2 — R3, OSPF everywhere; NMS at 10.9.9.10 behind R1. */
function topo(): Topology {
  let t = buildTopology(
    'nms',
    '',
    [
      { key: 'nms', kind: 'nms', name: 'NMS', x: 0, y: 0 },
      { key: 'r1', kind: 'router', name: 'R1', x: 0, y: 0 },
      { key: 'r2', kind: 'router', name: 'R2', x: 0, y: 0 },
      { key: 'r3', kind: 'router', name: 'R3', x: 0, y: 0 },
    ],
    [
      { kind: 'cat6', a: ['nms', 'eth0'], b: ['r1', 'Gi0/0'] },
      { kind: 'cat6', a: ['r1', 'Gi0/1'], b: ['r2', 'Gi0/0'] },
      { kind: 'cat6', a: ['r2', 'Gi0/1'], b: ['r3', 'Gi0/0'] },
    ],
  );
  t = host(t, 'NMS', '10.9.9.10', '10.9.9.1');
  t = configure(t, 'NMS', (c) => {
    c.nms = {
      pollCommunity: 'RAILNMS',
      services: [
        { name: 'NMS to R3', kind: 'path', src: 'NMS', dst: '10.0.0.3' },
        { name: 'Safety link', kind: 'path', src: 'NMS', dst: '10.0.0.3', safety: true },
      ],
    };
  });
  return t;
}

class Lab {
  topology: Topology;
  sim: Sim;
  constructor(t: Topology) {
    this.topology = t;
    this.sim = new Sim(t);
  }
  run(dev: string, lines: string[]): void {
    let session = newSession(this.topology.devices.find((d) => d.name === dev)!.id);
    for (const l of lines) {
      const r = execIos(l, session, { topology: this.topology, sim: this.sim, simulationMode: false });
      expect(r.output, `${dev}: ${l}`).not.toMatch(/% /);
      session = r.session;
      if (r.topology) {
        this.topology = r.topology;
        this.sim.setTopology(this.topology);
      }
    }
    this.sim.runUntilIdle();
  }
  set(t: Topology): void {
    this.topology = t;
    this.sim.setTopology(t);
  }
  id(n: string) {
    return this.topology.devices.find((d) => d.name === n)!.id;
  }
}

const C = ['enable', 'configure terminal'];
function build(): Lab {
  const lab = new Lab(topo());
  const r = (n: number, ifs: Array<[string, string]>, snmp: boolean) => [
    ...C,
    'interface loopback0',
    `ip address 10.0.0.${n} 255.255.255.255`,
    ...ifs.flatMap(([i, a]) => [`interface ${i}`, `ip address ${a} 255.255.255.0`, 'no shutdown']),
    'exit',
    'router ospf 1',
    'network 10.0.0.0 0.255.255.255 area 0',
    'exit',
    ...(snmp ? ['snmp-server community RAILNMS ro'] : []),
    'end',
  ];
  lab.run('R1', r(1, [['gi0/0', '10.9.9.1'], ['gi0/1', '10.1.2.1']], true));
  lab.run('R2', r(2, [['gi0/0', '10.1.2.2'], ['gi0/1', '10.2.3.2']], true));
  lab.run('R3', r(3, [['gi0/0', '10.2.3.3']], false));
  return lab;
}

describe('NMS: managed devices, alarms, services, faults', () => {
  it('manages devices with the polling community; flags the others', () => {
    const lab = build();
    const v = lab.sim.nmsView();
    const st = Object.fromEntries(v.devices.map((d) => [lab.sim.device(d.deviceId)!.name, d.state]));
    expect(st).toEqual({ R1: 'managed', R2: 'managed', R3: 'not-managed' });
    expect(v.alarms.find((a) => a.type === 'NOT-MANAGED')?.text).toMatch(/R3 .*snmp-server community RAILNMS ro/);
    expect(v.services.every((s) => s.status === 'UP')).toBe(true);
    expect(v.alarms.filter((a) => a.severity === 'critical' || a.severity === 'major')).toEqual([]);
  });

  it('power failure: node unreachable, neighbour link down, services down with the root causes listed', () => {
    const lab = build();
    lab.set(updateDevice(lab.topology, lab.id('R2'), { fault: { power: true } }));
    const v = lab.sim.nmsView();
    const types = v.alarms.map((a) => a.type);
    expect(types).toContain('NODE-UNREACHABLE');
    expect(types).toContain('POWER-FAIL');
    expect(v.alarms.find((a) => a.type === 'LINK-DOWN')?.text).toMatch(/R1 Gi0\/1 → R2 down \(R2 has no power\)/);
    const safety = v.alarms.find((a) => a.type === 'SERVICE-DOWN' && a.object === 'Safety link')!;
    expect(safety.severity).toBe('critical');
    expect(safety.causes.length).toBeGreaterThan(0);
    expect(v.alarms[0].severity).toBe('critical');
    lab.set(updateDevice(lab.topology, lab.id('R2'), { fault: undefined }));
    expect(lab.sim.nmsView().services.every((s) => s.status === 'UP')).toBe(true);
  });

  it('card failure and fibre cut raise root-cause alarms', () => {
    const lab = build();
    lab.set(updateDevice(lab.topology, lab.id('R2'), { fault: { cards: ['Gi0/1'] } }));
    let v = lab.sim.nmsView();
    expect(v.alarms.some((a) => a.type === 'CARD-FAIL' && a.deviceId === lab.id('R2'))).toBe(true);
    expect(v.services.find((s) => s.name === 'NMS to R3')!.status).toBe('DOWN');
    lab.set(updateDevice(lab.topology, lab.id('R2'), { fault: undefined }));
    const link = lab.topology.links.find((l) => l.a.deviceId === lab.id('R1') && l.b.deviceId === lab.id('R2'))!;
    lab.sim.cutLink(link.id);
    v = lab.sim.nmsView();
    expect(v.alarms.find((a) => a.type === 'LINK-DOWN' && a.deviceId === lab.id('R1'))?.text).toMatch(/fibre cut|down/);
    expect(v.devices.find((d) => d.deviceId === lab.id('R2'))!.state).toBe('unreachable');
  });
});

describe('Automation: templates, push, compliance', () => {
  it('renders per-device variables and reports unknown ones', () => {
    const lab = build();
    const d = lab.sim.device(lab.id('R2'))!;
    const r = renderTemplate('hostname {{ hostname }}\nlogging host 10.9.9.10\nntp source {{loopback}}\n! comment\n{{nope}}', templateVars(lab.sim, d));
    expect(r.lines).toEqual(['hostname R2', 'logging host 10.9.9.10', 'ntp source 10.0.0.2']);
    expect(r.errors).toEqual(['unknown variable {{nope}}']);
  });

  it('pushes a baseline and compliance turns green; drift is detected', () => {
    const lab = build();
    const ids = ['R1', 'R2', 'R3'].map((n) => lab.id(n));
    const rules = ['^logging host 10\\.9\\.9\\.10$', '^snmp-server community RAILNMS RO$'];
    expect(compliance(lab.sim, ids, rules).rows.every((r) => r.results.every((x) => !x.pass))).toBe(false);
    const res = pushConfig(lab.topology, lab.sim, ids.map((id) => ({ deviceId: id, lines: ['logging host 10.9.9.10', 'snmp-server community RAILNMS ro'] })));
    lab.topology = res.topology;
    expect(res.results.every((r) => r.ok)).toBe(true);
    const c = compliance(lab.sim, ids, rules);
    expect(c.rows.every((r) => r.results.every((x) => x.pass))).toBe(true);
    expect(lab.sim.nmsView().devices.every((d) => d.state === 'managed')).toBe(true);
    lab.run('R3', [...C, 'no logging host 10.9.9.10', 'end']);
    expect(compliance(lab.sim, [lab.id('R3')], rules).rows[0].results[0].pass).toBe(false);
  });
});
