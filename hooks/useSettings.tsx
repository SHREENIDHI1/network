/**
 * App-wide settings (theme, accessibility, goals…) persisted on-device.
 * Wrap the app in <SettingsProvider>; read with useSettings() / useTheme().
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { PALETTES, TYPE, type Palette, type ThemeId } from '@/theme';
import { eraseAll, KEYS, loadJSON, saveJSON } from '@/utils/storage';

export type Goal = 'stress' | 'sleep' | 'focus' | 'anxiety' | 'spiritual' | 'curious';

export interface Settings {
  name: string;
  goals: Goal[];
  theme: ThemeId;
  /** User choice; combined with the OS "reduce motion" setting. */
  reducedMotion: boolean;
  hapticsOn: boolean;
  breathCuesOn: boolean;
  fontScale: 1 | 1.15 | 1.3;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  goals: [],
  theme: 'dusk',
  reducedMotion: false,
  hapticsOn: true,
  breathCuesOn: true,
  fontScale: 1,
  onboarded: false,
};

interface Ctx {
  ready: boolean;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  eraseEverything: () => Promise<void>;
  /** True if either the user or the operating system asked for less motion. */
  reduceMotion: boolean;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [osReduce, setOsReduce] = useState(false);

  useEffect(() => {
    loadJSON<Settings>(KEYS.settings, DEFAULT_SETTINGS).then((s) => {
      setSettings(s);
      setReady(true);
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setOsReduce)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduce);
    return () => sub.remove();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(KEYS.settings, next);
      return next;
    });
  }, []);

  const eraseEverything = useCallback(async () => {
    await eraseAll();
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({ ready, settings, update, eraseEverything, reduceMotion: settings.reducedMotion || osReduce }),
    [ready, settings, update, eraseEverything, osReduce],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

/** Current palette plus font sizes already scaled by the user's preference. */
export function useTheme(): { c: Palette; t: Record<keyof typeof TYPE, number> } {
  const { settings } = useSettings();
  const c = PALETTES[settings.theme] ?? PALETTES.dusk;
  const t = useMemo(() => {
    const out = {} as Record<keyof typeof TYPE, number>;
    for (const k of Object.keys(TYPE) as (keyof typeof TYPE)[]) out[k] = Math.round(TYPE[k] * settings.fontScale);
    return out;
  }, [settings.fontScale]);
  return { c, t };
}
