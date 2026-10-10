import { describe, expect, it } from 'vitest';
import { CURRICULUM, LESSON_LOADERS, isAvailable } from './curriculum';
import { PROGRESS_KEY, exportProgress, importProgress, loadProgress, recordQuiz, saveProgress, type StorageLike } from './progress';
import { encapStages, parseOctet, propagationMs, subtractSteps, toBin8, toHex2, transferSeconds } from './widgetMath';

describe('curriculum', () => {
  it('lists A0–A15 and B0–B15 with unique ids', () => {
    expect(CURRICULUM.filter((c) => c.part === 'A')).toHaveLength(16);
    expect(CURRICULUM.filter((c) => c.part === 'B')).toHaveLength(16);
    expect(new Set(CURRICULUM.map((c) => c.id)).size).toBe(CURRICULUM.length);
  });

  it('every loader belongs to the curriculum', () => {
    for (const id of Object.keys(LESSON_LOADERS)) expect(CURRICULUM.some((c) => c.id === id)).toBe(true);
    expect(isAvailable('A0')).toBe(true);
    expect(['A4', 'A5', 'A6', 'A7', 'A8'].every(isAvailable)).toBe(true);
    expect(isAvailable('B3')).toBe(false);
  });

  for (const id of Object.keys(LESSON_LOADERS)) {
    it(`${id} loads and is well-formed`, async () => {
      const l = await LESSON_LOADERS[id]();
      expect(l.id).toBe(id);
      expect(l.title).toBe(CURRICULUM.find((c) => c.id === id)!.title);
      expect(l.blocks.length).toBeGreaterThan(3);
      expect(l.flash).toHaveLength(5);
      for (const q of l.flash) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.explanation.length).toBeGreaterThan(5);
      }
      expect(l.glossary.length).toBeGreaterThan(0);
      expect(l.practice.note.length).toBeGreaterThan(0);
      if (l.practice.labId) {
        const { getLab } = await import('../labs/registry');
        expect(getLab(l.practice.labId)?.lessonId, `${id} practice lab`).toBe(id);
      }
      for (const b of l.blocks) if (b.kind === 'table') for (const r of b.rows) expect(r).toHaveLength(b.headers.length);
    });
  }
});

describe('progress', () => {
  const mem = (): StorageLike & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => void (data[k] = v),
    };
  };
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };

  it('records attempts, best score and completion at 4/5', () => {
    let p = loadProgress(mem());
    p = recordQuiz(p, 'A0', 3);
    expect(p.lessons.A0).toMatchObject({
      completed: false,
      bestScore: 3,
      attempts: 1,
    });
    p = recordQuiz(p, 'A0', 4);
    p = recordQuiz(p, 'A0', 2);
    expect(p.lessons.A0).toMatchObject({
      completed: true,
      bestScore: 4,
      attempts: 3,
    });
  });

  it('round-trips through storage', () => {
    const s = mem();
    expect(saveProgress(recordQuiz(loadProgress(s), 'A1', 5), s)).toBe(true);
    expect(s.data[PROGRESS_KEY]).toBeDefined();
    expect(loadProgress(s).lessons.A1.completed).toBe(true);
  });

  it('keeps working when storage throws or is corrupt', () => {
    expect(loadProgress(throwing).lessons).toEqual({});
    expect(saveProgress(recordQuiz(loadProgress(throwing), 'A0', 5), throwing)).toBe(false);
    const s = mem();
    s.data[PROGRESS_KEY] = '{not json';
    expect(loadProgress(s).lessons).toEqual({});
  });

  it('exports and imports, rejecting foreign files', () => {
    const p = recordQuiz(loadProgress(mem()), 'A2', 5);
    expect(importProgress(exportProgress(p))?.lessons.A2.completed).toBe(true);
    expect(importProgress('{"format":"other","version":1,"lessons":{}}')).toBeNull();
    expect(importProgress('garbage')).toBeNull();
  });
});

