import { it } from 'vitest';
import * as T from './mplsLabs';
import { Sim } from '../engine/sim';
import { ipPlan } from './jodhpur/plan';
it('p', () => {
  const p = ipPlan();
  console.log('loops', ['BNO', 'DNA', 'BME', 'FL', 'MTD', 'KQW', 'JU', 'GOTN', 'JOM'].map((c) => `${c}=${p.loopbacks.get(c)}`).join(' '));
  for (const [n, f] of Object.entries(T)) {
    if (n === 'loopbackOf') continue;
    const t = (f as () => any)();
    const sim = new Sim(t);
    sim.runUntilIdle();
    console.log(
      n,
      t.devices.map((d: any) => d.name).join(','),
      'ldp down:',
      sim.ldp.sessions.filter((s) => s.state !== 'OPERATIONAL').map((s) => sim.device(s.a)!.name + '-' + sim.device(s.b)!.name + ' ' + s.reason),
      'discoveries',
      sim.ldp.discoveries.length,
    );
    for (const d of t.devices)
      if (['BNO-LER', 'JU-LSR', 'PPR-LSR', 'MTD-LSR', 'SMR-LSR', 'GOTN-LER'].includes(d.name))
        console.log(
          '  ',
          d.name,
          t.links
            .filter((l: any) => l.a.deviceId === d.id || l.b.deviceId === d.id)
            .map((l: any) => {
              const me = l.a.deviceId === d.id ? l.a : l.b;
              const o = l.a.deviceId === d.id ? l.b : l.a;
              return `${me.portId}->${t.devices.find((x: any) => x.id === o.deviceId).name}`;
            })
            .join(' '),
        );
  }
});
