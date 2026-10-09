import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { getNetConfig } from '../config/netConfig';
import { Sim } from '../sim';
import { configure, host, setIf } from '../testing/fixtures';
import { execHost } from './host';
import { execIos, newSession, type CliSession } from './ios';

function cli(topo: Topology, sim: Sim, name: string, lines: string[], start?: CliSession) {
  const dev = topo.devices.find((d) => d.name === name)!;
  let session = start ?? newSession(dev.id);
  let t = topo;
  const outs: string[] = [];
  for (const l of lines) {
    const r = execIos(l, session, { topology: t, sim, simulationMode: false });
    outs.push(r.output);
    session = r.session;
    if (r.topology) t = r.topology;
  }
  return { topology: t, last: outs[outs.length - 1], outs };
}

function twoRouters(): Topology {
  let t = buildTopology('p3', '', [
    { key: 'a', kind: 'router', name: 'JU-R', x: 0, y: 0 },
    { key: 'b', kind: 'router', name: 'MTD-R', x: 0, y: 0 },
    { key: 'pa', kind: 'pc', name: 'JU-PC', x: 0, y: 0 },
    { key: 'pb', kind: 'uts-prs', name: 'MTD-UTS', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['a', 'Gi0/1'], b: ['b', 'Gi0/1'] },
    { kind: 'cat6', a: ['a', 'Gi0/0'], b: ['pa', 'eth0'] },
    { kind: 'cat6', a: ['b', 'Gi0/0'], b: ['pb', 'eth0'] },
  ]);
  t = host(t, 'JU-PC', '10.1.0.10', '10.1.0.1');
  return t;
}

