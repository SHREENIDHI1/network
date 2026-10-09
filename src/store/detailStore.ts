import { create } from 'zustand';
import type { DeviceKind } from '../model/types';

/** Which equipment detail panel is open: a placed device, or a palette kind. */
export interface DetailTarget {
  kind: DeviceKind;
  deviceId?: string;
}

export type Lang = 'en' | 'hi';
const LANG_KEY = 'railmpls-lab:lang';

function initialLang(): Lang {
  try {
    return globalThis.localStorage?.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

interface DetailState {
  target: DetailTarget | null;
  lang: Lang;
  open: (t: DetailTarget) => void;
  close: () => void;
  setLang: (l: Lang) => void;
}

export const useDetail = create<DetailState>((set) => ({
  target: null,
  lang: initialLang(),
  open: (target) => set({ target }),
  close: () => set({ target: null }),
  setLang: (lang) => {
    try {
      globalThis.localStorage?.setItem(LANG_KEY, lang);
    } catch {
      // storage blocked
    }
    set({ lang });
  },
}));
