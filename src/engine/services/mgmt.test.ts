import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execHost } from '../cli/host';
import { execIos, newSession } from '../cli/ios';
import { Sim } from '../sim';
import { configure, host } from '../testing/fixtures';

/** PC1, DNS/NTP server and NMS on R1's LAN; R2 behind R1. */
function lab(): Topology {
  let t = buildTopology('mgmt', '', [
    { key: 'r1', kind: 'router', name: 'R1', x: 0, y: 0 },
    { key: 'r2', kind: 'router', name: 'R2', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
    { key: 'pc', kind: 'pc', name: 'PC1', x: 0, y: 0 },
    { key: 'dns', kind: 'dns-dhcp', name: 'DNS1', x: 0, y: 0 },
    { key: 'nms', kind: 'nms', name: 'NMS1', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r1', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['pc', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['dns', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['nms', 'eth0'] },
    { kind: 'cat6', a: ['r1', 'Gi0/1'], b: ['r2', 'Gi0/0'] },
  ]);
  t = host(t, 'PC1', '10.1.1.10', '10.1.1.1');
  t = host(t, 'DNS1', '10.1.1.53', '10.1.1.1');
  t = host(t, 'NMS1', '10.1.1.100', '10.1.1.1');
  t = configure(t, 'PC1', (c) => (c.mgmt.nameServers = ['10.1.1.53']));
  t = configure(t, 'DNS1', (c) => (c.mgmt.hosts = { 'uts-server': '10.2.2.2', pc1: '10.1.1.10' }));
  t = cli(t, 'R1', ['enable', 'conf t', 'int gi0/0', 'ip address 10.1.1.1 255.255.255.0', 'no shut', 'int gi0/1', 'ip address 10.2.2.1 255.255.255.0', 'no shut', 'end']).topology;
  t = cli(t, 'R2', ['enable', 'conf t', 'int gi0/0', 'ip address 10.2.2.2 255.255.255.0', 'no shut', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.2.2.1', 'end']).topology;
  return t;
}

function cli(t: Topology, dev: string, lines: string[], sim = new Sim(t)) {
  let session = newSession(t.devices.find((d) => d.name === dev)!.id);
  let topo = t;
  const out: string[] = [];
  for (const l of lines) {
    const r = execIos(l, session, { topology: topo, sim, simulationMode: false });
    out.push(r.output);
    session = r.session;
    if (r.topology) topo = r.topology;
  }
  return { topology: topo, out, sim };
}

const pc = (t: Topology, line: string, name = 'PC1', sim = new Sim(t)) => {
  sim.runUntilIdle();
  return execHost(line, t.devices.find((d) => d.name === name)!, { sim, simulationMode: false });
};

describe('DNS', () => {
  it('a PC resolves names through the DNS server (UDP 53), and pings by name', () => {
    const t = lab();
    expect(pc(t, 'nslookup uts-server')).toMatch(/Name:\s+uts-server\nAddress:\s+10\.2\.2\.2/);
    expect(pc(t, 'nslookup nothere')).toContain("can't find nothere");
    expect(pc(t, 'ping uts-server')).toMatch(/Reply from 10\.2\.2\.2/);
  });

  it('routers: ip name-server, ip host and no ip domain-lookup', () => {
    let t = lab();
    t = cli(t, 'R2', ['enable', 'conf t', 'ip name-server 10.1.1.53', 'end']).topology;
    expect(cli(t, 'R2', ['enable', 'ping pc1']).out[1]).toMatch(/Success rate is \d+ percent/);
    expect(cli(t, 'R2', ['enable', 'ping pc1']).out[1]).toContain('Translating "pc1"');
    t = cli(t, 'R2', ['enable', 'conf t', 'no ip domain-lookup', 'ip host junction 10.2.2.1', 'end']).topology;
    expect(cli(t, 'R2', ['enable', 'ping pc1']).out[1]).toContain('DNS lookup is disabled');
    expect(cli(t, 'R2', ['enable', 'ping junction']).out[1]).toMatch(/!!!/);
    expect(cli(t, 'R2', ['enable', 'show hosts']).out[1]).toMatch(/junction\s+10\.2\.2\.1/);
  });
});

describe('NTP', () => {
  it('stratum grows by one per hop; no server answer = unsynchronized', () => {
    let t = lab();
    t = cli(t, 'R1', ['enable', 'conf t', 'ntp server 10.1.1.53', 'end']).topology;
    t = cli(t, 'R2', ['enable', 'conf t', 'ntp server 10.2.2.1', 'end']).topology;
    const sim = new Sim(t);
    expect(cli(t, 'R1', ['enable', 'show ntp status'], sim).out[1]).toContain('synchronized, stratum 3, reference is 10.1.1.53');
    expect(cli(t, 'R2', ['enable', 'show ntp status'], sim).out[1]).toContain('synchronized, stratum 4, reference is 10.2.2.1');
    // R2 pointing at a router that has no clock.
    const t2 = cli(lab(), 'R2', ['enable', 'conf t', 'ntp server 10.2.2.1', 'end']).topology;
    expect(cli(t2, 'R2', ['enable', 'show ntp status']).out[1]).toContain('unsynchronized');
    const t3 = cli(t2, 'R1', ['enable', 'conf t', 'ntp master 3', 'end']).topology;
    expect(cli(t3, 'R2', ['enable', 'show ntp status']).out[1]).toContain('stratum 4');
  });
});

describe('Syslog and SNMP traps', () => {
  it('link changes are logged locally and sent to the NMS', () => {
    let t = lab();
    t = cli(t, 'R1', ['enable', 'conf t', 'logging host 10.1.1.100', 'snmp-server community nwr-ro RO', 'snmp-server host 10.1.1.100 version 2c nwr-ro', 'snmp-server enable traps', 'end']).topology;
    const sim = new Sim(t);
    sim.runUntilIdle();
    const r = cli(t, 'R1', ['enable', 'conf t', 'int gi0/1', 'shutdown', 'end', 'show logging'], sim);
    sim.runUntilIdle();
    expect(r.out[5]).toContain('%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down');
    const inbox = sim.nmsInbox(sim.deviceByName('NMS1')!.id);
    expect(inbox.some((i) => i.kind === 'syslog' && i.text.includes('changed state to down'))).toBe(true);
    expect(inbox.some((i) => i.kind === 'trap' && i.community === 'nwr-ro' && i.text.includes('linkDown'))).toBe(true);
    // Running-config shows the setup.
    expect(cli(r.topology, 'R1', ['enable', 'show running-config']).out[1]).toContain('snmp-server host 10.1.1.100 version 2c nwr-ro');
  });

  it('a non-NMS host ignores syslog', () => {
    let t = lab();
    t = cli(t, 'R1', ['enable', 'conf t', 'logging host 10.1.1.10', 'end']).topology;
    const sim = new Sim(t);
    cli(t, 'R1', ['enable', 'conf t', 'int gi0/1', 'shutdown', 'end'], sim);
    sim.runUntilIdle();
    expect(sim.nmsInbox(sim.deviceByName('PC1')!.id)).toEqual([]);
  });
});

describe('SSH / Telnet', () => {
  const secure = ['enable', 'conf t', 'ip domain-name nwr.rly', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username admin privilege 15 secret Rly@123', 'line vty 0 4', 'login local', 'transport input ssh', 'end'];

  it('default vty: telnet opens but no password is set', () => {
    expect(pc(lab(), 'telnet 10.1.1.1')).toContain('Password required, but none set');
  });

  it('SSH needs domain name + RSA keys; with login local the right user gets in', () => {
    expect(pc(lab(), 'ssh admin@10.1.1.1')).toContain('SSH is not enabled');
    const t = cli(lab(), 'R1', secure).topology;
    expect(pc(t, 'ssh admin@10.1.1.1')).toContain('Logged in as admin (privilege 15)');
    expect(pc(t, 'ssh guest@10.1.1.1')).toContain('Login invalid');
    expect(pc(t, 'telnet 10.1.1.1')).toContain('transport input ssh');
    expect(cli(t, 'R1', ['enable', 'show ip ssh']).out[1]).toContain('SSH Enabled - version 2.0');
    expect(cli(lab(), 'R1', ['enable', 'conf t', 'crypto key generate rsa']).out[2]).toContain('define a domain-name first');
  });

  it('access-class limits who may connect; an interface ACL can block the port', () => {
    let t = cli(lab(), 'R1', [...secure.slice(0, -1), 'access-class 10 in', 'exit', 'access-list 10 permit 10.9.9.0 0.0.0.255', 'end']).topology;
    expect(pc(t, 'ssh admin@10.1.1.1')).toContain('access-class 10 denies 10.1.1.10');
    t = cli(t, 'R1', ['enable', 'conf t', 'no access-list 10', 'access-list 10 permit 10.1.1.0 0.0.0.255', 'end']).topology;
    expect(pc(t, 'ssh admin@10.1.1.1')).toContain('Logged in as admin');
    // Extended ACL inbound on R2's link blocks SSH to R2 from PC1.
    let t2 = cli(lab(), 'R2', [...secure, 'conf t', 'access-list 110 deny tcp any any eq 22', 'access-list 110 permit ip any any', 'int gi0/0', 'ip access-group 110 in', 'end']).topology;
    expect(pc(t2, 'ssh admin@10.2.2.2')).toMatch(/timed out|refused|unreachable/i);
    t2 = cli(t2, 'R2', ['enable', 'conf t', 'int gi0/0', 'no ip access-group 110 in', 'end']).topology;
    expect(pc(t2, 'ssh admin@10.2.2.2')).toContain('Logged in as admin');
  });

  it('the packet inspector shows Telnet in cleartext and SSH encrypted', () => {
    const t = cli(lab(), 'R1', ['enable', 'conf t', 'ip domain-name nwr.rly', 'crypto key generate rsa modulus 1024', 'username admin secret x', 'line vty 0 4', 'login local', 'end']).topology;
    const sim = new Sim(t);
    pc(t, 'telnet 10.1.1.1', 'PC1', sim);
    pc(t, 'ssh admin@10.1.1.1', 'PC1', sim);
    const payloads = [...sim.flows.values()].flatMap((f) => f.steps.map((s) => s.frame?.ip?.icmp ?? '')).filter((x) => x.startsWith('TCP'));
    expect(payloads.some((p) => p.includes('cleartext'))).toBe(true);
    expect(payloads.some((p) => p.includes('encrypted'))).toBe(true);
  });
});
