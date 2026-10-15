/**
 * Home: greeting, the "I need calm now" button, today's suggestion, the
 * shloka of the day and quick tiles. Content adapts to the user's goals.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SHLOKAS } from '@/data/content';
import { useSettings, useTheme } from '@/hooks/useSettings';
import { mixer } from '@/utils/audioEngine';
import { greeting, shlokaOfDay, suggestion } from '@/utils/daily';
import { RADIUS, SPACE } from '@/theme';
import { Card, Icon, Row, ScreenShell, Section, Txt } from '@/components/ui';

export default function HomeScreen() {
  const { settings } = useSettings();
  const { c } = useTheme();
  const shloka = useMemo(() => shlokaOfDay(SHLOKAS, settings.goals), [settings.goals]);
  const sug = useMemo(() => suggestion(settings.goals), [settings.goals]);
  const [showSanskrit, setShowSanskrit] = useState(false);

  const openSuggestion = () => {
    if (sug.kind === 'breath') router.push({ pathname: '/breathing/[id]', params: { id: sug.target } });
    else if (sug.kind === 'sound') {
      void mixer.add(sug.target);
      router.push('/sounds');
    } else router.push('/calm');
  };

  const tiles = [
    { label: 'Breathe', icon: 'leaf-outline', go: () => router.push('/breathe') },
    { label: 'Sounds', icon: 'water-outline', go: () => router.push('/sounds') },
    { label: 'Sleep sounds', icon: 'moon-outline', go: () => router.push({ pathname: '/sounds', params: { filter: 'Night' } }) },
    { label: 'Get support', icon: 'heart-outline', go: () => router.push('/support') },
  ];
  // People who came for sleep see the sleep tile first.
  if (settings.goals.includes('sleep')) tiles.unshift(tiles.splice(2, 1)[0]);

  return (
    <ScreenShell>
      <Txt size="title" accessibilityRole="header" style={{ marginTop: SPACE.sm }}>
        {greeting(settings.name)}
      </Txt>
      <Txt muted style={{ marginTop: SPACE.xs }}>
        Take your time. There is nothing to catch up on.
      </Txt>

      {/* The calm-now button: big, soft, always first. */}
      <Pressable
        onPress={() => router.push('/calm')}
        accessibilityRole="button"
        accessibilityLabel="I need calm now"
        accessibilityHint="Starts a short grounding and breathing exercise"
        style={({ pressed }) => ({ marginTop: SPACE.xl, opacity: pressed ? 0.9 : 1 })}
      >
        <LinearGradient colors={c.calmButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: RADIUS.lg, padding: SPACE.xl, minHeight: 120, justifyContent: 'center' }}>
          <Row>
            <Icon name="hand-left-outline" size={30} color="#ffffff" />
            <View style={{ flex: 1 }}>
              <Txt size="heading" color="#ffffff">
                I need calm now
              </Txt>
              <Txt size="small" color="#e6f0f5">
                Ground yourself in about two minutes
              </Txt>
            </View>
          </Row>
        </LinearGradient>
      </Pressable>

      <Section title="Suggested for you">
        <Card onPress={openSuggestion} label={`${sug.title}. ${sug.subtitle}`} hint="Starts the suggestion">
          <Row>
            <Icon name={sug.kind === 'breath' ? 'leaf-outline' : 'musical-notes-outline'} />
            <View style={{ flex: 1 }}>
              <Txt weight="600">{sug.title}</Txt>
              <Txt size="small" muted>
                {sug.subtitle}
              </Txt>
            </View>
            <Icon name="chevron-forward" color={c.textMuted} />
          </Row>
        </Card>
      </Section>

      <Section title="Wisdom for today">
        <Card tone="warm" onPress={() => setShowSanskrit((v) => !v)} label="Shloka of the day" hint={showSanskrit ? 'Hides the Sanskrit' : 'Shows the Sanskrit verse'}>
          <Txt size="tiny" color={c.warm} weight="600" style={{ letterSpacing: 1 }}>
            {shloka.source.toUpperCase()} · {shloka.ref}
          </Txt>
          {showSanskrit && (
            <>
              <Txt size="heading" style={{ marginTop: SPACE.md }}>
                {shloka.devanagari}
              </Txt>
              <Txt size="small" muted style={{ marginTop: SPACE.sm, fontStyle: 'italic' }}>
                {shloka.iast}
              </Txt>
            </>
          )}
          <Txt style={{ marginTop: SPACE.md }}>{shloka.meaning}</Txt>
          <Txt size="small" color={c.warm} style={{ marginTop: SPACE.md }}>
            {shloka.reflection}
          </Txt>
          <Txt size="tiny" muted style={{ marginTop: SPACE.md }}>
            {showSanskrit ? 'Tap to hide the Sanskrit' : 'Tap to see the Sanskrit'}
          </Txt>
        </Card>
      </Section>

      <Section title="Quick access">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
          {tiles.map((t) => (
            <Card key={t.label} onPress={t.go} label={t.label} style={{ width: '47%', alignItems: 'flex-start' }}>
              <Icon name={t.icon} size={26} />
              <Txt weight="600" style={{ marginTop: SPACE.sm }}>
                {t.label}
              </Txt>
            </Card>
          ))}
        </View>
      </Section>
    </ScreenShell>
  );
}
