/**
 * Sounds: soundscape library + relaxation tones, a layered mixer with a volume
 * per layer, saved mixes and a sleep timer that fades out over the last minute.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams } from 'expo-router';
import { COPY } from '@/data/copy';
import { findAudio, SOUNDS, TONES, type SoundItem, type ToneItem } from '@/data/content';
import { useMixer, useTimerLeft } from '@/hooks/useMixer';
import { useTheme } from '@/hooks/useSettings';
import { MAX_LAYERS, mixer } from '@/utils/audioEngine';
import { KEYS, loadList, saveJSON } from '@/utils/storage';
import { RADIUS, SPACE, TAP } from '@/theme';
import { Card, Chip, GentleButton, Icon, IconButton, Row, ScreenShell, Section, Txt } from '@/components/ui';

interface SavedMix {
  id: string;
  name: string;
  layers: { soundId: string; volume: number }[];
  createdAt: string;
}

function Tile({ item, active, onPress }: { item: SoundItem | ToneItem; active: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const label = 'a11yLabel' in item ? item.a11yLabel : item.title;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      accessibilityHint={active ? 'Fades this sound out' : 'Adds this sound to your mix'}
      style={({ pressed }) => ({
        width: '31%',
        minHeight: 96,
        borderRadius: RADIUS.md,
        borderWidth: active ? 2 : 1,
        borderColor: active ? c.accent : c.border,
        backgroundColor: active ? c.accentSoft : c.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE.sm,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={item.icon} size={26} color={active ? c.accent : c.textMuted} />
      <Txt size="tiny" center style={{ marginTop: 6 }} weight={active ? '600' : '400'}>
        {item.title}
      </Txt>
    </Pressable>
  );
}

export default function SoundsScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const { c, t } = useTheme();
  const mix = useMixer();
  const left = useTimerLeft(mix.timerEndsAt);
  const [tab, setTab] = useState<'scapes' | 'tones'>('scapes');
  const [cat, setCat] = useState<string>(filter ?? 'All');
  const [mixes, setMixes] = useState<SavedMix[]>([]);
  const [naming, setNaming] = useState(false);
  const [mixName, setMixName] = useState('');
  const [customMin, setCustomMin] = useState(45);

  useEffect(() => {
    loadList<SavedMix>(KEYS.mixes).then(setMixes);
  }, []);
  useEffect(() => {
    if (filter) setCat(filter);
  }, [filter]);

  const cats = useMemo(() => ['All', ...Array.from(new Set(SOUNDS.map((s) => s.category)))], []);
  const shown = cat === 'All' ? SOUNDS : SOUNDS.filter((s) => s.category === cat);

  const toggle = async (id: string, vol: number) => {
    if (mixer.isPlaying(id)) return mixer.remove(id);
    const ok = await mixer.add(id, vol);
    if (!ok) Alert.alert('Your mix is full', `Up to ${MAX_LAYERS} sounds can play together. Remove one to add another.`);
  };

  const saveMix = async () => {
    const m: SavedMix = {
      id: `mix-${Date.now()}`,
      name: mixName.trim() || 'My mix',
      layers: mix.layers.map((l) => ({ soundId: l.id, volume: l.volume })),
      createdAt: new Date().toISOString(),
    };
    const next = [m, ...mixes];
    setMixes(next);
    await saveJSON(KEYS.mixes, next);
    setNaming(false);
    setMixName('');
  };
  const deleteMix = async (id: string) => {
    const next = mixes.filter((m) => m.id !== id);
    setMixes(next);
    await saveJSON(KEYS.mixes, next);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <ScreenShell title="Sounds">
      <Row style={{ marginTop: SPACE.sm }}>
        <Chip label="Soundscapes" selected={tab === 'scapes'} onPress={() => setTab('scapes')} icon="leaf-outline" />
        <Chip label="Relaxation tones" selected={tab === 'tones'} onPress={() => setTab('tones')} icon="infinite-outline" />
      </Row>

      {tab === 'scapes' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.lg }}>
            {cats.map((k) => (
              <Chip key={k} label={k} selected={cat === k} onPress={() => setCat(k)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.lg }}>
            {shown.map((s) => (
              <Tile key={s.id} item={s} active={mix.layers.some((l) => l.id === s.id)} onPress={() => toggle(s.id, s.defaultVolume)} />
            ))}
          </View>
        </>
      ) : (
        <>
          <Card tone="warm" style={{ marginTop: SPACE.lg }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Icon name="information-circle-outline" color={c.warm} />
              <Txt size="small" style={{ flex: 1 }}>
                {COPY.tonesLabel}
              </Txt>
            </Row>
          </Card>
          <View style={{ gap: SPACE.sm, marginTop: SPACE.lg }}>
            {TONES.map((tn) => {
              const active = mix.layers.some((l) => l.id === tn.id);
              return (
                <Card key={tn.id} onPress={() => toggle(tn.id, tn.defaultVolume)} selected={active} label={`${tn.title}. ${tn.detail}. Relaxation audio, not a medical treatment.`}>
                  <Row>
                    <Icon name={tn.icon} color={active ? c.accent : c.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Txt weight="600">{tn.title}</Txt>
                      <Txt size="small" muted>
                        {tn.detail}
                      </Txt>
                      {tn.headphones && (
                        <Txt size="tiny" color={c.warm} style={{ marginTop: 4 }}>
                          {COPY.binauralNote}
                        </Txt>
                      )}
                    </View>
                    <Icon name={active ? 'pause-circle-outline' : 'play-circle-outline'} size={28} />
                  </Row>
                </Card>
              );
            })}
          </View>
        </>
      )}

      {/* ---------------- mixer */}
      <Section title={`Your mix (${mix.layers.length}/${MAX_LAYERS})`}>
        {mix.layers.length === 0 ? (
          <Txt muted size="small">
            Tap any sound to start. Layer a few together — rain with temple bells, or ocean with an Om drone.
          </Txt>
        ) : (
          <Card>
            {mix.layers.map((l) => {
              const item = findAudio(l.id);
              return (
                <View key={l.id} style={{ marginBottom: SPACE.sm }}>
                  <Row>
                    <Txt weight="600" style={{ flex: 1 }}>
                      {item?.title ?? l.id}
                    </Txt>
                    <IconButton icon="close-circle-outline" label={`Remove ${item?.title ?? l.id}`} onPress={() => mixer.remove(l.id)} />
                  </Row>
                  <Slider
                    value={l.volume}
                    minimumValue={0}
                    maximumValue={1}
                    step={0.05}
                    onValueChange={(v) => mixer.setVolume(l.id, v)}
                    minimumTrackTintColor={c.accent}
                    maximumTrackTintColor={c.border}
                    thumbTintColor={c.accent}
                    accessibilityLabel={`${item?.title ?? l.id} volume`}
                    style={{ height: 40 }}
                  />
                </View>
              );
            })}
            <Row style={{ flexWrap: 'wrap', marginTop: SPACE.sm }}>
              <GentleButton title="Save this mix" kind="quiet" icon="bookmark-outline" onPress={() => setNaming(true)} />
              <GentleButton title="Stop all" kind="quiet" icon="stop-outline" onPress={() => mixer.stopAll()} />
            </Row>
            {naming && (
              <Row style={{ marginTop: SPACE.md }}>
                <TextInput
                  value={mixName}
                  onChangeText={setMixName}
                  placeholder="Name your mix"
                  placeholderTextColor={c.textMuted}
                  accessibilityLabel="Mix name"
                  maxLength={30}
                  autoFocus
                  style={{ flex: 1, minHeight: TAP, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: SPACE.md, fontSize: t.body }}
                />
                <GentleButton title="Save" onPress={saveMix} />
              </Row>
            )}
          </Card>
        )}
      </Section>

      {/* ---------------- sleep timer */}
      <Section title="Sleep timer">
        {left !== null ? (
          <Card tone="accent">
            <Row>
              <Icon name="timer-outline" />
              <Txt style={{ flex: 1 }} accessibilityRole="text">
                Fading out in {fmt(left)}
              </Txt>
              <GentleButton title="Cancel" kind="quiet" onPress={() => mixer.cancelTimer()} />
            </Row>
          </Card>
        ) : (
          <>
            <Row style={{ flexWrap: 'wrap' }}>
              {[15, 30, 60].map((m) => (
                <Chip key={m} label={`${m} min`} selected={false} onPress={() => mixer.setTimer(m)} icon="timer-outline" />
              ))}
            </Row>
            <Row style={{ marginTop: SPACE.sm }}>
              <IconButton icon="remove-circle-outline" label="Five minutes less" onPress={() => setCustomMin((v) => Math.max(5, v - 5))} />
              <Txt accessibilityRole="text">{customMin} min</Txt>
              <IconButton icon="add-circle-outline" label="Five minutes more" onPress={() => setCustomMin((v) => Math.min(180, v + 5))} />
              <GentleButton title="Set custom" kind="quiet" onPress={() => mixer.setTimer(customMin)} />
            </Row>
            <Txt size="tiny" muted style={{ marginTop: SPACE.sm }}>
              Sound fades gently over the final minute, then stops.
            </Txt>
          </>
        )}
      </Section>

      {/* ---------------- saved mixes */}
      {mixes.length > 0 && (
        <Section title="Saved mixes">
          <View style={{ gap: SPACE.sm }}>
            {mixes.map((m) => (
              <Card key={m.id} onPress={() => mixer.loadMix(m.layers)} label={`Play mix ${m.name}`}>
                <Row>
                  <Icon name="albums-outline" />
                  <View style={{ flex: 1 }}>
                    <Txt weight="600">{m.name}</Txt>
                    <Txt size="small" muted numberOfLines={1}>
                      {m.layers.map((l) => findAudio(l.soundId)?.title ?? l.soundId).join(' · ')}
                    </Txt>
                  </View>
                  <IconButton icon="trash-outline" label={`Delete mix ${m.name}`} onPress={() => deleteMix(m.id)} />
                </Row>
              </Card>
            ))}
          </View>
        </Section>
      )}
    </ScreenShell>
  );
}
