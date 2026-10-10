import { describe, expect, it } from 'vitest';
import { execHost } from '../engine/cli/host';
import { execIos, newSession } from '../engine/cli/ios';
import { Sim } from '../engine/sim';
import { buildTopology } from '../topologies/builder';
import { COMMANDS, preLines } from './commandReference';

describe('command reference', () => {
  it('has unique examples per device and both languages', () => {
    const keys = COMMANDS.map((c) => `${c.device}|${c.mode}|${c.example}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of COMMANDS) {
      expect(c.en.length).toBeGreaterThan(3);
      expect(c.hi.length).toBeGreaterThan(3);
    }
  });

  for (const c of COMMANDS) {
    it(`parses: [${c.device} ${c.mode}] ${c.example}`, () => {
      const t = buildTopology('ref', '', [{ key: 'd', kind: c.device, name: 'DEV', x: 0, y: 0 }], []);
      const sim = new Sim(t);
      const dev = t.devices[0];
      if (c.mode === 'host') {
        expect(execHost(c.example, dev, { sim, simulationMode: false })).not.toMatch(/is not recognized/);
        return;
      }
      let session = newSession(dev.id);
      let topo = t;
      for (const l of [...preLines(c.mode, c.device), c.example]) {
        const r = execIos(l, session, { topology: topo, sim, simulationMode: false });
        expect(r.output, `${l}`).not.toMatch(/% (Invalid input|Incomplete command|Ambiguous command)/);
        session = r.session;
        if (r.topology) topo = r.topology;
      }
    });
  }
});

describe('ask why (show explanations)', () => {
  it('matches full and abbreviated commands', async () => {
    const { explainShow } = await import('./showExplain');
    expect(explainShow('show vlan brief')?.title).toBe('show vlan brief');
    expect(explainShow('sh vl br')?.title).toBe('show vlan brief');
    expect(explainShow('do sh int trunk')?.title).toBe('show interfaces trunk');
    expect(explainShow('show interfaces gi0/1')?.title).toBe('show interfaces <port>');
    expect(explainShow('show interfaces status')?.title).toBe('show interfaces status');
    expect(explainShow('sh etherchannel summ')?.title).toBe('show etherchannel summary');
    expect(explainShow('ipconfig', true)?.title).toBe('ipconfig');
    expect(explainShow('ipconfig')).toBeUndefined();
    expect(explainShow('configure terminal')).toBeUndefined();
  });

  it('every explained IOS show command is a real command', async () => {
    const { EXPLAINED_COMMANDS } = await import('./showExplain');
    const t = buildTopology('x', '', [{ key: 'd', kind: 'l2-switch', name: 'SW', x: 0, y: 0 }], []);
    const sim = new Sim(t);
    for (const title of EXPLAINED_COMMANDS) {
      if (!title.startsWith('show')) continue;
      const cmd = title.replace('<port>', 'gi0/1');
      const r = execIos(cmd, { deviceId: t.devices[0].id, mode: 'priv' }, { topology: t, sim, simulationMode: false });
      if (/ip route|arp/.test(cmd)) continue; // router commands, covered by the reference
      expect(r.output, cmd).not.toMatch(/% (Invalid input|Incomplete command)/);
    }
  });
});
