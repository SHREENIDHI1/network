/** A short, human privacy note. */
import { router } from 'expo-router';
import { COPY } from '@/data/copy';
import { SPACE } from '@/theme';
import { Card, Icon, Row, ScreenShell, Txt } from '@/components/ui';

export default function PrivacyScreen() {
  return (
    <ScreenShell title={COPY.privacyTitle} onBack={() => router.back()}>
      {COPY.privacy.map((p, i) => (
        <Card key={i} style={{ marginTop: SPACE.md }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Icon name={i === 0 ? 'phone-portrait-outline' : i === 3 ? 'trash-outline' : 'lock-closed-outline'} />
            <Txt style={{ flex: 1 }}>{p}</Txt>
          </Row>
        </Card>
      ))}
    </ScreenShell>
  );
}
