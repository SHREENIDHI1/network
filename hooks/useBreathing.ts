/**
 * Drives a breathing session in real time on top of the pure breathingEngine.
 * Calls onPhase() once at the start of every phase (for haptics, cues and
 * screen-reader announcements). Supports pause / resume.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { stateAt, type BreathPattern, type BreathState } from '@/utils/breathingEngine';

export function useBreathing(pattern: BreathPattern, cycles: number, onPhase: (s: BreathState) => void) {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<BreathState>(() => stateAt(pattern, 0, cycles));
  const elapsed = useRef(0); // seconds of breathing done before the current run
  const startedAt = useRef<number | null>(null);
  const lastKey = useRef('');
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const id = setInterval(() => {
      const t = elapsed.current + (Date.now() - (startedAt.current ?? Date.now())) / 1000;
      const s = stateAt(pattern, t, cycles);
      const key = `${s.cycle}:${s.phaseIndex}:${s.done}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        if (!s.done) onPhaseRef.current(s);
      }
      setState(s);
      if (s.done) {
        elapsed.current = t;
        setRunning(false);
      }
    }, 100);
    return () => {
      clearInterval(id);
      if (startedAt.current !== null) elapsed.current += (Date.now() - startedAt.current) / 1000;
      startedAt.current = null;
    };
  }, [running, pattern, cycles]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    elapsed.current = 0;
    lastKey.current = '';
    setState(stateAt(pattern, 0, cycles));
  }, [pattern, cycles]);

  return { state, running, start, pause, reset };
}
