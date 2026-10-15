/**
 * First-launch onboarding: welcome → goals → safety & privacy note → comfort setup.
 * Nothing here is required except acknowledging the gentle note.
 */
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { COPY } from '@/data/copy';
import { useSettings, useTheme, type Goal } from '@/hooks/useSettings';
import { RADIUS, SPACE, TAP } from '@/theme';
import { Card, Chip, GentleButton, Icon, Row, ScreenShell, Section, Txt } from '@/components/ui';

const GOALS: { id: Goal; label: string; icon: string }[] = [
  { id: 'stress', label: 'Everyday stress', icon: 'cloud-outline' },
  { id: 'sleep', label: 'Better sleep', icon: 'moon-outline' },
  { id: 'focus', label: 'Focus', icon: 'radio-button-on-outline' },
  { id: 'anxiety', label: 'Anxious moments', icon: 'pulse-outline' },
  { id: 'spiritual', label: 'Spiritual peace', icon: 'flower-outline' },
  { id: 'curious', label: 'Just curious', icon: 'sparkles-outline' },
];

export default function OnboardingScreen() {
  const { settings, update } = useSettings();
  const { c, t } = useTheme();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<Goal[]>(settings.goals);
  const [name, setName] = useState(settings.name);

  const finish = () => {
    update({ goals, name: name.trim(), onboarded: true });
    router.replace('/');
  };
  const dots = (
    <Row gap={8} style={{ justifyContent: 'center', marginVertical: SPACE.lg }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === step ? c.accent : c.border }} />
      ))}
    </Row>
  );

  return (
    <ScreenShell showHelp={step >= 2} onBack={step > 0 ? () => setStep(step - 1) : undefined}>
      <View accessibilityLabel={`Step ${step + 1} of 4`}>{dots}</View>

      {step === 0 && (
        <View style={{ marginTop: SPACE.xxl }}>
          <Txt size="tiny" muted weight="600" style={{ letterSpacing: 2 }}>
            स्थिर · STHIRA · STEADY
          </Txt>
          <Txt size="hero" style={{ marginTop: SPACE.md }} accessibilityRole="header">
            A quiet place to breathe, rest and return to yourself.
          </Txt>
          <Txt muted style={{ marginTop: SPACE.lg }}>
            Breathing, calming sounds, a grounding button for hard moments, and gentle wisdom from the Gita and the Upanishads.
          </Txt>
          <Txt muted style={{ marginTop: SPACE.md }}>
            No account. No streaks. Nothing to keep up with.
          </Txt>
          <GentleButton title="Begin gently" onPress={() => setStep(1)} style={{ marginTop: SPACE.xxl }} />
        </View>
      )}

      {step === 1 && (
        <View>
          <Txt size="title" accessibilityRole="header">
            What brings you here?
          </Txt>
          <Txt muted style={{ marginTop: SPACE.sm }}>
            Choose any that fit. We will shape your home screen around them — you can change this later.
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.xl }}>
            {GOALS.map((g) => (
              <Chip
                key={g.id}
                label={g.label}
                icon={g.icon as never}
                selected={goals.includes(g.id)}
                onPress={() => setGoals((p) => (p.includes(g.id) ? p.filter((x) => x !== g.id) : [...p, g.id]))}
              />
            ))}
          </View>
          <GentleButton title="Continue" onPress={() => setStep(2)} style={{ marginTop: SPACE.xxl }} />
        </View>
      )}

      {step === 2 && (
        <View>
          <Txt size="title" accessibilityRole="header">
            {COPY.disclaimerTitle}
          </Txt>
          <Card style={{ marginTop: SPACE.lg }}>
            {COPY.disclaimer.map((p, i) => (
              <Txt key={i} style={{ marginTop: i ? SPACE.md : 0 }}>
                {p}
              </Txt>
            ))}
          </Card>
          <Section title={COPY.privacyTitle}>
            <Card tone="accent">
              <Row style={{ alignItems: 'flex-start' }}>
                <Icon name="lock-closed-outline" />
                <Txt style={{ flex: 1 }}>{COPY.privacy[0]}</Txt>
              </Row>
            </Card>
          </Section>
          <GentleButton title="I understand" onPress={() => setStep(3)} style={{ marginTop: SPACE.xl }} hint="Acknowledges the note and continues" />
        </View>
      )}

      {step === 3 && (
        <View>
          <Txt size="title" accessibilityRole="header">
            A few comforts
          </Txt>
          <Txt muted style={{ marginTop: SPACE.sm }}>
            All optional.
          </Txt>
          <Section title="What should we call you?">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your first name (optional)"
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Your first name, optional"
              maxLength={30}
              style={{ minHeight: TAP, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.text, paddingHorizontal: SPACE.md, fontSize: t.body }}
            />
          </Section>
          <Section title="Look and feel">
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label="Dark (calm night)" selected={settings.theme === 'dusk'} onPress={() => update({ theme: 'dusk' })} icon="moon-outline" />
              <Chip label="Light (soft dawn)" selected={settings.theme === 'dawn'} onPress={() => update({ theme: 'dawn' })} icon="sunny-outline" />
            </Row>
            <Row style={{ flexWrap: 'wrap', marginTop: SPACE.sm }}>
              <Chip label="Reduce motion" selected={settings.reducedMotion} onPress={() => update({ reducedMotion: !settings.reducedMotion })} icon="pause-outline" />
              <Chip label="Gentle vibration" selected={settings.hapticsOn} onPress={() => update({ hapticsOn: !settings.hapticsOn })} icon="phone-portrait-outline" />
              <Chip label="Soft breath sounds" selected={settings.breathCuesOn} onPress={() => update({ breathCuesOn: !settings.breathCuesOn })} icon="musical-note-outline" />
            </Row>
          </Section>
          <GentleButton title="Enter Sthira" onPress={finish} style={{ marginTop: SPACE.xxl }} />
        </View>
      )}
    </ScreenShell>
  );
}
