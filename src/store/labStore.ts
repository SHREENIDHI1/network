import { create } from 'zustand';
import type { Lab } from '../labs/framework/types';
import { recordLab } from '../lessons/progress';
import { useProgress } from './progressStore';
import { getTopologyEntry } from '../topologies';
import { useSimStore } from './simStore';
import { useTopologyStore } from './topologyStore';

/**
 * Active lab session: which lab is open, hints revealed, break-fix stage.
 * Lab definitions are loaded lazily by the Lab view; this store keeps only
 * the open Lab object and the learner's progress through it.
 */

export const HINT_COST = 2;
export const BREAKFIX_POINTS = 20;
export const QUIZ_POINTS_EACH = 2;

interface LabState {
  lab: Lab | null;
  /** Number of hints revealed per task id. */
  hints: Record<string, number>;
  breakFix: 'idle' | 'active' | 'done';
  quizScore: number | null;
  loading: boolean;

  start: (lab: Lab) => Promise<void>;
  exit: () => void;
  revealHint: (taskId: string) => void;
  startBreakFix: () => void;
  finishBreakFix: () => void;
  setQuizScore: (n: number) => void;
  /** Saves the current score; `completed` = all tasks pass. */
  save: (completed: boolean, score: number) => void;
}

const record = (labId: string, r: Parameters<typeof recordLab>[2]) => useProgress.getState().update((p) => recordLab(p, labId, r));

export const useLabStore = create<LabState>((set, get) => ({
  lab: null,
  hints: {},
  breakFix: 'idle',
  quizScore: null,
  loading: false,

  start: async (lab) => {
    const entry = getTopologyEntry(lab.topologyId);
    if (!entry) return;
    set({ loading: true });
    try {
      const topology = await entry.load();
      useTopologyStore.getState().loadTopology(topology);
      useSimStore.getState().resetSim();
      set({
        lab,
        hints: {},
        breakFix: 'idle',
        quizScore: null,
      });
      record(lab.id, { completed: false, score: 0, newAttempt: true });
    } finally {
      set({ loading: false });
    }
  },

  exit: () => set({ lab: null, hints: {}, breakFix: 'idle', quizScore: null }),

  revealHint: (taskId) => set((s) => ({ hints: { ...s.hints, [taskId]: (s.hints[taskId] ?? 0) + 1 } })),

  startBreakFix: () => {
    const lab = get().lab;
    if (!lab?.breakFix) return;
    const ts = useTopologyStore.getState();
    ts.loadTopology(lab.breakFix.apply(ts.topology));
    // Old pings must not count: the learner has to test again after the fault.
    useSimStore.getState().resetSim();
    set({ breakFix: 'active' });
  },

  finishBreakFix: () => {
    const lab = get().lab;
    if (!lab || get().breakFix === 'done') return;
    set({ breakFix: 'done' });
    record(lab.id, { completed: true, score: 0, breakFixDone: true });
  },

  setQuizScore: (n) => {
    const lab = get().lab;
    if (!lab) return;
    set({ quizScore: n });
    record(lab.id, { completed: false, score: 0, quizScore: n });
  },

  save: (completed, score) => {
    const lab = get().lab;
    if (!lab) return;
    const prev = useProgress.getState().progress.labs?.[lab.id];
    if (prev && prev.bestScore >= score && (prev.completed || !completed)) return;
    record(lab.id, { completed, score });
  },
}));

/** Score = points of passed tasks − hint cost, + break-fix bonus, + quiz points. */
export function labScore(lab: Lab, passed: ReadonlySet<string>, hints: Record<string, number>, breakFixDone: boolean, quizScore: number | null): number {
  const tasks = lab.tasks.reduce((a, t) => a + (passed.has(t.id) ? t.points : 0), 0);
  const hintCost = Object.values(hints).reduce((a, n) => a + n * HINT_COST, 0);
  return Math.max(0, tasks - hintCost) + (breakFixDone ? BREAKFIX_POINTS : 0) + (quizScore ?? 0) * QUIZ_POINTS_EACH;
}

export function maxLabScore(lab: Lab): number {
  return lab.tasks.reduce((a, t) => a + t.points, 0) + (lab.breakFix ? BREAKFIX_POINTS : 0) + lab.quiz.length * QUIZ_POINTS_EACH;
}
