import { describe, expect, it } from 'vitest';
import type { Topology } from '../../model/types';
import { buildTopology } from '../../topologies/builder';
import { execIos, newSession } from '../cli/ios';
import { parseIpv4 } from '../ip/ipv4';
import { Sim } from '../sim';
import { LABEL_IMPLICIT_NULL, prefixKey } from './ldp';

/** PE1 (NEON-LER) – P1 – P2 (NEON-LSR) – PE2 (NEON-LER) over OFC, /31 links, loopbacks 10.0.0.1–4. */
function chain(): Topology {
  return buildTopology(
    'mpls chain',
    '',
    [
      { key: 'pe1', kind: 'neon-ler', name: 'PE1', x: 0, y: 0 },
      { key: 'p1', kind: 'neon-lsr', name: 'P1', x: 0, y: 0 },
      { key: 'p2', kind: 'neon-lsr', name: 'P2', x: 0, y: 0 },
      { key: 'pe2', kind: 'neon-ler', name: 'PE2', x: 0, y: 0 },
    ],
    [
      { kind: 'ofc', a: ['pe1', 'Te0/0/0'], b: ['p1', 'Te0/0/0'], lengthKm: 10 },
      { kind: 'ofc', a: ['p1', 'Te0/0/1'], b: ['p2', 'Te0/0/0'], lengthKm: 12 },
      { kind: 'ofc', a: ['p2', 'Te0/0/1'], b: ['pe2', 'Te0/0/0'], lengthKm: 8 },
    ],
  );
}

const PLAN: Record<string, { lo: string; ifs: Array<[string, string]> }> = {
  PE1: { lo: '10.0.0.1', ifs: [['te0/0/0', '10.255.0.0']] },
  P1: { lo: '10.0.0.2', ifs: [['te0/0/0', '10.255.0.1'], ['te0/0/1', '10.255.0.2']] },
  P2: { lo: '10.0.0.3', ifs: [['te0/0/0', '10.255.0.3'], ['te0/0/1', '10.255.0.4']] },
  PE2: { lo: '10.0.0.4', ifs: [['te0/0/0', '10.255.0.5']] },
};

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
  id(name: string) {
    return this.topology.devices.find((d) => d.name === name)!.id;
  }
}

function build(opts: { mpls?: Partial<Record<string, string[]>>; skipLoopbackInOspf?: string; extra?: Partial<Record<string, string[]>> } = {}): Lab {
  const lab = new Lab(chain());
  for (const [dev, p] of Object.entries(PLAN)) {
    const lines = ['enable', 'configure terminal', 'interface loopback0', `ip address ${p.lo} 255.255.255.255`];
    for (const [i, a] of p.ifs) lines.push(`interface ${i}`, `ip address ${a} 255.255.255.254`, 'no shutdown', ...(opts.mpls?.[dev] ?? ['mpls ip']));
    lines.push('exit', 'router ospf 1');
    if (opts.skipLoopbackInOspf === dev) lines.push('network 10.255.0.0 0.0.255.255 area 0');
    else lines.push('network 10.0.0.0 0.255.255.255 area 0');
    lines.push(...(opts.extra?.[dev] ?? []), 'end');
    const out = lab.cli(dev, lines);
    expect(out, dev).not.toMatch(/% (Invalid|Incomplete|Bad)/);
  }
  return lab;
}

const ip = (s: string) => parseIpv4(s)!;

