import { greeting, pickOfDay, shlokaOfDay, suggestion, timeOfDay } from '../daily';
import { SHLOKAS } from '../../data/content';

describe('daily picks', () => {
  it('is stable within a day and varies across days', () => {
    const a = pickOfDay([1, 2, 3, 4, 5, 6, 7], new Date(2026, 9, 15, 8));
    expect(pickOfDay([1, 2, 3, 4, 5, 6, 7], new Date(2026, 9, 15, 22))).toBe(a);
    const week = new Set(Array.from({ length: 14 }, (_, i) => pickOfDay([1, 2, 3, 4, 5, 6, 7], new Date(2026, 9, i + 1))));
    expect(week.size).toBeGreaterThan(2);
  });
  it('prefers shlokas that match the goals', () => {
    const s = shlokaOfDay(SHLOKAS, ['sleep'], new Date(2026, 9, 15));
    expect(s.themes.some((t) => ['sleep', 'peace', 'balance'].includes(t))).toBe(true);
  });
  it('greets by time of day and suggests sleep breathing at night', () => {
    expect(timeOfDay(new Date(2026, 9, 15, 7))).toBe('morning');
    expect(greeting('Asha', new Date(2026, 9, 15, 23))).toBe('Rest well, Asha');
    expect(suggestion(['stress'], new Date(2026, 9, 15, 23)).target).toBe('478');
  });
});
