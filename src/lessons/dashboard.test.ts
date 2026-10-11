import { describe, expect, it } from 'vitest';
import { dashboardSummary, type DashLab, type DashLesson } from './dashboard';
import type { Progress } from './progress';

const lessons: DashLesson[] = [
  { id: 'A0', part: 'A', title: 'What is a network', available: true },
  { id: 'A4', part: 'A', title: 'Ethernet', available: true },
  { id: 'B0', part: 'B', title: 'Why MPLS', available: true },
];
const labs: DashLab[] = [
  { id: 'L4.1', title: 'Hub vs switch', lessonId: 'A4', maxScore: 80 },
  { id: 'LB1.1', title: 'Commission BNO', lessonId: 'B1', maxScore: 100 },
];

describe('dashboard summary', () => {
  it('empty progress suggests the first lesson', () => {
    const s = dashboardSummary({ version: 1, lessons: {} }, lessons, labs);
    expect(s.lessons).toEqual({ done: 0, total: 3, byPart: { A: { done: 0, total: 2 }, B: { done: 0, total: 1 } } });
    expect(s.labs).toMatchObject({ completed: 0, total: 2, points: 0, maxPoints: 180 });
    expect(s.next).toEqual({ kind: 'lesson', id: 'A0', title: 'What is a network' });
  });

  it('a finished lesson with an unfinished lab suggests the lab; scores are capped at the maximum', () => {
    const p: Progress = {
      version: 1,
      lessons: { A0: { completed: true, bestScore: 5, attempts: 1 }, A4: { completed: true, bestScore: 3, attempts: 2 } },
      labs: { 'LB1.1': { completed: true, bestScore: 140, attempts: 1, breakFixDone: true, quizBest: 4 } },
    };
    const s = dashboardSummary(p, lessons, labs);
    expect(s.quiz).toEqual({ attempted: 2, average: 4 });
    expect(s.next).toEqual({ kind: 'lab', id: 'L4.1', title: 'Hub vs switch' });
    expect(s.labs).toMatchObject({ completed: 1, points: 100, breakFixDone: 1 });
  });

  it('everything done → nothing next', () => {
    const done = { completed: true, bestScore: 5, attempts: 1 };
    const lab = { completed: true, bestScore: 1, attempts: 1, breakFixDone: true, quizBest: 5 };
    const s = dashboardSummary({ version: 1, lessons: { A0: done, A4: done, B0: done }, labs: { 'L4.1': lab, 'LB1.1': lab } }, lessons, labs);
    expect(s.next).toBeNull();
  });
});
