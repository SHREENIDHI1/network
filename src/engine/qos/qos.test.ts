import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { Sim } from '../sim';
import { configure, host, ipIf, setIf } from '../testing/fixtures';
import { analyseTraffic } from './analysis';
import { DSCP_NAMES, dscpName, parseDscp } from './apps';

function wan(): Topology {
  let t = buildTopology('qos', '', [
    { key: 'r1', kind: 'router', name: 'GOTN-R', x: 0, y: 0 },
    { key: 'r2', kind: 'router', name: 'JU-R', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'GOTN-SW', x: 0, y: 0 },
    { key: 'ph', kind: 'ip-phone', name: 'PHONE', x: 0, y: 0 },
    { key: 'uts', kind: 'uts-prs', name: 'UTS', x: 0, y: 0 },
    { key: 'cam', kind: 'cctv', name: 'CAM', x: 0, y: 0 },
    { key: 'ap', kind: 'wifi-ap', name: 'AP', x: 0, y: 0 },
    { key: 'srv', kind: 'nms', name: 'DC-SRV', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r1', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['ph', 'LAN'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['uts', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['cam', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/4'], b: ['ap', 'eth0'] },
    { kind: 'cat6', a: ['r1', 'Gi0/1'], b: ['r2', 'Gi0/1'] },
    { kind: 'cat6', a: ['r2', 'Gi0/0'], b: ['srv', 'eth0'] },
  ]);
  t = configure(t, 'GOTN-R', (c) => {
    ipIf(c, 'Gi0/0', '10.1.0.1', '255.255.255.0', { shutdown: false });
    ipIf(c, 'Gi0/1', '10.0.0.1', '255.255.255.252', { shutdown: false, speedMbps: 10 });
    c.staticRoutes.push({ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.2' });
  });
  t = configure(t, 'JU-R', (c) => {
    ipIf(c, 'Gi0/0', '10.9.0.1', '255.255.255.0', { shutdown: false });
    ipIf(c, 'Gi0/1', '10.0.0.2', '255.255.255.252', { shutdown: false });
    c.staticRoutes.push({ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.1' });
  });
  const hosts: Array<[string, string, string, string, number]> = [
    ['PHONE', '10.1.0.11', 'LAN', 'voip', 0.5],
    ['UTS', '10.1.0.12', 'eth0', 'uts', 1],
    ['CAM', '10.1.0.13', 'eth0', 'cctv', 4],
    ['AP', '10.1.0.14', 'eth0', 'wifi', 20],
  ];
  for (const [name, addr, nic, app, rate] of hosts) {
    t = host(t, name, addr, '10.1.0.1', '255.255.255.0', nic);
    const dscp = { voip: 46, uts: 26, cctv: 34, wifi: 0 }[app]!;
    t = configure(t, name, (c) => c.traffic.push({ id: `${name}-flow`, dst: '10.9.0.10', app, dscp, rateMbps: rate }));
  }
  t = host(t, 'DC-SRV', '10.9.0.10', '10.9.0.1');
  return t;
}

const byApp = (r: ReturnType<typeof analyseTraffic>, id: string) => r.flows.find((f) => f.id === id)!;

describe('QoS', () => {
  it('DSCP names', () => {
    expect(parseDscp('ef')).toBe(46);
    expect(parseDscp('AF31')).toBe(26);
    expect(parseDscp('40')).toBe(40);
    expect(parseDscp('xx')).toBeNull();
    expect(dscpName(DSCP_NAMES.af41)).toBe('af41');
  });

  it('forced speed sets the WAN link to 10 Mbps', () => {
    const sim = new Sim(wan());
    const link = sim.topology.links.find((l) => l.a.portId === 'Gi0/1' && l.b.portId === 'Gi0/1')!;
    expect(sim.phys.links.get(link.id)!.speedGbps).toBeCloseTo(0.01);
  });

  it('without a policy, congestion hurts every application equally (FIFO)', () => {
    const r = analyseTraffic(new Sim(wan()));
    const voip = byApp(r, 'PHONE-flow');
    const wifi = byApp(r, 'AP-flow');
    expect(voip.error).toBeUndefined();
    expect(voip.lossPct).toBeGreaterThan(50);
    expect(Math.abs(voip.lossPct - wifi.lossPct)).toBeLessThan(0.01);
    expect(voip.bottleneck?.iface).toBe('Gi0/1');
    expect(r.queues.find((q) => q.iface === 'Gi0/1')!.deliveredMbps).toBeCloseTo(10);
  });

  it('LLQ + CBWFQ protects voice, UTS and CCTV; Wi-Fi absorbs the loss', () => {
    const t = configure(wan(), 'GOTN-R', (c) => {
      c.qos.classMaps.VOICE = { matchAll: false, dscp: [46] };
      c.qos.classMaps.TICKETING = { matchAll: false, dscp: [26] };
      c.qos.classMaps.VIDEO = { matchAll: false, dscp: [34] };
      c.qos.policyMaps.WAN = {
        classes: [
          { name: 'VOICE', priorityPercent: 20 },
          { name: 'TICKETING', bandwidthPercent: 20 },
          { name: 'VIDEO', bandwidthPercent: 40 },
        ],
      };
      setIf(c, 'Gi0/1', { servicePolicyOut: 'WAN' });
    });
    const r = analyseTraffic(new Sim(t));
    expect(byApp(r, 'PHONE-flow').lossPct).toBeCloseTo(0);
    expect(byApp(r, 'UTS-flow').lossPct).toBeCloseTo(0);
    expect(byApp(r, 'CAM-flow').lossPct).toBeCloseTo(0);
    expect(byApp(r, 'AP-flow').deliveredMbps).toBeCloseTo(10 - 0.5 - 1 - 4);
    const q = r.queues.find((x) => x.iface === 'Gi0/1')!;
    expect(q.policy).toBe('WAN');
    expect(q.classes.find((c) => c.name === 'VOICE')!.kind).toBe('priority');
  });

  it('a mis-marked voice flow (best effort) loses its protection', () => {
    let t = configure(wan(), 'PHONE', (c) => (c.traffic[0].dscp = 0));
    t = configure(t, 'GOTN-R', (c) => {
      c.qos.classMaps.VOICE = { matchAll: false, dscp: [46] };
      c.qos.policyMaps.WAN = { classes: [{ name: 'VOICE', priorityPercent: 20 }] };
      setIf(c, 'Gi0/1', { servicePolicyOut: 'WAN' });
    });
    expect(byApp(analyseTraffic(new Sim(t)), 'PHONE-flow').lossPct).toBeGreaterThan(10);
  });

  it('input policy can re-mark traffic (set dscp)', () => {
    let t = configure(wan(), 'PHONE', (c) => (c.traffic[0].dscp = 0));
    t = configure(t, 'GOTN-R', (c) => {
      c.qos.classMaps.ALL = { matchAll: false, dscp: [0] };
      c.qos.policyMaps.MARK = { classes: [{ name: 'ALL', setDscp: 46 }] };
      setIf(c, 'Gi0/0', { servicePolicyIn: 'MARK' });
    });
    const f = byApp(analyseTraffic(new Sim(t)), 'PHONE-flow');
    expect(f.hops[1].dscp).toBe(46);
  });
});