describe('Phase 3 CLI', () => {
  it('OSPF from the CLI: neighbours FULL, O routes, router ospf in running-config', () => {
    let t = twoRouters();
    const sim = new Sim(t);
    t = cli(t, sim, 'JU-R', ['en', 'conf t', 'int g0/0', 'ip add 10.1.0.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.0.1 255.255.255.252', 'no shut', 'router ospf 1', 'router-id 1.1.1.1', 'network 10.0.0.0 0.255.255.255 area 0', 'passive-interface g0/0', 'end']).topology;
    t = cli(t, sim, 'MTD-R', ['en', 'conf t', 'int g0/0', 'ip add 10.2.0.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.0.2 255.255.255.252', 'no shut', 'router ospf 1', 'network 10.2.0.0 0.0.0.255 area 0', 'network 10.0.0.0 0.0.0.3 area 0', 'end']).topology;
    const nbr = cli(t, sim, 'JU-R', ['en', 'show ip ospf neighbor']).last;
    expect(nbr).toMatch(/10\.2\.0\.1\s+1\s+FULL\/(DR|BDR)/);
    expect(cli(t, sim, 'JU-R', ['en', 'show ip route']).last).toMatch(/O\s+10\.2\.0\.0\/24 \[110\/2\] via 10\.0\.0\.2, GigabitEthernet0\/1/);
    const run = cli(t, sim, 'JU-R', ['en', 'show run']).last;
    expect(run).toMatch(/router ospf 1\n router-id 1\.1\.1\.1\n passive-interface GigabitEthernet0\/0\n network 10\.0\.0\.0 0\.255\.255\.255 area 0/);
    expect(cli(t, sim, 'JU-R', ['en', 'show ip ospf interface brief']).last).toMatch(/Gi0\/1\s+1\s+0\s+10\.0\.0\.1\/30\s+1/);
    expect(cli(t, sim, 'JU-R', ['en', 'show ip protocols']).last).toMatch(/Router ID 1\.1\.1\.1/);
    // Hello mismatch shows up in the log.
    t = cli(t, sim, 'MTD-R', ['en', 'conf t', 'int g0/1', 'ip ospf hello-interval 5', 'end']).topology;
    expect(cli(t, sim, 'MTD-R', ['en', 'show logging']).last).toMatch(/hello\/dead mismatch/);
  });

  it('ACL, NAT, DHCP, HSRP and QoS commands configure the engine', () => {
    let t = twoRouters();
    const sim = new Sim(t);
    t = cli(t, sim, 'JU-R', [
      'en', 'conf t',
      'ip dhcp excluded-address 10.1.0.1 10.1.0.9',
      'ip dhcp pool LAN', 'network 10.1.0.0 255.255.255.0', 'default-router 10.1.0.1', 'dns-server 10.99.0.10', 'exit',
      'access-list 1 permit 10.1.0.0 0.0.0.255',
      'ip access-list extended NO-UTS', 'deny icmp 10.1.0.0 0.0.0.255 10.2.0.0 0.0.0.255 echo', 'permit ip any any', 'exit',
      'int g0/0', 'ip add 10.1.0.1 255.255.255.0', 'no shut', 'ip nat inside', 'ip access-group NO-UTS in',
      'standby 1 ip 10.1.0.254', 'standby 1 priority 110', 'standby 1 preempt',
      'int g0/1', 'ip add 10.0.0.1 255.255.255.252', 'no shut', 'ip nat outside', 'speed 10',
      'exit',
      'ip nat inside source list 1 interface g0/1 overload',
      'class-map match-any VOICE', 'match dscp ef', 'exit',
      'policy-map WAN', 'class VOICE', 'priority percent 20', 'exit', 'class class-default', 'exit', 'exit',
      'int g0/1', 'service-policy output WAN', 'end',
    ]).topology;
    const cfg = getNetConfig(t.devices.find((d) => d.name === 'JU-R')!);
    expect(cfg.dhcp.pools.LAN).toMatchObject({ network: '10.1.0.0', defaultRouter: '10.1.0.1' });
    expect(cfg.acls['NO-UTS'].entries).toHaveLength(2);
    expect(cfg.nat.overload).toEqual([{ acl: '1', iface: 'Gi0/1' }]);
    expect(cfg.interfaces['Gi0/0'].fhrp![0]).toMatchObject({ protocol: 'hsrp', group: 1, ip: '10.1.0.254', priority: 110, preempt: true });
    expect(cfg.interfaces['Gi0/1']).toMatchObject({ speedMbps: 10, servicePolicyOut: 'WAN', natRole: 'outside' });
    expect(cfg.qos.policyMaps.WAN.classes[0]).toMatchObject({ name: 'VOICE', priorityPercent: 20 });

    // DHCP client host gets an address from the CLI-configured pool.
    t = configure(t, 'JU-PC', (c) => {
      delete c.interfaces.eth0.ip;
      delete c.defaultGateway;
      setIf(c, 'eth0', { dhcpClient: true });
    });
    sim.setTopology(t);
    sim.runUntilIdle();
    const pc = t.devices.find((d) => d.name === 'JU-PC')!;
    expect(execHost('ipconfig /all', pc, { sim, simulationMode: false })).toMatch(/DHCP Enabled[ .]+: Yes[\s\S]*IPv4 Address[ .]+: 10\.1\.0\.10/);
    expect(cli(t, sim, 'JU-R', ['en', 'show ip dhcp binding']).last).toMatch(/10\.1\.0\.10/);

    expect(cli(t, sim, 'JU-R', ['en', 'show standby brief']).last).toMatch(/Gi0\/0\s+1\s+110 P\s+Active\s+local\s+unknown\s+10\.1\.0\.254/);
    expect(cli(t, sim, 'JU-R', ['en', 'show access-lists']).last).toMatch(/Extended IP access list NO-UTS\n\s+10 deny icmp 10\.1\.0\.0 0\.0\.0\.255 10\.2\.0\.0 0\.0\.0\.255 echo/);
    const run = cli(t, sim, 'JU-R', ['en', 'show running-config']).last;
    for (const line of ['ip dhcp pool LAN', ' standby 1 ip 10.1.0.254', 'ip nat inside source list 1 interface GigabitEthernet0/1 overload', 'access-list 1 permit 10.1.0.0 0.0.0.255', 'policy-map WAN', '  priority percent 20', ' service-policy output WAN', ' speed 10'])
      expect(run).toContain(line);
    expect(cli(t, sim, 'JU-R', ['en', 'show policy-map interface g0/1']).last).toMatch(/Service-policy output: WAN/);
  });

  it('rejects bad input in Phase 3 modes', () => {
    const t = twoRouters();
    const sim = new Sim(t);
    expect(cli(t, sim, 'JU-R', ['en', 'conf t', 'access-list 1 permit host']).last).toMatch(/Invalid host address/);
    expect(cli(t, sim, 'JU-R', ['en', 'conf t', 'policy-map P', 'class NOPE']).last).toMatch(/class-map NOPE not configured/);
    expect(cli(t, sim, 'JU-R', ['en', 'conf t', 'router ospf 1', 'exit', 'router ospf 2']).last).toMatch(/one OSPF process/);
  });
});
