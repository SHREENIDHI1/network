/** Support & Help: what Sthira is and is not, and how to reach real people. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { COPY } from '@/data/copy';
import { useTheme } from '@/hooks/useSettings';
import { SPACE } from '@/theme';
import { Card, GentleButton, Icon, Row, ScreenShell, Section, Txt } from '@/components/ui';

export default function SupportScreen() {
  const { c } = useTheme();
  return (
    <ScreenShell title="Support & help" onBack={() => router.back()} showHelp={false}>
      <Card tone="accent" style={{ marginTop: SPACE.sm }}>
        <Txt size="heading">{COPY.crisisLead}</Txt>
        <Txt style={{ marginTop: SPACE.sm }}>Talking to someone can help — free, confidential helplines are available any time.</Txt>
        <GentleButton title="See helplines" icon="call-outline" onPress={() => router.push('/helplines')} style={{ marginTop: SPACE.lg }} />
      </Card>

      <Section title="Reach out to someone">
        <View style={{ gap: SPACE.sm }}>
          {[
            ['people-outline', 'A trusted person', 'A friend, family member, colleague or neighbour. You can simply say, "I am not doing well. Can we talk?"'],
            ['medkit-outline', 'A doctor or counsellor', 'A GP, psychologist, psychiatrist or counsellor can properly understand what you are going through.'],
            ['call-outline', 'A helpline', 'Trained listeners, many in Indian languages, often 24 × 7.'],
          ].map(([icon, title, body]) => (
            <Card key={title}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Icon name={icon} />
                <View style={{ flex: 1 }}>
                  <Txt weight="600">{title}</Txt>
                  <Txt size="small" muted>
                    {body}
                  </Txt>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="About Sthira">
        <Card>
          <Txt>{COPY.supportIntro}</Txt>
          {COPY.disclaimer.slice(1, 2).map((p) => (
            <Txt key={p} style={{ marginTop: SPACE.md }} muted>
              {p}
            </Txt>
          ))}
        </Card>
        <GentleButton title="Privacy, simply" kind="quiet" icon="lock-closed-outline" onPress={() => router.push('/privacy')} style={{ marginTop: SPACE.md }} />
      </Section>

      <Txt size="tiny" muted center style={{ marginTop: SPACE.xl }} color={c.textMuted}>
        If you or someone near you is in immediate danger, call 112.
      </Txt>
    </ScreenShell>
  );
}
