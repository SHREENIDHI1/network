/**
 * Root layout: settings + safe-area providers, status bar, and the stack that
 * holds the tabs plus the global modal screens (calm, support, helplines…).
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings, useTheme } from '@/hooks/useSettings';

function Root() {
  const { ready } = useSettings();
  const { c } = useTheme();
  // Wait for saved settings so the right theme shows from the first frame.
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg[1] }} />;
  return (
    <>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: c.bg[1] } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="breathing/[id]" />
        <Stack.Screen name="pattern-builder" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calm" options={{ animation: 'fade' }} />
        <Stack.Screen name="support" options={{ presentation: 'modal' }} />
        <Stack.Screen name="helplines" />
        <Stack.Screen name="privacy" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
