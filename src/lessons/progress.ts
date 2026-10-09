/**
 * Learning progress (lesson completion + best quiz score), stored in
 * localStorage. Every access is wrapped in try/catch: when storage is blocked
 * (private mode, policies) the app keeps working with in-memory progress.
 */

export interface LessonProgress {
  completed: boolean;
  bestScore: number; // 0..5
  attempts: number;
  lastAt?: string;
}

export interface Progress {
  version: 1;
  lessons: Record<string, LessonProgress>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROGRESS_KEY = 'railmpls-lab:progress';

const empty = (): Progress => ({ version: 1, lessons: {} });

export function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProgress(storage: StorageLike | undefined = defaultStorage()): Progress {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Progress;
    if (p?.version !== 1 || typeof p.lessons !== 'object') return empty();
    return p;
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress, storage: StorageLike | undefined = defaultStorage()): boolean {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(p));
    return !!storage;
  } catch {
    return false;
  }
}

/** Records a flash-quiz attempt. A lesson is complete once all 5 answers were right at least once, or score ≥ 4 (80%). */
export function recordQuiz(p: Progress, lessonId: string, score: number, now = new Date()): Progress {
  const prev = p.lessons[lessonId] ?? {
    completed: false,
    bestScore: 0,
    attempts: 0,
  };
  const best = Math.max(prev.bestScore, score);
  return {
    ...p,
    lessons: {
      ...p.lessons,
      [lessonId]: {
        completed: prev.completed || score >= 4,
        bestScore: best,
        attempts: prev.attempts + 1,
        lastAt: now.toISOString(),
      },
    },
  };
}

export function exportProgress(p: Progress): string {
  return JSON.stringify({ format: 'railmpls-lab-progress', ...p }, null, 2);
}

export function importProgress(text: string): Progress | null {
  try {
    const o = JSON.parse(text) as { format?: string } & Progress;
    if (o.format !== 'railmpls-lab-progress' || o.version !== 1 || typeof o.lessons !== 'object') return null;
    return { version: 1, lessons: o.lessons };
  } catch {
    return null;
  }
}
