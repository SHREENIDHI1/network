/** Bottom tabs. First launch is redirected to onboarding. */
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSettings, useTheme } from '@/hooks/useSettings';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  breathe: 'leaf-outline',
  sounds: 'water-outline',
  practice: 'flower-outline',
  you: 'person-circle-outline',
};

export default function TabsLayout() {
  const { settings } = useSettings();
  const { c, t } = useTheme();
  if (!settings.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.bg[1], borderTopColor: c.border, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: Math.min(t.tiny, 14) },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={size} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="breathe" options={{ title: 'Breathe' }} />
      <Tabs.Screen name="sounds" options={{ title: 'Sounds' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
