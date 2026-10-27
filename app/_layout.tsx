/**
 * app/_layout.tsx: root layout, which wraps every screen.
 *
 * Layer: UI (Expo Router). Sets up the app shell (quest_log's, without its
 * reminders and app-icon shortcut):
 *   - the store: importing '@/store' hydrates it synchronously from MMKV,
 *     so the first render already has the user's budget,
 *   - the gesture handler root (required by react-native-gesture-handler),
 *   - the keyboard controller (amount fields stay above the keyboard),
 *   - safe-area insets,
 *   - the light status bar on a black background,
 *   - a header-less Stack, since each screen draws its own terminal header,
 *   - motion: the Reduce Motion setting, applied to every animation,
 *   - the boot screen, laid over the app on a cold start (BootGate),
 *   - the crash screen (the exported ErrorBoundary, CrashScreen.tsx).
 *
 * Fonts need no loading step here: they're embedded at build time by the
 * expo-font config plugin (app.config.ts).
 */
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootGate } from '@/components/common/BootSequence';
import { KeyboardProvider } from '@/components/common/keyboard';
import { MotionConfig } from '@/components/common/motion';
import { useAppFonts } from '@/components/common/useAppFonts';
import { setHapticsEnabled } from '@/services/haptics';
import { appBundle } from '@/store';
import { StoreProvider } from '@/store/react';
import { colors } from '@/theme';

/**
 * Crash safety net: Expo Router shows this instead of the app when a screen
 * throws while rendering (components/common/CrashScreen.tsx).
 */
export { CrashScreen as ErrorBoundary } from '@/components/common/CrashScreen';

export default function RootLayout() {
  // Keep the haptics service in step with the "Haptics" setting.
  useEffect(() => {
    const { store } = appBundle;
    setHapticsEnabled(store.getState().settings.haptics);
    return store.subscribe((s) => s.settings.haptics, setHapticsEnabled);
  }, []);

  // Web only: wait for the font (useAppFonts.web.ts). Native has it built in, so this is instant.
  const fontsReady = useAppFonts();
  if (!fontsReady) return <View style={styles.root} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StoreProvider value={appBundle}>
        <KeyboardProvider>
          <SafeAreaProvider>
            {/* Light icons on black. The app draws edge-to-edge, so the Android
                navigation bar shows the black root background beneath it. */}
            <StatusBar style="light" />
            <MotionConfig />
            <BootGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: styles.root,
                  // A black background during transitions prevents white flashes.
                  animation: 'fade',
                }}
              />
            </BootGate>
          </SafeAreaProvider>
        </KeyboardProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
