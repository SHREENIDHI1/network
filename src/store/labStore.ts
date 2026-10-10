import { create } from 'zustand';
import { newSeed, pickSeeded } from '../labs/framework/tickets';
import type { BreakFix, Lab } from '../labs/framework/types';
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
  /** State of the current challenge (break-fix fault or capstone ticket). */
  breakFix: 'idle' | 'active' | 'done';
  /** Index of the current challenge; equals the number already solved. */
  ticket: number;
  quizScore: number | null;
  loading: boolean;
  /** Seed of the capstone ticket draw (shown so a run can be replayed). */
  seed: number;

  start: (lab: Lab, seed?: number) => Promise<void>;
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
  ticket: 0,
  quizScore: null,
  loading: false,
  seed: 1,

  start: async (lab, seed) => {
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
        ticket: 0,
        quizScore: null,
        seed: seed ?? newSeed(),
      });
      record(lab.id, { completed: false, score: 0, newAttempt: true });
    } finally {
      set({ loading: false });
    }
  },

  exit: () => set({ lab: null, hints: {}, breakFix: 'idle', ticket: 0, quizScore: null }),

  revealHint: (taskId) => set((s) => ({ hints: { ...s.hints, [taskId]: (s.hints[taskId] ?? 0) + 1 } })),

  startBreakFix: () => {
    const lab = get().lab;
    const challenge = lab ? challenges(lab, get().seed)[get().ticket] : undefined;
    if (!challenge) return;
    const ts = useTopologyStore.getState();
    ts.loadTopology(challenge.apply(ts.topology));
    // Old pings must not count: the learner has to test again after the fault.
    useSimStore.getState().resetSim();
    set({ breakFix: 'active' });
  },

  finishBreakFix: () => {
    const lab = get().lab;
    if (!lab || get().breakFix !== 'active') return;
    const next = get().ticket + 1;
    const all = next >= challenges(lab, get().seed).length;
    set({ breakFix: all ? 'done' : 'idle', ticket: next });
    if (all) record(lab.id, { completed: true, score: 0, breakFixDone: true });
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

/** Break-fix challenges of a lab: capstone tickets (a seeded draw when the lab sets ticketDraw), or the single break-fix. Without a seed: the whole catalog. */
export function challenges(lab: Lab, seed?: number): BreakFix[] {
  if (lab.tickets && lab.ticketDraw && seed !== undefined) return pickSeeded(lab.tickets, lab.ticketDraw, seed);
  return lab.tickets ?? (lab.breakFix ? [lab.breakFix] : []);
}

/** Number of challenges a run of this lab has. */
export function challengeCount(lab: Lab): number {
  return lab.tickets && lab.ticketDraw ? Math.min(lab.ticketDraw, lab.tickets.length) : challenges(lab).length;
}

/** Score = points of passed tasks − hint cost, + points per solved challenge, + quiz points. */
export function labScore(
  lab: Lab,
  passed: ReadonlySet<string>,
  hints: Record<string, number>,
  solvedChallenges: number,
  quizScore: number | null,
): number {
  const tasks = lab.tasks.reduce((a, t) => a + (passed.has(t.id) ? t.points : 0), 0);
  const hintCost = Object.values(hints).reduce((a, n) => a + n * HINT_COST, 0);
  return Math.max(0, tasks - hintCost) + solvedChallenges * BREAKFIX_POINTS + (quizScore ?? 0) * QUIZ_POINTS_EACH;
}

export function maxLabScore(lab: Lab): number {
  return lab.tasks.reduce((a, t) => a + t.points, 0) + challengeCount(lab) * BREAKFIX_POINTS + lab.quiz.length * QUIZ_POINTS_EACH;
}
