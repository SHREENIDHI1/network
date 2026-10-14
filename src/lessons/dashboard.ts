import type { Progress } from './progress';

/** Pure maths behind the Learn → Dashboard page (P10). */

export interface DashLesson {
  id: string;
  part: 'A' | 'B';
  title: string;
  available: boolean;
}

export interface DashLab {
  id: string;
  title: string;
  lessonId?: string;
  maxScore: number;
}

export interface DashLabRow extends DashLab {
  completed: boolean;
  bestScore: number;
  quizBest: number;
  breakFixDone: boolean;
  attempts: number;
}

export interface DashboardSummary {
  lessons: { done: number; total: number; byPart: Record<'A' | 'B', { done: number; total: number }> };
  quiz: { attempted: number; average: number };
  labs: { completed: number; total: number; points: number; maxPoints: number; breakFixDone: number };
  rows: DashLabRow[];
  /** First thing not done yet, in curriculum order: a lesson, then the labs that practise it. */
  next: { kind: 'lesson' | 'lab'; id: string; title: string } | null;
}

export function dashboardSummary(progress: Progress, lessons: readonly DashLesson[], labs: readonly DashLab[]): DashboardSummary {
  const lp = progress.lessons;
  const labp = progress.labs ?? {};
  const byPart = { A: { done: 0, total: 0 }, B: { done: 0, total: 0 } };
  for (const l of lessons) {
    byPart[l.part].total++;
    if (lp[l.id]?.completed) byPart[l.part].done++;
  }
  const quizzed = lessons.map((l) => lp[l.id]).filter((p) => p && p.attempts > 0);
  const rows: DashLabRow[] = labs.map((l) => {
    const p = labp[l.id];
    return {
      ...l,
      completed: !!p?.completed,
      bestScore: Math.min(p?.bestScore ?? 0, l.maxScore),
      quizBest: p?.quizBest ?? 0,
      breakFixDone: !!p?.breakFixDone,
      attempts: p?.attempts ?? 0,
    };
  });
  let next: DashboardSummary['next'] = null;
  for (const l of lessons) {
    if (!l.available) continue;
    if (!lp[l.id]?.completed) {
      next = { kind: 'lesson', id: l.id, title: l.title };
      break;
    }
    const lab = rows.find((r) => r.lessonId === l.id && !r.completed);
    if (lab) {
      next = { kind: 'lab', id: lab.id, title: lab.title };
      break;
    }
  }
  return {
    lessons: { done: byPart.A.done + byPart.B.done, total: lessons.length, byPart },
    quiz: { attempted: quizzed.length, average: quizzed.length ? quizzed.reduce((a, p) => a + p!.bestScore, 0) / quizzed.length : 0 },
    labs: {
      completed: rows.filter((r) => r.completed).length,
      total: rows.length,
      points: rows.reduce((a, r) => a + r.bestScore, 0),
      maxPoints: rows.reduce((a, r) => a + r.maxScore, 0),
      breakFixDone: rows.filter((r) => r.breakFixDone).length,
    },
    rows,
    next,
  };
}

export interface CertificateInfo {
  /** Every available lesson and every lab completed. */
  complete: boolean;
  title: string;
  pointsPct: number;
  /** Ids of completed labs, in curriculum order. */
  labsDone: string[];
}

/** Text behind the printable training record (v1.1). A full certificate only when everything is done. */
export function certificateInfo(s: DashboardSummary): CertificateInfo {
  const complete = s.lessons.total > 0 && s.lessons.done === s.lessons.total && s.labs.total > 0 && s.labs.completed === s.labs.total;
  return {
    complete,
    title: complete ? 'Certificate of Completion' : 'Training Progress Record',
    pointsPct: s.labs.maxPoints ? Math.round((s.labs.points / s.labs.maxPoints) * 100) : 0,
    labsDone: s.rows.filter((r) => r.completed).map((r) => r.id),
  };
}
