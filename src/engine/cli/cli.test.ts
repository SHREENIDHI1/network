import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { getNetConfig } from '../config/netConfig';
import { Sim } from '../sim';
import { host } from '../testing/fixtures';
import { execHost } from './host';
import { completeIos, execIos, helpIos, newSession, prompt, type CliSession } from './ios';

/** Runs CLI lines on a device, threading session + topology like the UI does. */
function cli(topo: Topology, sim: Sim, deviceName: string, lines: string[], start?: CliSession) {
  const dev = topo.devices.find((d) => d.name === deviceName)!;
  let session = start ?? newSession(dev.id);
  let t = topo;
  const outputs: string[] = [];
  for (const l of lines) {
    const r = execIos(l, session, { topology: t, sim, simulationMode: false });
    outputs.push(r.output);
    session = r.session;
    if (r.topology) t = r.topology;
  }
  return { topology: t, session, outputs, last: outputs[outputs.length - 1] };
}

function base(): Topology {
  return buildTopology('cli', '', [
    { key: 'r', kind: 'router', name: 'R1', x: 0, y: 0 },
    { key: 'sw', kind: 'l2-switch', name: 'SW1', x: 0, y: 0 },
    { key: 'a', kind: 'uts-prs', name: 'UTS', x: 0, y: 0 },
    { key: 'b', kind: 'fois', name: 'FOIS', x: 0, y: 0 },
  ], [
    { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
    { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['a', 'eth0'] },
    { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['b', 'eth0'] },
  ]);
}

describe('IOS CLI', () => {
  it('modes, prompts and abbreviations', () => {
    const t = base();
    const sim = new Sim(t);
    const r = cli(t, sim, 'R1', ['en', 'conf t', 'int g0/0']);
    expect(prompt(r.session, r.topology)).toBe('R1(config-if)#');
    const back = cli(r.topology, sim, 'R1', ['end'], r.session);
    expect(prompt(back.session, back.topology)).toBe('R1#');
  });

  it('shows the ^ marker for invalid input and reports incomplete / ambiguous commands', () => {
    const t = base();
    const sim = new Sim(t);
    const r = cli(t, sim, 'R1', ['enable', 'configure terminal', 'ip adress 1.1.1.1']);
    expect(r.last).toMatch(/\^\n% Invalid input detected at '\^' marker\./);
    // caret sits under the bad word: prompt "R1(config)#" (11 chars) + "ip " (3)
    expect(r.last.split('\n')[0].indexOf('^')).toBe(14);
    expect(cli(t, sim, 'R1', ['enable', 'conf']).last).toBe('% Incomplete command.');
    expect(cli(t, sim, 'R1', ['e']).last).toMatch(/Ambiguous/);
  });

  it('builds router-on-a-stick entirely from the CLI and pings with .!!!!', () => {
    let t = base();
    const sim = new Sim(t);
    t = cli(t, sim, 'SW1', [
      'enable', 'configure terminal',
      'vlan 10', 'name UTS', 'vlan 20', 'name FOIS', 'exit',
      'interface gigabitEthernet 0/1', 'switchport mode access', 'switchport access vlan 10',
      'int gi0/2', 'sw mode acc', 'sw acc vl 20',
      'int g0/24', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end',
    ]).topology;
    t = cli(t, sim, 'R1', [
      'enable', 'conf t',
      'interface g0/0', 'no shutdown',
      'interface g0/0.10', 'encapsulation dot1Q 10', 'ip address 10.0.10.1 255.255.255.0',
      'interface g0/0.20', 'encapsulation dot1Q 20', 'ip address 10.0.20.1 255.255.255.0', 'end',
    ]).topology;
    t = host(t, 'UTS', '10.0.10.10', '10.0.10.1');
    t = host(t, 'FOIS', '10.0.20.10', '10.0.20.1');
    sim.setTopology(t);

    const vlan = cli(t, sim, 'SW1', ['en', 'show vlan brief']).last;
    expect(vlan).toMatch(/10\s+UTS\s+active\s+Gi0\/1/);
    expect(cli(t, sim, 'SW1', ['en', 'sh int trunk']).last).toMatch(/Gi0\/24\s+10,20/);

    const brief = cli(t, sim, 'R1', ['en', 'sh ip int br']).last;
    expect(brief).toMatch(/GigabitEthernet0\/0\.10\s+10\.0\.10\.1\s+YES manual up\s+up/);

    const ping = cli(t, sim, 'R1', ['en', 'ping 10.0.20.10']).last;
    expect(ping).toMatch(/\.!!!!/);
    expect(ping).toMatch(/Success rate is 80 percent \(4\/5\)/);

    const route = cli(t, sim, 'R1', ['en', 'show ip route']).last;
    expect(route).toMatch(/C\s+10\.0\.10\.0\/24 is directly connected, GigabitEthernet0\/0\.10/);
    expect(route).toMatch(/L\s+10\.0\.20\.1\/32 is directly connected/);

    const mac = cli(t, sim, 'SW1', ['en', 'show mac address-table']).last;
    expect(mac).toMatch(/Total Mac Addresses for this criterion: 2/);

    const run = cli(t, sim, 'R1', ['en', 'show running-config']).last;
    expect(run).toMatch(/interface GigabitEthernet0\/0\.20\n encapsulation dot1Q 20\n ip address 10\.0\.20\.1 255\.255\.255\.0/);
    expect(run).not.toMatch(/interface GigabitEthernet0\/0\n no ip address\n shutdown/);
  });

  it('rejects L3 config on L2 links, overlapping subnets and bad masks', () => {
    const t = base();
    const sim = new Sim(t);
    expect(cli(t, sim, 'SW1', ['en', 'conf t', 'int g0/1', 'ip address 10.1.1.1 255.255.255.0']).last).toBe('% IP addresses may not be configured on L2 links.');
    const r = cli(t, sim, 'R1', ['en', 'conf t', 'int g0/0', 'ip address 10.1.1.1 255.255.255.0', 'int g0/1', 'ip address 10.1.1.5 255.255.255.128']);
    expect(r.last).toBe('% 10.1.1.0 overlaps with GigabitEthernet0/0');
    expect(cli(t, sim, 'R1', ['en', 'conf t', 'int g0/0', 'ip address 10.1.1.0 255.255.255.0']).last).toMatch(/Bad mask/);
    expect(cli(t, sim, 'R1', ['en', 'conf t', 'int g0/0', 'switchport mode trunk']).last).toMatch(/Invalid input/);
  });

  it('static routes, hostname, write memory and startup-config', () => {
    const t = base();
    const sim = new Sim(t);
    const r = cli(t, sim, 'R1', ['en', 'conf t', 'hostname MTD-R1', 'ip route 0.0.0.0 0.0.0.0 10.0.0.2', 'end', 'write memory']);
    const dev = r.topology.devices.find((d) => d.name === 'MTD-R1')!;
    expect(dev).toBeDefined();
    const cfg = getNetConfig(dev);
    expect(cfg.staticRoutes).toEqual([{ prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.2', exitInterface: undefined, distance: undefined }]);
    expect(cfg.startup?.staticRoutes).toHaveLength(1);
    expect(r.last).toMatch(/\[OK\]/);
    expect(cli(r.topology, sim, 'MTD-R1', ['en', 'conf t', 'no ip route 0.0.0.0 0.0.0.0 10.0.0.2']).topology.devices.find((d) => d.name === 'MTD-R1')!.config).toMatchObject({ net: { staticRoutes: [] } });
  });

  it('spanning-tree priority must be a multiple of 4096', () => {
    const t = base();
    const sim = new Sim(t);
    expect(cli(t, sim, 'SW1', ['en', 'conf t', 'spanning-tree vlan 1 priority 1000']).last).toMatch(/increments of 4096/);
    const ok = cli(t, sim, 'SW1', ['en', 'conf t', 'spanning-tree vlan 1 priority 4096']);
    expect(getNetConfig(ok.topology.devices.find((d) => d.name === 'SW1')!).stpPriority).toBe(4096);
  });

  it('? help and Tab completion', () => {
    const t = base();
    const sim = new Sim(t);
    const s = cli(t, sim, 'R1', ['en']).session;
    expect(helpIos('show ip ', s, t)).toMatch(/interface\s+IP interface status/);
    expect(helpIos('sh', s, t)).toMatch(/show/);
    expect(helpIos('ping ', s, t)).toMatch(/A\.B\.C\.D/);
    expect(completeIos('conf', s, t)).toBe('configure ');
    expect(completeIos('show ip ro', s, t)).toBe('show ip route ');
  });

  it('"do" runs exec commands from config mode', () => {
    const t = base();
    const sim = new Sim(t);
    expect(cli(t, sim, 'R1', ['en', 'conf t', 'do show ip interface brief']).last).toMatch(/Interface\s+IP-Address/);
  });
});

describe('host command prompt', () => {
  it('ipconfig, ping and arp -a', () => {
    let t = buildTopology('h', '', [
      { key: 'sw', kind: 'l2-switch', name: 'SW', x: 0, y: 0 },
      { key: 'a', kind: 'pc', name: 'A', x: 0, y: 0 },
      { key: 'b', kind: 'pc', name: 'B', x: 0, y: 0 },
    ], [
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['a', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['b', 'eth0'] },
    ]);
    t = host(t, 'A', '192.168.10.1', '192.168.10.254');
    t = host(t, 'B', '192.168.10.2');
    const sim = new Sim(t);
    const a = t.devices.find((d) => d.name === 'A')!;
    expect(execHost('ipconfig', a, { sim, simulationMode: false })).toMatch(/IPv4 Address[ .]+: 192\.168\.10\.1[\s\S]*Default Gateway[ .]+: 192\.168\.10\.254/);
    const p = execHost('ping 192.168.10.2', a, { sim, simulationMode: false });
    expect(p).toMatch(/Reply from 192\.168\.10\.2: bytes=32 time<1ms TTL=128/);
    expect(p).toMatch(/Sent = 4, Received = 4, Lost = 0 \(0% loss\)/);
    expect(execHost('arp -a', a, { sim, simulationMode: false })).toMatch(/192\.168\.10\.2\s+02-/);
    expect(execHost('foo', a, { sim, simulationMode: false })).toMatch(/not recognized/);
  });
});
