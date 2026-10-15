/** Breathe tab: built-in and custom patterns, plus "make your own". */
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { usePatterns } from '@/hooks/usePatterns';
import { useTheme } from '@/hooks/useSettings';
import { activePhases, PHASE_SHORT, sessionSeconds } from '@/utils/breathingEngine';
import { SPACE } from '@/theme';
import { Card, GentleButton, Icon, IconButton, Row, ScreenShell, Section, Txt } from '@/components/ui';

export default function BreatheScreen() {
  const { all, deleteCustom } = usePatterns();
  const { c } = useTheme();
  return (
    <ScreenShell title="Breathe">
      <Txt muted style={{ marginTop: SPACE.sm }}>
        Pick a rhythm. Follow the orb, the words, or the gentle vibration — whichever feels easiest.
      </Txt>
      <Section title="Patterns">
        <View style={{ gap: SPACE.md }}>
          {all.map((p) => {
            const mins = Math.max(1, Math.round(sessionSeconds(p) / 60));
            const rhythm = activePhases(p)
              .map((ph) => `${PHASE_SHORT[ph.kind]} ${ph.seconds}`)
              .join(' · ');
            return (
              <Card key={p.id} onPress={() => router.push({ pathname: '/breathing/[id]', params: { id: p.id } })} label={`${p.name}. ${p.description}. About ${mins} minutes.`}>
                <Row>
                  <Icon name={p.builtIn ? 'leaf-outline' : 'create-outline'} />
                  <View style={{ flex: 1 }}>
                    <Txt weight="600">{p.name}</Txt>
                    <Txt size="small" muted>
                      {rhythm} · ~{mins} min
                    </Txt>
                    <Txt size="small" muted style={{ marginTop: 2 }}>
                      {p.description}
                    </Txt>
                  </View>
                  {!p.builtIn && (
                    <IconButton
                      icon="trash-outline"
                      label={`Delete ${p.name}`}
                      onPress={() =>
                        Alert.alert('Delete pattern?', p.name, [
                          { text: 'Keep', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteCustom(p.id) },
                        ])
                      }
                    />
                  )}
                  <Icon name="play-circle-outline" size={28} color={c.accent} />
                </Row>
              </Card>
            );
          })}
        </View>
      </Section>
      <GentleButton title="Make your own pattern" kind="quiet" icon="add" onPress={() => router.push('/pattern-builder')} style={{ marginTop: SPACE.xl }} />
      <Txt size="tiny" muted center style={{ marginTop: SPACE.lg }}>
        If you feel dizzy or uncomfortable at any point, simply stop and breathe normally.
      </Txt>
    </ScreenShell>
  );
}
