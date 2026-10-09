import { describe, expect, it } from 'vitest';
import { TOPOLOGY_IDS } from '../topologies';
import * as C from './framework/checks';
import { lockReason, missingModules } from './framework/modules';
import type { Lab, QuizQuestion } from './framework/types';
import { validateLab, validateRegistry } from './framework/validate';
import { LABS } from './registry';

const q = (id: string, kind: QuizQuestion['kind'] = 'mcq'): QuizQuestion => ({
  id,
  kind,
  prompt: `Question ${id}?`,
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 1,
  explanation: 'Because.',
});

function goodLab(over: Partial<Lab> = {}): Lab {
  return {
    id: 'L0.9',
    level: 0,
    order: 9,
    title: 'Test lab',
    scenario: 'SM/JU ne bola...',
    objectives: ['Learn'],
    topologyId: 'demo-two-station',
    requiredModules: ['topology'],
    tasks: [{ id: 't1', text: 'Add a PD-Mux', check: C.hasDevice('pdmux'), points: 10 }],
    hints: [['Look in the Legacy palette.']],
    quiz: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5', 'practical')],
    estMinutes: 10,
    fieldNote: 'Note.',
    ...over,
  };
}

describe('lab registry', () => {
  it('the shipped registry is valid', () => {
    expect(validateRegistry(LABS, TOPOLOGY_IDS)).toEqual([]);
  });

  it('accepts a well-formed lab', () => {
    expect(validateLab(goodLab(), TOPOLOGY_IDS)).toEqual([]);
  });

  it('rejects structural mistakes', () => {
    const cases: Array<[Partial<Lab>, RegExp]> = [
      [{ id: 'X1' }, /id must look like/],
      [{ id: 'L3.1' }, /does not match level/],
      [{ topologyId: 'nope' }, /unknown topologyId/],
      [{ hints: [[]] }, /at least one non-empty hint/],
      [{ hints: [] }, /one entry per task/],
      [{ quiz: [q('q1'), q('q2'), q('q3'), q('q4')] }, /must have 5 questions/],
      [{ quiz: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] }, /4 MCQ \+ 1 practical/],
      [{ quiz: [q('q1'), q('q2'), q('q3'), q('q4'), { ...q('q5', 'practical'), correctIndex: 4 }] }, /correctIndex out of range/],
      [{ tasks: [{ id: 't1', text: 'x', check: C.hasDevice('pdmux'), points: 0 }] }, /points must be > 0/],
    ];
    for (const [over, re] of cases) {
      expect(validateLab(goodLab(over), TOPOLOGY_IDS).join('\n')).toMatch(re);
    }
  });

  it('rejects duplicate ids and order slots', () => {
    const errs = validateRegistry([goodLab(), goodLab()], TOPOLOGY_IDS).join('\n');
    expect(errs).toMatch(/Duplicate lab id/);
    expect(errs).toMatch(/order 9 already used/);
  });
});

describe('module locks', () => {
  it('reports missing modules with their phase', () => {
    expect(missingModules(['topology', 'physical', 'ethernet', 'ip'])).toEqual([]);
    expect(lockReason(['topology'])).toBeNull();
    expect(lockReason(['topology', 'ospf', 'mpls'])).toMatch(/Locked – needs OSPF, MPLS .* \(Phase 3\/5\)/);
  });
});
