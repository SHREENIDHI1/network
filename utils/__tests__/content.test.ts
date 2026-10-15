/** Guards the content files so new sounds / verses / helplines can be added safely. */
import { AUDIO_FILES, BUILT_IN_PATTERNS, GROUNDING, HELPLINES, SHLOKAS, SOUNDS, TONES, WISDOM } from '../../data/content';
import shlokasRaw from '../../data/shlokas.json';
import { validatePattern } from '../breathingEngine';
import { COPY } from '../../data/copy';

describe('content files', () => {
  it('every sound and tone has a bundled audio file and a unique id', () => {
    const ids = [...SOUNDS, ...TONES].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(AUDIO_FILES[id]).toBeDefined();
  });
  it('relaxation tones are labelled as not medical', () => {
    expect(COPY.tonesLabel).toMatch(/not a medical treatment/i);
    for (const t of TONES) expect(t.detail).not.toMatch(/cure|treat|heal|therapy|anxiety disorder|insomnia/i);
  });
  it('shlokas are complete; only verified ones are shown', () => {
    expect(SHLOKAS.length).toBeGreaterThanOrEqual(10);
    expect(SHLOKAS.length).toBe((shlokasRaw as { verified: boolean }[]).filter((s) => s.verified).length);
    for (const s of SHLOKAS) {
      for (const k of ['source', 'ref', 'devanagari', 'iast', 'meaning', 'reflection'] as const) expect(s[k].trim().length).toBeGreaterThanOrEqual(3);
      expect(s.devanagari).toMatch(/[ऀ-ॿ]/);
    }
  });
  it('wisdom lines always name a source', () => {
    for (const w of WISDOM) expect(w.source.length).toBeGreaterThan(3);
  });
  it('built-in breathing patterns are valid', () => {
    for (const p of BUILT_IN_PATTERNS) expect(validatePattern(p)).toBeNull();
  });
  it('helplines have dialable numbers and an emergency line', () => {
    expect(HELPLINES.emergency.phone).toBe('112');
    expect(HELPLINES.lines.find((l) => l.id === 'kiran')?.phone).toBe('1800-599-0019');
    for (const l of HELPLINES.lines) expect(l.phone.replace(/[^0-9]/g, '').length).toBeGreaterThanOrEqual(3);
  });
  it('grounding follows 5-4-3-2-1', () => {
    expect(GROUNDING.map((g) => g.count)).toEqual([5, 4, 3, 2, 1]);
  });
  it('copy makes no medical claims', () => {
    expect(COPY.disclaimer.join(' ')).toMatch(/not a substitute/);
    // everything except the explicit "cannot diagnose, treat or cure" sentence must avoid outcome words
    const rest = JSON.stringify({ ...COPY, disclaimer: COPY.disclaimer.filter((d) => !/cannot diagnose/.test(d)) });
    expect(rest).not.toMatch(/\b(cures?|treats?|heals?|therapy for|clinically proven)\b/i);
  });
});
