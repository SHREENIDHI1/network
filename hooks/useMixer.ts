/** React binding for the shared sound mixer. */
import { useEffect, useState } from 'react';
import { mixer, type MixerState } from '@/utils/audioEngine';

export function useMixer(): MixerState {
  const [state, setState] = useState<MixerState>(mixer.state());
  useEffect(() => mixer.subscribe(setState), []);
  return state;
}

/** Re-renders every second while a sleep timer is running; returns seconds left. */
export function useTimerLeft(endsAt: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.round((endsAt - now) / 1000));
}
