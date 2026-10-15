/**
 * Crisis helplines (India), configured in data/helplines.json.
 * One tap opens the phone dialer — the app never calls on its own.
 */
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { HELPLINES } from '@/data/content';
import { useTheme } from '@/hooks/useSettings';
import { SPACE } from '@/theme';
import { Card, GentleButton, Icon, Row, ScreenShell, Section, Txt } from '@/components/ui';

const dial = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`).catch(() => {});

export default function HelplinesScreen() {
  const { c } = useTheme();
  const e = HELPLINES.emergency;
  return (
    <ScreenShell title="Helplines" onBack={() => router.back()} showHelp={false}>
      <Txt style={{ marginTop: SPACE.sm }}>You do not have to go through this alone. These lines are free and confidential.</Txt>

      <Section title="Talk to someone now">
        <View style={{ gap: SPACE.md }}>
          {HELPLINES.lines.map((h) => (
            <Card key={h.id}>
              <Txt weight="600">{h.name}</Txt>
              <Txt size="small" muted>
                {h.org} · {h.hours} · {h.languages}
              </Txt>
              {!h.verified && __DEV__ && (
                <Txt size="tiny" color={c.warm} style={{ marginTop: 4 }}>
                  (Developer note: number not yet verified — see data/helplines.json)
                </Txt>
              )}
              <GentleButton title={`Call ${h.phone}`} icon="call" onPress={() => dial(h.phone)} hint={`Opens your phone dialer for ${h.name}`} style={{ marginTop: SPACE.md }} />
            </Card>
          ))}
        </View>
      </Section>

      <Section title="Emergency">
        <Card tone="warm">
          <Row style={{ alignItems: 'flex-start' }}>
            <Icon name="alert-circle-outline" color={c.danger} />
            <View style={{ flex: 1 }}>
              <Txt weight="600">{e.name}</Txt>
              <Txt size="small" muted>
                {e.note}
              </Txt>
            </View>
          </Row>
          <GentleButton title={`Call ${e.phone}`} icon="call" kind="quiet" onPress={() => dial(e.phone)} style={{ marginTop: SPACE.md }} />
        </Card>
      </Section>
    </ScreenShell>
  );
}