describe('MPLS / LDP', () => {
  it('forms LDP sessions and builds LFIB with PHP', () => {
    const lab = build();
    const { ldp } = lab.sim;
    expect(ldp.sessions.filter((s) => s.state === 'OPERATIONAL')).toHaveLength(3);
    const pe2lo = prefixKey(ip('10.0.0.4'), 32);
    // PE2 advertises implicit-null for its own loopback.
    expect(ldp.local.get(lab.id('PE2'))!.get(pe2lo)).toBe(LABEL_IMPLICIT_NULL);
    // P2 (penultimate hop) pops; P1 swaps to P2's label; PE1 pushes P1's label.
    const p2 = ldp.lfib.find((e) => e.deviceId === lab.id('P2') && e.network === ip('10.0.0.4'))!;
    expect(p2.out).toBe('pop');
    const p1 = ldp.lfib.find((e) => e.deviceId === lab.id('P1') && e.network === ip('10.0.0.4'))!;
    expect(p1.out).toBe(ldp.local.get(lab.id('P2'))!.get(pe2lo));
    const pe1 = ldp.lfib.find((e) => e.deviceId === lab.id('PE1') && e.network === ip('10.0.0.4'))!;
    expect(pe1.out).toBe(ldp.local.get(lab.id('P1'))!.get(pe2lo));
  });

  it('show commands reflect the computed state', () => {
    const lab = build();
    const nbr = lab.cli('P1', ['show mpls ldp neighbor']);
    expect(nbr).toContain('Peer LDP Ident: 10.0.0.1:0; Local LDP Ident 10.0.0.2:0');
    expect(nbr).toContain('Peer LDP Ident: 10.0.0.3:0');
    expect(nbr).toContain('State: Oper; Downstream');
    const fwd = lab.cli('P2', ['show mpls forwarding-table']);
    expect(fwd.split('\n').find((l) => l.includes('10.0.0.4/32'))).toMatch(/Pop Label\s+10\.0\.0\.4\/32/);
    const lib = lab.cli('PE1', ['show mpls ldp bindings 10.0.0.4 32']);
    expect(lib).toMatch(/local binding:\s+label: \d+/);
    expect(lib).toContain('remote binding: lsr: 10.0.0.2:0');
    expect(lab.cli('PE1', ['show mpls interfaces'])).toMatch(/TenGigabitEthernet0\/0\/0\s+Yes \(ldp\)\s+No\s+No\s+No\s+Yes/);
    expect(lab.cli('PE1', ['enable', 'show running-config'])).toContain(' mpls ip');
  });

  it('IP traffic is label switched; traceroute shows the labels', () => {
    const lab = build();
    lab.cli('PE1', ['ping 10.0.0.4']); // first ping: ARP on each hop drops a packet (IOS behaviour)
    expect(lab.cli('PE1', ['ping 10.0.0.4'])).toContain('Success rate is 100 percent (5/5)');
    const tr = lab.cli('PE1', ['traceroute 10.0.0.4']);
    const lines = tr.split('\n');
    expect(lines.find((l) => /^\s+1 10\.255\.0\.1 /.test(l))).toMatch(/\[MPLS: Label \d+ Exp 0\]/);
    expect(lines.find((l) => /^\s+2 10\.255\.0\.3 /.test(l))).toMatch(/\[MPLS: Label \d+ Exp 0\]/);
    expect(lines.find((l) => /^\s+3 /.test(l))).toContain('10.0.0.4');
    // Packet inspector: the frame between P1 and P2 is MPLS.
    const flows = [...lab.sim.flows.values()];
    expect(flows.some((f) => f.steps.some((s) => s.frame?.etherType === 'MPLS unicast (0x8847)'))).toBe(true);
  });

  it('LSP ping and LSP traceroute', () => {
    const lab = build();
    const ping = lab.cli('PE1', ['ping mpls ipv4 10.0.0.4/32']);
    expect(ping).toContain('!!!!!');
    expect(ping).toContain('Success rate is 100 percent (5/5)');
    const tr = lab.cli('PE1', ['traceroute mpls ipv4 10.0.0.4/32']);
    expect(tr).toMatch(/^ {2}0 10\.255\.0\.0 \[Labels: \d+ Exp: 0\]$/m);
    expect(tr).toMatch(/^L 1 10\.0\.0\.2 \[Labels: \d+ Exp: 0\] \d+ ms$/m);
    expect(tr).toMatch(/^L 2 10\.0\.0\.3 \[Labels: implicit-null Exp: 0\] \d+ ms$/m);
    expect(tr).toMatch(/^! 3 10\.0\.0\.4 \d+ ms$/m);
    // No label for a prefix that is not in the IGP: request not sent.
    expect(lab.cli('PE1', ['ping mpls ipv4 10.9.9.9/32'])).toContain('QQQQQ');
  });

  it('missing "mpls ip" on one side breaks the session and the LSP', () => {
    const lab = build({ mpls: { P2: [] } });
    expect(lab.sim.ldp.sessions.filter((s) => s.state === 'OPERATIONAL')).toHaveLength(1);
    expect(lab.cli('P1', ['show mpls ldp discovery'])).toMatch(/no LDP hellos from the router on this link/);
    // P1 has no label from P2 → "No Label"; the LSP ping from PE1 fails.
    const p1 = lab.sim.ldp.lfib.find((e) => e.deviceId === lab.id('P1') && e.network === ip('10.0.0.4'))!;
    expect(p1.out).toBe('none');
    const out = lab.cli('PE1', ['ping mpls ipv4 10.0.0.4/32']);
    expect(out).toContain('Success rate is 0 percent (0/5)');
  });

  it('session needs the peer LDP router-ID to be routable', () => {
    const lab = build({ skipLoopbackInOspf: 'PE2' });
    const s = lab.sim.ldp.sessions.find((x) => [x.a, x.b].includes(lab.id('PE2')))!;
    expect(s.state).toBe('NON-EXISTENT');
    expect(s.reason).toMatch(/transport address 10\.0\.0\.4 is not reachable/);
  });

  it('explicit-null and no propagate-ttl', () => {
    const lab = build({ extra: {} });
    lab.cli('PE2', ['enable', 'configure terminal', 'mpls ldp explicit-null', 'end']);
    const p2 = lab.sim.ldp.lfib.find((e) => e.deviceId === lab.id('P2') && e.network === ip('10.0.0.4'))!;
    expect(p2.out).toBe(0);
    expect(lab.cli('PE1', ['ping mpls ipv4 10.0.0.4/32'])).toContain('!!!!!');
    lab.cli('PE1', ['enable', 'configure terminal', 'no mpls ip propagate-ttl', 'end']);
    const tr = lab.cli('PE1', ['traceroute 10.0.0.4']);
    // The core is hidden: the first hop already answers from PE2.
    expect(tr.split('\n').find((l) => /^\s+1 /.test(l))).toContain('10.0.0.4');
  });

  it('LDP-IGP sync holds the OSPF cost at max until LDP is up', () => {
    const lab = build({ mpls: { P2: ['no mpls ip'] }, extra: { P1: ['mpls ldp sync'] } });
    expect(lab.sim.ldpSyncHeld.some((h) => h.deviceId === lab.id('P1') && h.iface === 'Te0/0/1')).toBe(true);
    expect(lab.cli('P1', ['show ip ospf interface te0/0/1'])).toContain('Cost: 65535');
    expect(lab.cli('P1', ['show mpls ldp igp sync'])).toContain('sync not achieved');
  });
});
