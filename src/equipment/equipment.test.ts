import { describe, expect, it } from 'vitest';
import { execHost } from '../engine/cli/host';
import { execIos, newSession } from '../engine/cli/ios';
import { Sim } from '../engine/sim';
import { visibleDeviceTemplates } from '../model/networkingMode';
import { addDevice, emptyTopology } from '../model/topologyOps';
import type { DeviceKind, Topology } from '../model/types';
import { FAMILY_DOCS } from './families';
import { capabilities, configGuide, familyOf, verifyGuide } from './guide';
import { KIND_DOCS, kindDoc } from './kinds';

function single(kind: DeviceKind): Topology {
  return addDevice(emptyTopology('eq'), kind, { x: 0, y: 0 }).topology;
}

const words = (s: string) => s.trim().split(/\s+/).length;

describe('equipment docs', () => {
  it('every visible palette device has a doc, and docs are unique', () => {
    for (const t of visibleDeviceTemplates()) expect(kindDoc(t.kind), t.kind).toBeDefined();
    expect(new Set(KIND_DOCS.map((d) => d.kind)).size).toBe(KIND_DOCS.length);
  });

  it('one-liners fit a tooltip (≤ 20 words) and every text is bilingual', () => {
    for (const d of KIND_DOCS) {
      for (const b of [d.oneLiner, d.overview, d.railwayUse]) {
        expect(b.en.length, d.kind).toBeGreaterThan(5);
        expect(b.hi.length, d.kind).toBeGreaterThan(5);
      }
      expect(words(d.oneLiner.en), d.kind).toBeLessThanOrEqual(20);
    }
    for (const f of Object.values(FAMILY_DOCS))
      for (const b of [...f.forwarding, ...f.maintenance, ...f.safety]) expect(b.hi.length).toBeGreaterThan(5);
  });

  for (const t of visibleDeviceTemplates()) {
    it(`${t.kind}: every guide command is accepted by the simulator CLI`, () => {
      const topo = single(t.kind);
      const dev = topo.devices[0];
      const sim = new Sim(topo);
      let session = newSession(dev.id);
      let cur = topo;
      for (const step of [...configGuide(dev), ...verifyGuide(dev)]) {
        for (const line of step.cli ?? []) {
          if (step.where === 'host') {
            const out = execHost(line, cur.devices[0], { sim, simulationMode: false });
            expect(out, `${t.kind}: ${line}`).not.toMatch(/not recognized|^%/m);
          } else {
            const r = execIos(line, session, { topology: cur, sim, simulationMode: false });
            expect(r.output, `${t.kind}: ${line}`).not.toMatch(/^% (Invalid|Incomplete|Ambiguous|Unknown)/m);
            session = r.session;
            if (r.topology) cur = r.topology;
          }
        }
      }
      expect(capabilities(dev).length).toBeGreaterThan(0);
      expect(familyOf(dev)).toBe(kindDoc(t.kind)!.family);
    });
  }
});
