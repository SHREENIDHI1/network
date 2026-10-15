/**
 * Full-screen guided breathing with the animated orb, phase words, countdown,
 * haptics on each phase, optional soft cues and screen-reader announcements.
 * Also used inside the Calm Now flow (embedded mode).
 */
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { BreathOrb } from '@/components/BreathOrb';
import { findPattern } from '@/hooks/usePatterns';
import { useBreathing } from '@/hooks/useBreathing';
import { useFeedback } from '@/hooks/useFeedback';
import { useSettings, useTheme } from '@/hooks/useSettings';
import { BUILT_IN_PATTERNS } from '@/data/content';
import { PHASE_LABEL, type BreathPattern, type BreathState } from '@/utils/breathingEngine';
import { SPACE } from '@/theme';
import { GentleButton, Row, ScreenShell, Txt } from '@/components/ui';

export function BreathingPlayer({ pattern, cycles, autoStart, onDone }: { pattern: BreathPattern; cycles?: number; autoStart?: boolean; onDone?: () => void }) {
  useKeepAwake();
  const { reduceMotion } = useSettings();
  const { c } = useTheme();
  const { tap, cue } = useFeedback();
  const n = cycles ?? pattern.cycles;

  const onPhase = useCallback(
    (s: BreathState) => {
      tap(s.phase.kind === 'in');
      if (s.phase.kind === 'in') cue('inhale');
      if (s.phase.kind === 'out') cue('exhale');
      AccessibilityInfo.announceForAccessibility(`${PHASE_LABEL[s.phase.kind]}, ${s.phase.seconds} seconds`);
    },
    [tap, cue],
  );
  const { state, running, start, pause, reset } = useBreathing(pattern, n, onPhase);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);
  useEffect(() => {
    if (state.done) {
      cue('bell');
      onDone?.();
    }
  }, [state.done, cue, onDone]);

  return (
    <View style={{ alignItems: 'center' }}>
      <BreathOrb phase={state.phase} phaseKey={`${state.cycle}:${state.phaseIndex}`} still={reduceMotion} active={running} />
      <Txt size="title" center style={{ marginTop: SPACE.md }} accessibilityRole="header">
        {state.done ? 'Well done' : running ? PHASE_LABEL[state.phase.kind] : 'Ready when you are'}
      </Txt>
      <Txt size="hero" center color={c.accent} style={{ minHeight: 44 }}>
        {running && !state.done ? String(state.remaining) : ' '}
      </Txt>
      <Txt muted center>
        {state.done ? 'Notice how you feel now.' : `Round ${state.cycle} of ${n}`}
      </Txt>
      <Row style={{ marginTop: SPACE.xl, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!state.done && <GentleButton title={running ? 'Pause' : state.cycle > 1 || state.progress > 0 ? 'Resume' : 'Start'} icon={running ? 'pause' : 'play'} onPress={running ? pause : start} />}
        {(state.done || (!running && (state.cycle > 1 || state.progress > 0))) && <GentleButton title="Start again" kind="quiet" icon="refresh" onPress={reset} />}
      </Row>
    </View>
  );
}

export default function BreathingSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pattern, setPattern] = useState<BreathPattern | null>(BUILT_IN_PATTERNS.find((p) => p.id === id) ?? null);
  useEffect(() => {
    if (!pattern && id) findPattern(id).then((p) => setPattern(p ?? BUILT_IN_PATTERNS[0]));
  }, [id, pattern]);

  return (
    <ScreenShell title={pattern?.name ?? 'Breathe'} onBack={() => router.back()}>
      {pattern && (
        <>
          <Txt muted center style={{ marginBottom: SPACE.md }}>
            {pattern.description}
          </Txt>
          <BreathingPlayer pattern={pattern} />
        </>
      )}
    </ScreenShell>
  );
}
