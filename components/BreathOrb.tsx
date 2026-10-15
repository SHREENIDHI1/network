/**
 * The breathing orb. It grows over the inhale, rests during holds and shrinks
 * over the exhale, always eased and slow. With reduced motion it stays still and
 * the phase text + countdown carry the guidance instead.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useSettings';
import { orbTarget, type BreathPhase } from '@/utils/breathingEngine';

const SIZE = 260;

export function BreathOrb({ phase, phaseKey, still, active }: { phase: BreathPhase; phaseKey: string; still: boolean; active: boolean }) {
  const { c } = useTheme();
  const scale = useSharedValue(0.55);
  const glow = useSharedValue(0.25);

  useEffect(() => {
    if (still) {
      cancelAnimation(scale);
      scale.value = 0.8;
      glow.value = withTiming(phase.kind === 'in' || phase.kind === 'hold' ? 0.5 : 0.2, { duration: 400 });
      return;
    }
    if (!active) return;
    const target = orbTarget(phase.kind);
    const ms = phase.seconds * 1000;
    // holds keep their size; in/out ease across the whole phase
    scale.value = withTiming(target, { duration: phase.kind === 'hold' || phase.kind === 'holdOut' ? 300 : ms, easing: Easing.inOut(Easing.sin) });
    glow.value = withTiming(target === 1 ? 0.55 : 0.2, { duration: ms, easing: Easing.inOut(Easing.sin) });
    // phaseKey changes every phase, so the animation restarts exactly on time
  }, [phaseKey, still, active, phase.kind, phase.seconds, scale, glow]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: scale.value * 1.25 }] }));

  return (
    <View style={styles.wrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.halo, { backgroundColor: c.orb[0] }, haloStyle]} />
      <Animated.View style={[styles.orb, orbStyle]}>
        <LinearGradient colors={c.orb} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.3, height: SIZE * 1.3, alignItems: 'center', justifyContent: 'center' },
  orb: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
});
