/**
 * Typed access to every content file in /data.
 *
 * To add a sound: drop the file into /audio/loops (or /audio/tones), add one
 * line to AUDIO_FILES below, and one entry to sounds.json (or tones.json).
 * React Native needs static require() calls, which is why the file map lives here.
 */
import breathing from './breathing.json';
import sounds from './sounds.json';
import tones from './tones.json';
import shlokas from './shlokas.json';
import wisdom from './wisdomLines.json';
import helplines from './helplines.json';
import grounding from './grounding.json';
import type { BreathPattern } from '@/utils/breathingEngine';

export interface SoundItem {
  id: string;
  title: string;
  category: string;
  icon: string; // Ionicons name
  defaultVolume: number;
  a11yLabel: string;
}

export interface ToneItem {
  id: string;
  title: string;
  kind: 'drone' | 'binaural' | 'mantra';
  icon: string;
  defaultVolume: number;
  detail: string;
  headphones: boolean;
}

export interface Shloka {
  id: string;
  source: string;
  ref: string;
  devanagari: string;
  iast: string;
  meaning: string;
  reflection: string;
  themes: string[];
  verified: boolean;
  reviewNote?: string;
}

export interface WisdomLine {
  id: string;
  text: string;
  source: string;
}

export interface Helpline {
  id: string;
  name: string;
  org: string;
  phone: string;
  hours: string;
  languages: string;
  verified: boolean;
  note?: string;
}

export interface GroundingStep {
  count: number;
  sense: string;
  prompt: string;
  hint: string;
}

/** id → bundled audio asset. Every id in sounds.json / tones.json must be here (tested). */
export const AUDIO_FILES: Record<string, number> = {
  rain: require('../audio/loops/rain.wav'),
  thunderstorm: require('../audio/loops/thunderstorm.wav'),
  ocean: require('../audio/loops/ocean.wav'),
  forest: require('../audio/loops/forest.wav'),
  river: require('../audio/loops/river.wav'),
  crickets: require('../audio/loops/crickets.wav'),
  fireplace: require('../audio/loops/fireplace.wav'),
  'temple-bells': require('../audio/loops/temple-bells.wav'),
  'flowing-water': require('../audio/loops/flowing-water.wav'),
  wind: require('../audio/loops/wind.wav'),
  'white-noise': require('../audio/loops/white-noise.wav'),
  'pink-noise': require('../audio/loops/pink-noise.wav'),
  'brown-noise': require('../audio/loops/brown-noise.wav'),
  'om-drone': require('../audio/tones/om-drone.wav'),
  tanpura: require('../audio/tones/tanpura.wav'),
  'warm-pad': require('../audio/tones/warm-pad.wav'),
  'binaural-alpha': require('../audio/tones/binaural-alpha.wav'),
  'binaural-theta': require('../audio/tones/binaural-theta.wav'),
};

export const CUE_FILES = {
  inhale: require('../audio/cues/inhale.wav'),
  exhale: require('../audio/cues/exhale.wav'),
  bell: require('../audio/cues/bell.wav'),
} as const;

export const BUILT_IN_PATTERNS = breathing as BreathPattern[];
export const SOUNDS = sounds as SoundItem[];
export const TONES = tones as ToneItem[];
/** Only verified verses are ever shown in the app. */
export const SHLOKAS = (shlokas as Shloka[]).filter((s) => s.verified);
export const WISDOM = wisdom as WisdomLine[];
export const HELPLINES = helplines as { region: string; emergency: { name: string; phone: string; note: string }; lines: Helpline[] };
export const GROUNDING = grounding as GroundingStep[];

/** Look up a sound or tone by id (used by the mixer and saved mixes). */
export function findAudio(id: string): (SoundItem | ToneItem) | undefined {
  return SOUNDS.find((s) => s.id === id) ?? TONES.find((t) => t.id === id);
}
