/**
 * Small, theme-aware building blocks used by every screen.
 * All interactive elements have ≥ 52 pt touch targets and screen-reader labels.
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useSettings';
import { RADIUS, SPACE, TAP } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// ------------------------------------------------------------------ text
export function Txt({
  children,
  size = 'body',
  muted,
  weight,
  style,
  center,
  color,
  ...rest
}: {
  children: ReactNode;
  size?: 'hero' | 'title' | 'heading' | 'body' | 'small' | 'tiny';
  muted?: boolean;
  weight?: '400' | '500' | '600' | '700';
  style?: StyleProp<TextStyle>;
  center?: boolean;
  color?: string;
  accessibilityRole?: 'header' | 'text';
  numberOfLines?: number;
}) {
  const { c, t } = useTheme();
  const defaultWeight = size === 'hero' || size === 'title' ? '600' : size === 'heading' ? '600' : '400';
  return (
    <Text
      style={[
        { color: color ?? (muted ? c.textMuted : c.text), fontSize: t[size], lineHeight: Math.round(t[size] * 1.45), fontWeight: weight ?? defaultWeight },
        center && { textAlign: 'center' },
        style,
      ]}
      maxFontSizeMultiplier={1.6}
      {...rest}
    >
      {children}
    </Text>
  );
}

// ------------------------------------------------------------------ screen shell
/**
 * Gradient background, safe areas, an optional title row, and the always-present
 * Help (heart) button that opens Support & Help from anywhere.
 */
export function ScreenShell({
  title,
  children,
  scroll = true,
  showHelp = true,
  onBack,
  padded = true,
}: {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  showHelp?: boolean;
  onBack?: () => void;
  padded?: boolean;
}) {
  const { c } = useTheme();
  const body = <View style={[padded && { paddingHorizontal: SPACE.lg }, { paddingBottom: SPACE.xxl }]}>{children}</View>;
  return (
    <LinearGradient colors={c.bg} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          {onBack ? <IconButton icon="chevron-back" label="Go back" onPress={onBack} /> : <View style={{ width: TAP }} />}
          {title ? (
            <Txt size="heading" accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
              {title}
            </Txt>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {showHelp ? <HelpButton /> : <View style={{ width: TAP }} />}
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{body}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function HelpButton() {
  return <IconButton icon="heart-outline" label="Support and help" hint="Opens support options and helplines" onPress={() => router.push('/support')} />;
}

export function IconButton({ icon, label, hint, onPress, size = 24 }: { icon: IconName; label: string; hint?: string; onPress: () => void; size?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={c.textMuted} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ surfaces
export function Card({
  children,
  onPress,
  label,
  hint,
  tone = 'plain',
  style,
  selected,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
  hint?: string;
  tone?: 'plain' | 'warm' | 'accent';
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}) {
  const { c } = useTheme();
  const bg = tone === 'warm' ? c.warmSoft : tone === 'accent' ? c.accentSoft : c.surface;
  const base: ViewStyle = { backgroundColor: bg, borderColor: selected ? c.accent : c.border, borderWidth: selected ? 2 : 1, borderRadius: RADIUS.lg, padding: SPACE.lg };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [base, { minHeight: TAP, opacity: pressed ? 0.85 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function GentleButton({
  title,
  onPress,
  kind = 'primary',
  icon,
  hint,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet';
  icon?: IconName;
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, t } = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: primary ? c.accent : 'transparent', borderColor: primary ? c.accent : c.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={primary ? c.onAccent : c.text} style={{ marginRight: SPACE.sm }} />}
      <Text style={{ color: primary ? c.onAccent : c.text, fontSize: t.body, fontWeight: '600' }} maxFontSizeMultiplier={1.5}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const { c, t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.accentSoft : c.surface, borderColor: selected ? c.accent : c.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={selected ? c.accent : c.textMuted} style={{ marginRight: 6 }} />}
      <Text style={{ color: c.text, fontSize: t.small, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: SPACE.xl }, style]}>
      {title && (
        <Txt size="small" muted weight="600" accessibilityRole="header" style={{ marginBottom: SPACE.md, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {title}
        </Txt>
      )}
      {children}
    </View>
  );
}

export function Row({ children, gap = SPACE.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Icon({ name, size = 22, color }: { name: IconName | string; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? c.accent} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.sm, minHeight: TAP + 8 },
  iconBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill },
  btn: { minHeight: TAP, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACE.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center' },
});
