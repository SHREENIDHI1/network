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
  setMode: (m: AppMode) => void;
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
}));
