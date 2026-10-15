/**
 * Practice tab. Phase 1 shows the shloka library (fully offline) and a quiet
 * note about what arrives in Phase 2 (meditations, sleep, journal, companion).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { SHLOKAS } from '@/data/content';
import { useTheme } from '@/hooks/useSettings';
import { SPACE } from '@/theme';
import { Card, Icon, Row, ScreenShell, Section, Txt } from '@/components/ui';

export default function PracticeScreen() {
  const { c } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ScreenShell title="Practice">
      <Card tone="accent" style={{ marginTop: SPACE.sm }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Icon name="sparkles-outline" />
          <Txt size="small" style={{ flex: 1 }}>
            Guided meditations, sleep stories, a private journal and a gentle wisdom companion are coming next. For now, here is a small library of teachings.
          </Txt>
        </Row>
      </Card>
      <Section title="Shloka library">
        <View style={{ gap: SPACE.md }}>
          {SHLOKAS.map((s) => {
            const isOpen = open === s.id;
            return (
              <Card key={s.id} tone="warm" onPress={() => setOpen(isOpen ? null : s.id)} label={`${s.source} ${s.ref}. ${s.meaning}`} hint={isOpen ? 'Collapses' : 'Shows the Sanskrit and a reflection'}>
                <Txt size="tiny" color={c.warm} weight="600" style={{ letterSpacing: 1 }}>
                  {s.source.toUpperCase()} · {s.ref}
                </Txt>
                <Txt style={{ marginTop: SPACE.sm }}>{s.meaning}</Txt>
                {isOpen && (
                  <>
                    <Txt size="heading" style={{ marginTop: SPACE.md }}>
                      {s.devanagari}
                    </Txt>
                    <Txt size="small" muted style={{ marginTop: SPACE.sm, fontStyle: 'italic' }}>
                      {s.iast}
                    </Txt>
                    <Txt size="small" color={c.warm} style={{ marginTop: SPACE.md }}>
                      {s.reflection}
                    </Txt>
                  </>
                )}
              </Card>
            );
          })}
        </View>
      </Section>
    </ScreenShell>
  );
}
