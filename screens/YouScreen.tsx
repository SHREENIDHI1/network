/** "You": name, goals, look & feel, accessibility, privacy, support, erase data. */
import { Alert, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { mixer } from '@/utils/audioEngine';
import { useSettings, useTheme, type Goal } from '@/hooks/useSettings';
import { RADIUS, SPACE, TAP } from '@/theme';
import { Card, Chip, GentleButton, Row, ScreenShell, Section, Txt } from '@/components/ui';

const GOALS: [Goal, string][] = [
  ['stress', 'Stress'],
  ['sleep', 'Sleep'],
  ['focus', 'Focus'],
  ['anxiety', 'Anxious moments'],
  ['spiritual', 'Spiritual peace'],
  ['curious', 'Curious'],
];

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const { c } = useTheme();
  return (
    <Row style={{ minHeight: TAP }}>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint && (
          <Txt size="tiny" muted>
            {hint}
          </Txt>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: c.accent, false: c.border }} thumbColor="#ffffff" />
    </Row>
  );
}

export default function YouScreen() {
  const { settings, update, eraseEverything } = useSettings();
  const { c, t } = useTheme();

  const erase = () =>
    Alert.alert('Erase all your data?', 'Settings, saved mixes and custom patterns will be removed from this phone. This cannot be undone.', [
      { text: 'Keep my data', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: async () => {
          mixer.stopAll();
          await eraseEverything();
          router.replace('/onboarding');
        },
      },
    ]);

  return (
    <ScreenShell title="You">
      <Section title="Your name" style={{ marginTop: SPACE.sm }}>
        <TextInput
          value={settings.name}
          onChangeText={(name) => update({ name })}
          placeholder="Optional"
          placeholderTextColor={c.textMuted}
          accessibilityLabel="Your name"
          maxLength={30}
          style={{ minHeight: TAP, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.text, paddingHorizontal: SPACE.md, fontSize: t.body }}
        />
      </Section>

      <Section title="What you are here for">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          {GOALS.map(([g, label]) => (
            <Chip
              key={g}
              label={label}
              selected={settings.goals.includes(g)}
              onPress={() => update({ goals: settings.goals.includes(g) ? settings.goals.filter((x) => x !== g) : [...settings.goals, g] })}
            />
          ))}
        </View>
      </Section>

      <Section title="Look and feel">
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip label="Dark" icon="moon-outline" selected={settings.theme === 'dusk'} onPress={() => update({ theme: 'dusk' })} />
          <Chip label="Light" icon="sunny-outline" selected={settings.theme === 'dawn'} onPress={() => update({ theme: 'dawn' })} />
        </Row>
        <Txt size="small" muted style={{ marginTop: SPACE.md }}>
          Text size
        </Txt>
        <Row style={{ marginTop: SPACE.sm, flexWrap: 'wrap' }}>
          {([1, 1.15, 1.3] as const).map((f) => (
            <Chip key={f} label={f === 1 ? 'Standard' : f === 1.15 ? 'Larger' : 'Largest'} selected={settings.fontScale === f} onPress={() => update({ fontScale: f })} />
          ))}
        </Row>
      </Section>

      <Section title="Comfort">
        <Card>
          <Toggle label="Reduce motion" hint="The breathing orb stays still; words guide you instead." value={settings.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
          <Toggle label="Gentle vibration" hint="A soft tap at each change of breath." value={settings.hapticsOn} onChange={(v) => update({ hapticsOn: v })} />
          <Toggle label="Soft breath sounds" hint="A quiet chime at each in- and out-breath." value={settings.breathCuesOn} onChange={(v) => update({ breathCuesOn: v })} />
        </Card>
      </Section>

      <Section title="Care and privacy">
        <View style={{ gap: SPACE.sm }}>
          <GentleButton title="Support & help" kind="quiet" icon="heart-outline" onPress={() => router.push('/support')} />
          <GentleButton title="Helplines" kind="quiet" icon="call-outline" onPress={() => router.push('/helplines')} />
          <GentleButton title="Privacy, simply" kind="quiet" icon="lock-closed-outline" onPress={() => router.push('/privacy')} />
          <GentleButton title="Erase all my data" kind="quiet" icon="trash-outline" onPress={erase} />
        </View>
      </Section>

      <Txt size="tiny" muted center style={{ marginTop: SPACE.xl }}>
        Sthira 0.1 · For relaxation and everyday wellbeing. Not a medical device or a substitute for professional care.
      </Txt>
    </ScreenShell>
  );
}
