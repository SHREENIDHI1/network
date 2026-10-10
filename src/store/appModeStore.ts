import { create } from 'zustand';

/** Top-level learning mode. Sandbox = free canvas; Learn = lessons; Lab = guided labs. */
export type AppMode = 'learn' | 'lab' | 'sandbox';

const KEY = 'railmpls-lab:mode';

function initial(): AppMode {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'learn' || v === 'lab' || v === 'sandbox') return v;
  } catch {
    // storage blocked
  }
  return 'sandbox';
}

interface AppModeState {
  mode: AppMode;
  /** Lesson to open next time Learn mode shows (e.g. "Read lesson A7" from a lab). */
  lessonId?: string;
  setMode: (m: AppMode) => void;
  openLesson: (id: string) => void;
}

export const useAppMode = create<AppModeState>((set) => ({
  mode: initial(),
  setMode: (mode) => {
    try {
      globalThis.localStorage?.setItem(KEY, mode);
    } catch {
      // storage blocked; keep in memory only
    }
    set({ mode });
  },
  openLesson: (lessonId) => {
    useAppMode.getState().setMode('learn');
    set({ lessonId });
  },
}));
