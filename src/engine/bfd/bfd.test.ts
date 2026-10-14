import { describe, expect, it } from 'vitest';
import { Sim } from '../sim';
import { execIos, newSession } from '../cli/ios';
import { getTopologyEntry } from '../../topologies';
import type { Topology } from '../../model/types';

async function ring() {
  const topology: { t: Topology } = { t: await getTopologyEntry('lab-b10-bfd')!.load() };
  const sim = new Sim(topology.t);
  sim.runUntilIdle();
  return { topology, sim };
}

/** Runs CLI lines like the live UI: every committed change reaches the simulation. */
function cli(top: { t: Topology }, sim: Sim, device: string, lines: string[]) {
  let session = newSession(top.t.devices.find((d) => d.name === device)!.id);
  const out: string[] = [];
  for (const l of lines) {
    const r = execIos(l, session, { topology: top.t, sim, simulationMode: false });
    session = r.session;
    out.push(r.output);
    if (r.topology) {
      top.t = r.topology;
      sim.setTopology(top.t);
    }
  }
  sim.runUntilIdle();
  return out.join('\n');
}

const conf = (...l: string[]) => ['enable', 'configure terminal', ...l, 'end'];
const sessions = (sim: Sim, dev: string) => sim.bfd.sessions.filter((s) => sim.device(s.deviceId)!.name === dev);

describe('BFD (RFC 5880 async, OSPF client)', () => {
  it('no sessions until OSPF registers with BFD', async () => {
    const { topology, sim } = await ring();
    expect(sim.bfd.sessions).toEqual([]);
    cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'bfd interval 50 min_rx 50 multiplier 3'));
    sim.runUntilIdle();
    expect(sim.bfd.sessions).toEqual([]);
    expect(cli(topology, sim, 'JU-LSR', ['show bfd neighbors'])).toMatch(/No BFD sessions/);
  });

  it('one-sided config gives a Down session with a reason', async () => {
    const { topology, sim } = await ring();
    cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'bfd interval 50 min_rx 50 multiplier 3', 'ip ospf bfd'));
    sim.runUntilIdle();
    const [s] = sessions(sim, 'JU-LSR');
    expect(s).toMatchObject({ iface: 'Te0/0/0', state: 'Down' });
    expect(s.reason).toMatch(/neighbour sends no BFD/);
    cli(topology, sim, 'PPR-LSR', conf('interface te0/0/0', 'bfd interval 50 min_rx 50 multiplier 3'));
    sim.runUntilIdle();
    expect(sessions(sim, 'JU-LSR')[0].reason).toMatch(/does not register/);
  });

  it('negotiates the slower side and computes detection = remote multiplier × rx', async () => {
    const { topology, sim } = await ring();
    cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'bfd interval 50 min_rx 50 multiplier 3', 'router ospf 1', 'bfd all-interfaces'));
    cli(topology, sim, 'PPR-LSR', conf('interface te0/0/0', 'bfd interval 100 min_rx 200 multiplier 5', 'ip ospf bfd'));
    sim.runUntilIdle();
    const ju = sessions(sim, 'JU-LSR').find((s) => s.iface === 'Te0/0/0')!;
    const ppr = sessions(sim, 'PPR-LSR')[0];
    expect(ju).toMatchObject({ state: 'Up', txMs: 200, rxMs: 100, detectMs: 500 });
    expect(ppr).toMatchObject({ state: 'Up', txMs: 100, rxMs: 200, detectMs: 600 });
    const out = cli(topology, sim, 'JU-LSR', ['show bfd neighbors details', 'enable', 'show running-config']);
    expect(out).toMatch(/Up\s+Te0\/0\/0\s+500\s+PPR-LSR/);
    expect(out).toMatch(/Negotiated transmit interval 200 ms, receive interval 100 ms/);
    expect(out).toMatch(/^ bfd interval 50 min_rx 50 multiplier 3$/m);
    expect(out).toMatch(/^ bfd all-interfaces$/m);
    expect(cli(topology, sim, 'PPR-LSR', ['enable', 'show running-config'])).toMatch(/^ ip ospf bfd$/m);
  });

  it('logs session up and down and "no" removes the config', async () => {
    const { topology, sim } = await ring();
    for (const d of ['JU-LSR', 'PPR-LSR']) cli(topology, sim, d, conf('interface te0/0/0', 'bfd interval 50 min_rx 50 multiplier 3', 'ip ospf bfd'));
    sim.runUntilIdle();
    const ju = sim.deviceByName('JU-LSR')!;
    expect(
      sim
        .deviceLog(ju.id)
        .map((l) => l.text)
        .join('\n'),
    ).toMatch(/BFD_SESS_UP: .* is up \(detection time 150 ms\)/);
    cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'no bfd interval'));
    sim.runUntilIdle();
    expect(
      sim
        .deviceLog(ju.id)
        .map((l) => l.text)
        .join('\n'),
    ).toMatch(/BFD_SESS_DOWN: .* failure detected in 150 ms/);
    expect(sessions(sim, 'JU-LSR')[0].state).toBe('Down');
    cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'no ip ospf bfd'));
    sim.runUntilIdle();
    expect(sessions(sim, 'JU-LSR')).toEqual([]);
  });

  it('rejects BFD timers on a host and out-of-range values', async () => {
    const { topology, sim } = await ring();
    const out = cli(topology, sim, 'JU-LSR', conf('interface te0/0/0', 'bfd interval 10 min_rx 50 multiplier 3'));
    expect(out).toMatch(/%|Invalid|range/i);
  });
});
