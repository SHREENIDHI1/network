import { create } from 'zustand';
import { loadProgress, saveProgress, type Progress } from '../lessons/progress';

/** Single source of truth for lesson + lab progress (localStorage, storage-safe). */
interface ProgressState {
  progress: Progress;
  /** False when the last save failed (storage blocked): progress lives only in this tab. */
  persisted: boolean;
  update: (fn: (p: Progress) => Progress) => void;
  replace: (p: Progress) => void;
}

export const useProgress = create<ProgressState>((set, get) => ({
  progress: loadProgress(),
  persisted: true,
  update: (fn) => {
    const next = fn(get().progress);
    set({ progress: next, persisted: saveProgress(next) });
  },
  replace: (p) => set({ progress: p, persisted: saveProgress(p) }),
}));
