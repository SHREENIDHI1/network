/**
 * "Of the day" picks and gentle suggestions. Deterministic by date, so the
 * shloka stays the same all day and changes tomorrow — no network needed.
 */
import type { Goal } from '@/hooks/useSettings';
import type { Shloka, WisdomLine } from '@/data/content';

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Stable small hash of a string (FNV-1a). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickOfDay<T>(items: T[], d = new Date(), salt = ''): T {
  if (!items.length) throw new Error('nothing to pick from');
  return items[hash(dayKey(d) + salt) % items.length];
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function greeting(name: string, d = new Date()): string {
  const g = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Rest well' }[timeOfDay(d)];
  return name.trim() ? `${g}, ${name.trim()}` : g;
}

/** Prefer a shloka whose themes match the user's goals; fall back to any. */
export function shlokaOfDay(all: Shloka[], goals: Goal[], d = new Date()): Shloka {
  const themeFor: Record<Goal, string[]> = {
    stress: ['work-stress', 'letting-go', 'equanimity'],
    sleep: ['sleep', 'peace', 'balance'],
    focus: ['focus', 'meditation', 'practice'],
    anxiety: ['anxiety', 'impermanence', 'steady-mind'],
    spiritual: ['spiritual', 'peace', 'meditation'],
    curious: [],
  };
  const wanted = new Set(goals.flatMap((g) => themeFor[g]));
  const matching = all.filter((s) => s.themes.some((t) => wanted.has(t)));
  return pickOfDay(matching.length ? matching : all, d, 'shloka');
}

export function wisdomOfMoment(all: WisdomLine[], seed = Date.now()): WisdomLine {
  return all[hash(String(seed)) % all.length];
}

export interface Suggestion {
  title: string;
  subtitle: string;
  kind: 'breath' | 'sound' | 'calm';
  target: string; // pattern id, sound id, or 'calm'
}

/** One gentle suggestion for today, from goals + time of day. */
export function suggestion(goals: Goal[], d = new Date()): Suggestion {
  const tod = timeOfDay(d);
  if (tod === 'night' || (tod === 'evening' && goals.includes('sleep')))
    return { title: '4-7-8 breath before sleep', subtitle: 'Four slow rounds, then let the night take over', kind: 'breath', target: '478' };
  if (goals.includes('anxiety')) return { title: 'Calm breathing', subtitle: 'A longer out-breath, ten gentle rounds', kind: 'breath', target: 'calm' };
  if (goals.includes('focus') || goals.includes('stress'))
    return tod === 'morning'
      ? { title: 'Box breathing', subtitle: 'Square the mind before the day begins', kind: 'breath', target: 'box' }
      : { title: 'Soft rain for focus', subtitle: 'A steady sound to work inside', kind: 'sound', target: 'rain' };
  if (goals.includes('spiritual')) return { title: 'Om drone', subtitle: 'Sit with a slow, warm Om for a few minutes', kind: 'sound', target: 'om-drone' };
  return tod === 'morning'
    ? { title: 'Calm breathing', subtitle: 'Two minutes to start gently', kind: 'breath', target: 'calm' }
    : { title: 'Ocean waves', subtitle: 'Let the waves set your pace', kind: 'sound', target: 'ocean' };
}
