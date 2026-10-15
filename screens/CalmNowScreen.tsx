/**
 * "I need calm now": an immediate, low-effort grounding flow for panicky or
 * overwhelmed moments. 5-4-3-2-1 senses → slow breathing with soft rain →
 * an optional line of wisdom → a gentle check-in that points to real support.
 * Every step can be skipped; nothing needs typing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { BUILT_IN_PATTERNS, GROUNDING, WISDOM } from '@/data/content';
import { useFeedback } from '@/hooks/useFeedback';
import { useTheme } from '@/hooks/useSettings';
import { mixer } from '@/utils/audioEngine';
import { wisdomOfMoment } from '@/utils/daily';
import { SPACE } from '@/theme';
import { Card, GentleButton, Row, ScreenShell, Txt } from '@/components/ui';
import { BreathingPlayer } from './BreathingSessionScreen';

type Step = 'start' | 'ground' | 'breathe' | 'wisdom' | 'check';

export default function CalmNowScreen() {
  const { c } = useTheme();
  const { tap } = useFeedback();
  const [step, setStep] = useState<Step>('start');
  const [g, setG] = useState(0); // grounding index
  const [noticed, setNoticed] = useState(0); // taps within the current sense
  const startedRain = useRef(false);
  const calm = BUILT_IN_PATTERNS.find((p) => p.id === 'calm')!;
  const wisdom = useMemo(() => wisdomOfMoment(WISDOM), []);

  // A soft rain bed while breathing; only stop it later if we started it.
  useEffect(() => {
    if (step === 'breathe' && !mixer.isPlaying('rain')) {
      startedRain.current = true;
      void mixer.add('rain', 0.45);
    }
  }, [step]);
  useEffect(
    () => () => {
      if (startedRain.current) mixer.remove('rain');
    },
    [],
  );

  const sense = GROUNDING[g];
  const nextSense = () => {
    tap(false);
    if (noticed + 1 < sense.count) return setNoticed(noticed + 1);
    setNoticed(0);
    if (g + 1 < GROUNDING.length) setG(g + 1);
    else setStep('breathe');
  };

  return (
    <ScreenShell title="Calm now" onBack={() => router.back()}>
      {step === 'start' && (
        <View style={{ marginTop: SPACE.xl }}>
          <Txt size="title" accessibilityRole="header">
            You are safe to pause here.
          </Txt>
          <Txt muted style={{ marginTop: SPACE.md }}>
            We will slowly bring your attention back to your senses, then breathe together for about a minute. You can stop at any time.
          </Txt>
          <GentleButton title="Begin" onPress={() => setStep('ground')} style={{ marginTop: SPACE.xl }} />
          <GentleButton title="Skip to breathing" kind="quiet" onPress={() => setStep('breathe')} style={{ marginTop: SPACE.md }} />
        </View>
      )}

      {step === 'ground' && (
        <View style={{ marginTop: SPACE.lg }}>
          <Txt size="tiny" muted weight="600" style={{ letterSpacing: 1 }}>
            GROUNDING · STEP {g + 1} OF {GROUNDING.length}
          </Txt>
          <Txt size="hero" color={c.accent} style={{ marginTop: SPACE.md }}>
            {sense.count}
          </Txt>
          <Txt size="title" accessibilityRole="header" style={{ marginTop: SPACE.sm }}>
            {sense.prompt}
          </Txt>
          <Txt muted style={{ marginTop: SPACE.md }}>
            {sense.hint}
          </Txt>
          <Row gap={10} style={{ marginTop: SPACE.xl }}>
            {Array.from({ length: sense.count }).map((_, i) => (
              <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < noticed ? c.accent : c.border }} />
            ))}
          </Row>
          <GentleButton
            title={noticed + 1 < sense.count ? `I noticed one (${noticed + 1} of ${sense.count})` : 'I noticed them'}
            onPress={nextSense}
            hint="Tap each time you notice one, no need to type"
            style={{ marginTop: SPACE.xl }}
          />
          <GentleButton title="Skip to breathing" kind="quiet" onPress={() => setStep('breathe')} style={{ marginTop: SPACE.md }} />
        </View>
      )}

      {step === 'breathe' && (
        <View>
          <Txt muted center style={{ marginBottom: SPACE.sm }}>
            In for four, out for six. Let the out-breath be slow and soft.
          </Txt>
          <BreathingPlayer pattern={calm} cycles={6} autoStart onDone={() => setTimeout(() => setStep('wisdom'), 1500)} />
          <GentleButton title="Continue" kind="quiet" onPress={() => setStep('wisdom')} style={{ marginTop: SPACE.lg }} />
        </View>
      )}

      {step === 'wisdom' && (
        <View style={{ marginTop: SPACE.xl }}>
          <Card tone="warm">
            <Txt size="heading">{wisdom.text}</Txt>
            <Txt size="small" color={c.warm} style={{ marginTop: SPACE.md }}>
              — {wisdom.source}
            </Txt>
          </Card>
          <GentleButton title="Continue" onPress={() => setStep('check')} style={{ marginTop: SPACE.xl }} />
        </View>
      )}

      {step === 'check' && (
        <View style={{ marginTop: SPACE.xl }}>
          <Txt size="title" accessibilityRole="header">
            How are you feeling now?
          </Txt>
          <Txt muted style={{ marginTop: SPACE.sm }}>
            Any answer is okay.
          </Txt>
          <GentleButton title="A little steadier" onPress={() => router.back()} style={{ marginTop: SPACE.xl }} />
          <GentleButton
            title="I'd like to do it once more"
            kind="quiet"
            onPress={() => {
              setG(0);
              setNoticed(0);
              setStep('breathe');
            }}
            style={{ marginTop: SPACE.md }}
          />
          <GentleButton title="Still not okay — show me support" kind="quiet" onPress={() => router.replace('/support')} style={{ marginTop: SPACE.md }} />
        </View>
      )}
    </ScreenShell>
  );
}
