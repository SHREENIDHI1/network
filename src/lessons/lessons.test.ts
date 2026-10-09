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
