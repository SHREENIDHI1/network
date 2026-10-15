/**
 * Safety helpers. Pure functions, unit-tested.
 *
 * - sustainedLowMood(): used by Phase 2 mood check-ins to *gently* suggest
 *   reaching out to someone. Never alarming, never diagnostic.
 * - crisisSignal(): a conservative phrase screen used before any companion
 *   (Phase 2) message is sent. On a match the app shows human-help options
 *   alongside the reply. It is a safety net, not a classifier — false positives
 *   are acceptable, false negatives are what we try hard to avoid.
 */

export interface MoodPoint {
  date: string; // YYYY-MM-DD
  score: number; // 1 (very low) .. 5 (very good)
}

/**
 * True when at least `minLow` of the most recent `window` check-ins are low
 * (score <= 2) and the latest check-in is also low. Requires at least
 * `minLow` entries so a single bad day never triggers it.
 */
export function sustainedLowMood(entries: MoodPoint[], window = 7, minLow = 5): boolean {
  const recent = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, window);
  if (recent.length < minLow) return false;
  const low = recent.filter((e) => e.score <= 2).length;
  return low >= minLow && recent[0].score <= 2;
}

// Lower-case phrases (English, Hindi in Latin script, Hinglish, and Devanagari).
const CRISIS_PHRASES = [
  'kill myself', 'end my life', 'end it all', 'suicide', 'suicidal', 'want to die', 'wanna die', 'better off dead',
  'no reason to live', "don't want to live", 'dont want to live', 'hurt myself', 'harm myself', 'self harm', 'self-harm',
  'cut myself', 'not worth living', 'take my own life', 'overdose',
  'marna chahta', 'marna chahti', 'mar jana chahta', 'mar jana chahti', 'jeena nahi chahta', 'jeena nahi chahti',
  'khudkushi', 'aatmahatya', 'atmahatya', 'jaan de dunga', 'jaan de dungi', 'zindagi khatam',
  'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं चाहता', 'जीना नहीं चाहती', 'खुदकुशी',
];

export function crisisSignal(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  return CRISIS_PHRASES.some((p) => t.includes(p));
}
