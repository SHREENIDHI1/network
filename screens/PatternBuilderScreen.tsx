/** Build a custom breathing pattern with simple +/- steppers. Saved on-device. */
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { usePatterns } from '@/hooks/usePatterns';
import { useTheme } from '@/hooks/useSettings';
import { cycleSeconds, PHASE_LABEL, validatePattern, type BreathPattern, type PhaseKind } from '@/utils/breathingEngine';
import { RADIUS, SPACE, TAP } from '@/theme';
import { Card, GentleButton, IconButton, Row, ScreenShell, Section, Txt } from '@/components/ui';

const ORDER: PhaseKind[] = ['in', 'hold', 'out', 'holdOut'];

function Stepper({ label, value, onChange, min, max, unit = 's' }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit?: string }) {
  return (
    <Card style={{ paddingVertical: SPACE.sm }}>
      <Row>
        <Txt style={{ flex: 1 }} weight="600">
          {label}
        </Txt>
        <IconButton icon="remove-circle-outline" label={`Less time for ${label}`} onPress={() => onChange(Math.max(min, value - 1))} size={28} />
        <View accessible accessibilityLabel={`${label}: ${value}${unit === 's' ? ' seconds' : ''}`} accessibilityRole="adjustable" style={{ minWidth: 56, alignItems: 'center' }}>
          <Txt size="heading">
            {value}
            {unit}
          </Txt>
        </View>
        <IconButton icon="add-circle-outline" label={`More time for ${label}`} onPress={() => onChange(Math.min(max, value + 1))} size={28} />
      </Row>
    </Card>
  );
}

export default function PatternBuilderScreen() {
  const { saveCustom } = usePatterns();
  const { c, t } = useTheme();
  const [name, setName] = useState('My rhythm');
  const [secs, setSecs] = useState<Record<PhaseKind, number>>({ in: 4, hold: 2, out: 6, holdOut: 0 });
  const [cycles, setCycles] = useState(8);

  const draft: BreathPattern = {
    id: `custom-${Date.now()}`,
    name: name.trim() || 'My rhythm',
    description: 'Your own pattern.',
    phases: ORDER.map((k) => ({ kind: k, seconds: secs[k] })),
    cycles,
    builtIn: false,
  };
  const error = validatePattern(draft);
  const total = cycleSeconds(draft) * cycles;

  return (
    <ScreenShell title="Your pattern" onBack={() => router.back()}>
      <Section title="Name">
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={30}
          accessibilityLabel="Pattern name"
          style={{ minHeight: TAP, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.text, paddingHorizontal: SPACE.md, fontSize: t.body }}
        />
      </Section>
      <Section title="Rhythm (seconds)">
        <View style={{ gap: SPACE.sm }}>
          {ORDER.map((k) => (
            <Stepper key={k} label={PHASE_LABEL[k]} value={secs[k]} min={0} max={12} onChange={(v) => setSecs((s) => ({ ...s, [k]: v }))} />
          ))}
          <Stepper label="Rounds" value={cycles} min={2} max={30} onChange={setCycles} unit="" />
        </View>
        <Txt size="small" muted style={{ marginTop: SPACE.md }}>
          Set a hold to 0 to skip it. About {Math.max(1, Math.round(total / 60))} min in total.
        </Txt>
        {error && (
          <Txt size="small" color={c.warm} style={{ marginTop: SPACE.sm }}>
            {error}
          </Txt>
        )}
      </Section>
      <GentleButton
        title="Save and try it"
        disabled={!!error}
        style={{ marginTop: SPACE.xl }}
        onPress={async () => {
          await saveCustom(draft);
          router.replace({ pathname: '/breathing/[id]', params: { id: draft.id } });
        }}
      />
    </ScreenShell>
  );
}
