import { cycleSeconds, sessionSeconds, stateAt, validatePattern, type BreathPattern } from '../breathingEngine';

const box: BreathPattern = {
  id: 'box', name: 'Box', description: '', cycles: 2, builtIn: true,
  phases: [ { kind: 'in', seconds: 4 }, { kind: 'hold', seconds: 4 }, { kind: 'out', seconds: 4 }, { kind: 'holdOut', seconds: 4 } ],
};

describe('breathing engine', () => {
  it('computes cycle and session length', () => {
    expect(cycleSeconds(box)).toBe(16);
    expect(sessionSeconds(box)).toBe(32);
  });
  it('finds the phase, progress and countdown at any time', () => {
    expect(stateAt(box, 0)).toMatchObject({ phaseIndex: 0, progress: 0, remaining: 4, cycle: 1, done: false });
    expect(stateAt(box, 5)).toMatchObject({ phase: { kind: 'hold' }, remaining: 3, cycle: 1 });
    expect(stateAt(box, 17)).toMatchObject({ phase: { kind: 'in' }, cycle: 2 });
    expect(stateAt(box, 32).done).toBe(true);
  });
  it('skips zero-length holds', () => {
    const p = { ...box, phases: [ { kind: 'in' as const, seconds: 4 }, { kind: 'hold' as const, seconds: 0 }, { kind: 'out' as const, seconds: 6 } ] };
    expect(cycleSeconds(p)).toBe(10);
    expect(stateAt(p, 4.5).phase.kind).toBe('out');
  });
  it('validates custom patterns', () => {
    expect(validatePattern(box)).toBeNull();
    expect(validatePattern({ phases: [ { kind: 'in', seconds: 1 }, { kind: 'out', seconds: 4 } ] })).toMatch(/in/);
    expect(validatePattern({ phases: [ { kind: 'in', seconds: 4 } ] })).toMatch(/out/);
    expect(validatePattern({ phases: [ { kind: 'in', seconds: 4 }, { kind: 'out', seconds: 20 } ] })).toMatch(/12/);
  });
});
