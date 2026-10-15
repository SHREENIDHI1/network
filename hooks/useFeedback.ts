/**
 * Haptics and soft breathing cues, both respecting the user's settings.
 * Every call is fire-and-forget and safe on platforms without the feature.
 */
import { useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { CUE_FILES } from '@/data/content';
import { useSettings } from '@/hooks/useSettings';

export function useFeedback() {
  const { settings } = useSettings();
  const players = useRef<Partial<Record<keyof typeof CUE_FILES, AudioPlayer>>>({});

  useEffect(() => {
    const p = players.current;
    return () => {
      for (const pl of Object.values(p)) {
        try {
          pl?.remove();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  /** A soft tap. `strong` is used at the start of a breath, light ticks otherwise. */
  const tap = useCallback(
    (strong = false) => {
      if (!settings.hapticsOn) return;
      Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [settings.hapticsOn],
  );

  const cue = useCallback(
    (name: keyof typeof CUE_FILES) => {
      if (!settings.breathCuesOn) return;
      try {
        let p = players.current[name];
        if (!p) {
          p = createAudioPlayer(CUE_FILES[name]);
          p.volume = 0.5;
          players.current[name] = p;
        }
        p.seekTo(0).catch(() => {});
        p.play();
      } catch {
        /* audio unavailable */
      }
    },
    [settings.breathCuesOn],
  );

  return { tap, cue };
}