describe('widget maths', () => {
  it('transfer and propagation', () => {
    expect(transferSeconds(125, 'MB', 1, 'Gbps')).toBeCloseTo(1);
    expect(transferSeconds(1, 'MB', 0, 'Mbps')).toBe(Infinity);
    expect(propagationMs(104.11)).toBeCloseTo(0.51, 2);
  });

  it('number conversions', () => {
    expect(parseOctet('11000000', 2)).toBe(192);
    expect(parseOctet('0xFF', 16)).toBe(255);
    expect(parseOctet('256', 10)).toBeNull();
    expect(parseOctet('102', 2)).toBeNull();
    expect(toBin8(5)).toBe('00000101');
    expect(toHex2(10)).toBe('0A');
    expect(
      subtractSteps(200)
        .map((s) => s.bit)
        .join(''),
    ).toBe('11001000');
  });

  it('encapsulation adds an MPLS label only when enabled', () => {
    expect(encapStages(false).some((s) => s.layer.includes('MPLS'))).toBe(false);
    const m = encapStages(true);
    const i = m.findIndex((s) => s.layer.includes('MPLS'));
    expect(m[i - 1].layer).toContain('L3');
    expect(m[i + 1].layer).toContain('L2');
  });
});

describe('P2 widget maths', () => {
  it('hub repeats, switch learns, floods unknown and forwards known', async () => {
    const { forwardFrame } = await import('./widgetMath');
    expect(forwardFrame('hub', 4, {}, 1, 'A', 'C').outPorts).toEqual([2, 3, 4]);
    const s1 = forwardFrame('switch', 4, {}, 1, 'A', 'C');
    expect(s1).toMatchObject({ outPorts: [2, 3, 4], action: 'learn+flood', table: { A: 1 } });
    const s2 = forwardFrame('switch', 4, s1.table, 3, 'C', 'A');
    expect(s2).toMatchObject({ outPorts: [1], action: 'learn+forward' });
    expect(forwardFrame('switch', 4, s2.table, 1, 'A', 'A').action).toBe('filter');
  });

  it('subnet calculator', async () => {
    const { subnetInfo, parsePrefix } = await import('./widgetMath');
    expect(subnetInfo('10.52.20.70', 27)).toMatchObject({
      network: '10.52.20.64',
      broadcast: '10.52.20.95',
      firstHost: '10.52.20.65',
      lastHost: '10.52.20.94',
      usableHosts: 30,
      mask: '255.255.255.224',
      wildcard: '0.0.0.31',
      klass: 'A',
      isPrivate: true,
    });
    expect(subnetInfo('10.0.0.0', 31)?.usableHosts).toBe(2);
    expect(subnetInfo('172.32.0.1', 16)?.isPrivate).toBe(false);
    expect(subnetInfo('300.1.1.1', 24)).toBeNull();
    expect(parsePrefix('10.52.20.0 255.255.255.192')).toEqual({ ip: '10.52.20.0', len: 26 });
    expect(parsePrefix('10.0.0.0 255.0.255.0')).toBeNull();
  });

  it('VLSM planner allocates largest first, aligned, and matches lab L6.1', async () => {
    const { vlsmPlan } = await import('./widgetMath');
    const p = vlsmPlan('10.52.20.0/24', [
      { name: 'UTS', hosts: 20 },
      { name: 'CCTV', hosts: 50 },
      { name: 'MGMT', hosts: 5 },
    ])!;
    expect(p.map((r) => `${r.name} ${r.network}/${r.prefixLen}`)).toEqual(['CCTV 10.52.20.0/26', 'UTS 10.52.20.64/27', 'MGMT 10.52.20.96/29']);
    expect(vlsmPlan('10.0.0.0/28', [{ name: 'big', hosts: 100 }])).toBeNull();
  });

  it('802.1Q tag and root election', async () => {
    const { dot1qTag, electRoot } = await import('./widgetMath');
    expect(dot1qTag(10)?.hex).toBe('81 00 00 0A');
    expect(dot1qTag(40, 5)?.hex).toBe('81 00 A0 28');
    expect(dot1qTag(4095)).toBeNull();
    expect(
      electRoot([
        { name: 'A', priority: 32768, mac: '00aa.0000.0001' },
        { name: 'B', priority: 32768, mac: '0000.0000.0009' },
      ]),
    ).toBe('B');
    expect(
      electRoot([
        { name: 'A', priority: 4096, mac: 'ffff.ffff.ffff' },
        { name: 'B', priority: 32768, mac: '0000.0000.0001' },
      ]),
    ).toBe('A');
    expect(electRoot([{ name: 'A', priority: 100, mac: '0000.0000.0001' }])).toBeNull();
  });
});
