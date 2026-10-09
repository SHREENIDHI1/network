import { describe, expect, it } from 'vitest';
import type { Topology } from '../model/types';
import { buildTopology } from '../topologies/builder';
import { formatIpv4, parseIpv4 } from './ip/ipv4';
import { parseAclLine } from './security/acl';
import { Sim } from './sim';
import { addVlans, configure, host, ipIf, setIf } from './testing/fixtures';

const ip = (s: string) => parseIpv4(s)!;
const id = (sim: Sim, n: string) => sim.deviceByName(n)!.id;
function ping(sim: Sim, src: string, dst: string, count = 5) {
  const sid = sim.ping(id(sim, src), ip(dst), { count });
  sim.runUntilIdle();
  return sim.session(sid)!.probes.map((p) => p.outcome);
}

// ---------------------------------------------------------------------------
// ACL
// ---------------------------------------------------------------------------

function station(): Topology {
  let t = buildTopology('stn', '', [
    { key: 'r', kind: 'router', name: 'MTD-R', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'MTD-SW', x: 0, y: 0 },
    { key: 'uts', kind: 'uts-prs', name: 'UTS1', x: 0, y: 0 },
    { key: 'pc', kind: 'pc', name: 'RAILNET-PC', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['uts', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['pc', 'eth0'] },
  ]);
  t = configure(t, 'MTD-SW', (c) => {
    addVlans(c, 10, 50);
    setIf(c, 'Gi0/1', { accessVlan: 10 });
    setIf(c, 'Gi0/2', { accessVlan: 50 });
    setIf(c, 'Gi0/24', { mode: 'trunk' });
  });
  t = configure(t, 'MTD-R', (c) => {
    setIf(c, 'Gi0/0', { shutdown: false });
    ipIf(c, 'Gi0/0.10', '10.0.10.1', '255.255.255.0', { encapsulation: { vlan: 10, native: false } });
    ipIf(c, 'Gi0/0.50', '10.0.50.1', '255.255.255.0', { encapsulation: { vlan: 50, native: false } });
  });
  t = host(t, 'UTS1', '10.0.10.11', '10.0.10.1');
  t = host(t, 'RAILNET-PC', '10.0.50.11', '10.0.50.1');
  return t;
}

describe('ACL', () => {
  it('parses IOS entries', () => {
    expect(parseAclLine('extended', 'deny icmp 10.0.10.0 0.0.0.255 host 10.0.50.11 echo'.split(' '))).toMatchObject({ action: 'deny', protocol: 'icmp', dst: { address: '10.0.50.11', wildcard: '0.0.0.0' }, icmpType: 'echo' });
    expect(parseAclLine('extended', 'permit udp any any eq bootps'.split(' '))).toMatchObject({ dstPort: 67 });
    expect(parseAclLine('standard', 'permit 10.0.10.5'.split(' '))).toMatchObject({ src: { address: '10.0.10.5', wildcard: '0.0.0.0' } });
    expect(typeof parseAclLine('extended', 'permit icmp any'.split(' '))).toBe('string');
  });

  it('extended ACL inbound isolates UTS from Railnet with admin-prohibited (U) and counts hits', () => {
    expect(ping(new Sim(station()), 'UTS1', '10.0.50.11').at(-1)).toBe('reply');
    const t = configure(station(), 'MTD-R', (c) => {
      c.acls['110'] = {
        kind: 'extended',
        entries: [
          { action: 'deny', protocol: 'ip', src: { address: '10.0.10.0', wildcard: '0.0.0.255' }, dst: { address: '10.0.50.0', wildcard: '0.0.0.255' } },
          { action: 'permit', protocol: 'ip', src: { address: '0.0.0.0', wildcard: '255.255.255.255' }, dst: { address: '0.0.0.0', wildcard: '255.255.255.255' } },
        ],
      };
      setIf(c, 'Gi0/0.10', { aclIn: '110' });
    });
    const sim = new Sim(t);
    expect(ping(sim, 'UTS1', '10.0.50.11')).toEqual(['unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable']);
    expect(sim.aclHits.get(`${id(sim, 'MTD-R')}|110`)![0]).toBe(5);
    // UTS can still reach its own gateway (permitted by entry 20).
    expect(ping(sim, 'UTS1', '10.0.10.1').at(-1)).toBe('reply');
  });

  it('standard ACL outbound filters forwarded traffic', () => {
    const t = configure(station(), 'MTD-R', (c) => {
      c.acls['10'] = { kind: 'standard', entries: [{ action: 'deny', protocol: 'ip', src: { address: '10.0.10.0', wildcard: '0.0.0.255' } }, { action: 'permit', protocol: 'ip' }] };
      setIf(c, 'Gi0/0.50', { aclOut: '10' });
    });
    const sim = new Sim(t);
    expect(ping(sim, 'UTS1', '10.0.50.11').every((o) => o === 'unreachable')).toBe(true);
    // Router-originated traffic is not filtered by an outbound ACL.
    expect(ping(sim, 'MTD-R', '10.0.50.11').at(-1)).toBe('reply');
  });
});

// ---------------------------------------------------------------------------
// NAT
// ---------------------------------------------------------------------------

function natLab(): Topology {
  let t = buildTopology('nat', '', [
    { key: 'r', kind: 'router', name: 'EDGE', x: 0, y: 0 },
    { key: 'isp', kind: 'router', name: 'ISP', x: 0, y: 0 },
    { key: 'pc', kind: 'pc', name: 'RAILNET-PC', x: 0, y: 0 },
    { key: 'srv', kind: 'pc', name: 'CAM-SRV', x: 0, y: 0 },
    { key: 'web', kind: 'pc', name: 'WEB', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['pc', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['srv', 'eth0'] },
    { kind: 'cat6', a: ['r', 'Gi0/1'], b: ['isp', 'Gi0/1'] },
    { kind: 'cat6', a: ['isp', 'Gi0/0'], b: ['web', 'eth0'] },
  ]);
  t = configure(t, 'EDGE', (c) => {
    ipIf(c, 'Gi0/0', '192.168.1.1', '255.255.255.0', { shutdown: false, natRole: 'inside' });
    ipIf(c, 'Gi0/1', '203.0.113.1', '255.255.255.248', { shutdown: false, natRole: 'outside' });
    c.staticRoutes.push({ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.6' });
  });
  t = configure(t, 'ISP', (c) => {
    ipIf(c, 'Gi0/1', '203.0.113.6', '255.255.255.248', { shutdown: false });
    ipIf(c, 'Gi0/0', '8.8.8.1', '255.255.255.0', { shutdown: false });
  });
  t = host(t, 'RAILNET-PC', '192.168.1.10', '192.168.1.1');
  t = host(t, 'CAM-SRV', '192.168.1.20', '192.168.1.1');
  t = host(t, 'WEB', '8.8.8.8', '8.8.8.1');
  return t;
}

describe('NAT / PAT', () => {
  it('without NAT, private addresses cannot get answers from the Internet', () => {
    expect(ping(new Sim(natLab()), 'RAILNET-PC', '8.8.8.8').includes('reply')).toBe(false);
  });

  it('PAT (overload) translates to the outside interface address', () => {
    const t = configure(natLab(), 'EDGE', (c) => {
      c.acls['1'] = { kind: 'standard', entries: [{ action: 'permit', protocol: 'ip', src: { address: '192.168.1.0', wildcard: '0.0.0.255' } }] };
      c.nat.overload.push({ acl: '1', iface: 'Gi0/1' });
    });
    const sim = new Sim(t);
    const res = ping(sim, 'RAILNET-PC', '8.8.8.8');
    expect(res.slice(2).every((o) => o === 'reply')).toBe(true);
    const tr = sim.natTranslations(id(sim, 'EDGE')).filter((x) => !x.static);
    expect(tr.length).toBeGreaterThan(0);
    expect(formatIpv4(tr[0].insideGlobal)).toBe('203.0.113.1');
    expect(formatIpv4(tr[0].insideLocal)).toBe('192.168.1.10');
  });

  it('static NAT lets an outside host reach an inside server via its global address', () => {
    const t = configure(natLab(), 'EDGE', (c) => c.nat.statics.push({ local: '192.168.1.20', global: '203.0.113.5' }));
    const sim = new Sim(t);
    // ISP needs no route to 192.168.1.0/24: 203.0.113.5 is on its connected subnet.
    expect(ping(sim, 'WEB', '203.0.113.5').slice(2).every((o) => o === 'reply')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DHCP
// ---------------------------------------------------------------------------

function dhcpLab(withRelay: boolean): Topology {
  let t = buildTopology('dhcp', '', [
    { key: 'r', kind: 'router', name: 'R1', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
    { key: 'a', kind: 'uts-prs', name: 'UTS1', x: 0, y: 0 },
    { key: 'b', kind: 'fois', name: 'FOIS1', x: 0, y: 0 },
    { key: 'srv', kind: 'dns-dhcp', name: 'DHCP-SRV', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['a', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['b', 'eth0'] },
    { kind: 'cat6', a: ['r', 'Gi0/1'], b: ['srv', 'eth0'] },
  ]);
  const pool = { network: '10.10.10.0', mask: '255.255.255.0', defaultRouter: '10.10.10.1', dnsServer: '10.99.0.10', leaseDays: 1 };
  t = configure(t, 'R1', (c) => {
    ipIf(c, 'Gi0/0', '10.10.10.1', '255.255.255.0', { shutdown: false, ...(withRelay ? { helpers: ['10.99.0.10'] } : {}) });
    ipIf(c, 'Gi0/1', '10.99.0.1', '255.255.255.0', { shutdown: false });
    if (!withRelay) {
      c.dhcp.excluded.push({ from: '10.10.10.1', to: '10.10.10.10' });
      c.dhcp.pools.UTS = pool;
    }
  });
  t = host(t, 'DHCP-SRV', '10.99.0.10', '10.99.0.1');
  if (withRelay)
    t = configure(t, 'DHCP-SRV', (c) => {
      c.dhcp.excluded.push({ from: '10.10.10.1', to: '10.10.10.20' });
      c.dhcp.pools.UTS = pool;
    });
  for (const h of ['UTS1', 'FOIS1']) t = configure(t, h, (c) => setIf(c, 'eth0', { dhcpClient: true }));
  return t;
}

describe('DHCP', () => {
  it('router pool: DORA gives each host a unique address and gateway', () => {
    const sim = new Sim(dhcpLab(false));
    sim.runUntilIdle();
    const a = sim.dhcpClient(id(sim, 'UTS1'), 'eth0')!;
    const b = sim.dhcpClient(id(sim, 'FOIS1'), 'eth0')!;
    expect(a.state).toBe('bound');
    expect(b.state).toBe('bound');
    expect(a.lease!.ip).not.toBe(b.lease!.ip);
    expect(a.lease!.ip).toBeGreaterThan(ip('10.10.10.10')); // excluded range respected
    expect(formatIpv4(a.lease!.router!)).toBe('10.10.10.1');
    expect(sim.bindings(id(sim, 'R1'))).toHaveLength(2);
    // The leased address works for traffic.
    expect(ping(sim, 'UTS1', '10.99.0.10').at(-1)).toBe('reply');
    // DORA is visible in the packet inspector.
    const flow = [...sim.flows.values()].find((f) => f.label.startsWith('DHCP UTS1'))!;
    const ops = flow.steps.map((s) => s.frame?.ip?.icmp).filter(Boolean).join(' ');
    for (const op of ['DISCOVER', 'OFFER', 'REQUEST', 'ACK']) expect(ops).toContain(op);
  });

  it('relay (ip helper-address) to a central DHCP server', () => {
    const sim = new Sim(dhcpLab(true));
    sim.runUntilIdle();
    const a = sim.dhcpClient(id(sim, 'UTS1'), 'eth0')!;
    expect(a.state).toBe('bound');
    expect(a.lease!.ip).toBeGreaterThan(ip('10.10.10.20'));
    expect(sim.bindings(id(sim, 'DHCP-SRV')).length).toBe(2);
  });

  it('no server reachable: host falls back to APIPA 169.254.x.x', () => {
    const t = configure(dhcpLab(true), 'R1', (c) => setIf(c, 'Gi0/0', { helpers: [] }));
    const sim = new Sim(t);
    sim.runUntilIdle();
    const a = sim.dhcpClient(id(sim, 'UTS1'), 'eth0')!;
    expect(a.state).toBe('apipa');
    expect(formatIpv4(a.lease!.ip)).toMatch(/^169\.254\./);
  });

  it('pool exhaustion: second host gets no offer', () => {
    const t = configure(dhcpLab(false), 'R1', (c) => (c.dhcp.excluded = [{ from: '10.10.10.1', to: '10.10.10.253' }]));
    const sim = new Sim(t);
    sim.runUntilIdle();
    const states = [sim.dhcpClient(id(sim, 'UTS1'), 'eth0')!.state, sim.dhcpClient(id(sim, 'FOIS1'), 'eth0')!.state].sort();
    expect(states).toEqual(['apipa', 'bound']);
  });
});

// ---------------------------------------------------------------------------
// HSRP / VRRP
// ---------------------------------------------------------------------------

function hsrpLab(proto: 'hsrp' | 'vrrp' = 'hsrp'): Topology {
  let t = buildTopology('hsrp', '', [
    { key: 'r1', kind: 'router', name: 'JN-R1', x: 0, y: 0 },
    { key: 'r2', kind: 'router', name: 'JN-R2', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'JN-SW', x: 0, y: 0 },
    { key: 'pc', kind: 'pc', name: 'SM-PC', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r1', 'Gi0/0'], b: ['sw', 'Gi0/23'] },
    { kind: 'cat6', a: ['r2', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['pc', 'eth0'] },
  ]);
  t = configure(t, 'JN-R1', (c) => ipIf(c, 'Gi0/0', '10.5.0.2', '255.255.255.0', { shutdown: false, fhrp: [{ protocol: proto, group: 1, ip: '10.5.0.1', priority: 110, preempt: true, track: [] }] }));
  t = configure(t, 'JN-R2', (c) => ipIf(c, 'Gi0/0', '10.5.0.3', '255.255.255.0', { shutdown: false, fhrp: [{ protocol: proto, group: 1, ip: '10.5.0.1', track: [] }] }));
  t = host(t, 'SM-PC', '10.5.0.10', '10.5.0.1');
  return t;
}

describe('HSRP / VRRP', () => {
  it('higher priority router becomes active and answers for the virtual IP with the virtual MAC', () => {
    const sim = new Sim(hsrpLab());
    const g = sim.fhrp.groups[0];
    expect(sim.device(g.active!.deviceId)!.name).toBe('JN-R1');
    expect(sim.device(g.standby!.deviceId)!.name).toBe('JN-R2');
    expect(g.vmac).toBe('00:00:0c:07:ac:01');
    expect(ping(sim, 'SM-PC', '10.5.0.1').every((o) => o === 'reply')).toBe(true);
    const arp = sim.arpTable(id(sim, 'SM-PC')).find((a) => a.ip === ip('10.5.0.1'))!;
    expect(arp.mac).toBe('00:00:0c:07:ac:01');
  });

  it('fails over to the standby when the active router\'s link is cut, without changing the host ARP entry', () => {
    const t = hsrpLab();
    const sim = new Sim(t);
    ping(sim, 'SM-PC', '10.5.0.1');
    sim.cutLink(t.links[0].id);
    expect(sim.device(sim.fhrp.groups[0].active!.deviceId)!.name).toBe('JN-R2');
    // The host keeps its ARP entry (virtual MAC); only the new active's own ARP for the host costs one probe.
    expect(ping(sim, 'SM-PC', '10.5.0.1').slice(1).every((o) => o === 'reply')).toBe(true);
    expect(sim.arpTable(id(sim, 'SM-PC')).find((a) => a.ip === ip('10.5.0.1'))!.mac).toBe('00:00:0c:07:ac:01');
    // Repaired: R1 preempts back.
    sim.restoreLink(t.links[0].id);
    expect(sim.device(sim.fhrp.groups[0].active!.deviceId)!.name).toBe('JN-R1');
  });

  it('without preempt the current active keeps the role', () => {
    let t = hsrpLab();
    t = configure(t, 'JN-R1', (c) => (c.interfaces['Gi0/0'].fhrp![0].preempt = false));
    const sim = new Sim(t);
    sim.cutLink(t.links[0].id);
    sim.restoreLink(t.links[0].id);
    expect(sim.device(sim.fhrp.groups[0].active!.deviceId)!.name).toBe('JN-R2');
  });

  it('interface tracking lowers priority and hands over the role', () => {
    const t = configure(hsrpLab(), 'JN-R1', (c) => (c.interfaces['Gi0/0'].fhrp![0].track = [{ iface: 'Gi0/1', decrement: 20 }]));
    const sim = new Sim(t); // Gi0/1 is not connected → down → 110-20 = 90 < 100
    expect(sim.device(sim.fhrp.groups[0].active!.deviceId)!.name).toBe('JN-R2');
  });

  it('VRRP uses master/backup roles and the VRRP virtual MAC', () => {
    const sim = new Sim(hsrpLab('vrrp'));
    const g = sim.fhrp.groups[0];
    expect(g.active!.role).toBe('Master');
    expect(g.vmac).toBe('00:00:5e:00:01:01');
    expect(ping(sim, 'SM-PC', '10.5.0.1').every((o) => o === 'reply')).toBe(true);
  });
});
