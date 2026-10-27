/**
 * app/index.tsx: the main screen (PLAN §4).
 *
 *   top panel   <R>_coin_log [⊛] · payday line · SPARE CR / SPARE DB · days to payday [⊕ SALARY]
 *               [ BUDGET ][ LOG ][ SAVINGS ]
 *   content     the open tab
 *   toast       LOGGED · UNDO (above the bottom bar)
 *   bottom bar  [ + LOG ] [ ↔ MOVE ] [ + IN ]
 *
 * Layer: UI (Expo Router screen). Composition only. The top panel never
 * scrolls; it's quest_log's lit terminal screen (Phosphor, LitEdge), with its
 * scanlines drifting while the screen is in view.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBooting } from '@/components/common/BootSequence';
import { BottomBar } from '@/components/common/BottomBar';
import { EmptyState } from '@/components/common/EmptyState';
import { Header } from '@/components/common/Header';
import { Phosphor } from '@/components/common/Phosphor';
import { LitEdge } from '@/components/common/Rule';
import { Tabs } from '@/components/common/Tabs';
import { TopStatus } from '@/components/common/TopStatus';
import { Onboarding } from '@/components/common/useOnboarding';
import { Toast } from '@/components/overlays/Toast';
import { useAppStore } from '@/store/react';
import { colors, shape, size, space } from '@/theme';

export default function MainScreen() {
  const insets = useSafeAreaInsets();
  // The list and the toast leave room for the bar that floats over the list.
  const [barHeight, setBarHeight] = useState<number>(size.hitTarget + space.lg + insets.bottom);
  const tab = useAppStore((s) => s.ui.tab);
  // While the boot screen covers the app, the panel's scanlines stay still (nothing to see, nothing to draw).
  const booting = useBooting();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* What's new after an update (draws nothing). */}
      <Onboarding />
      <View style={styles.content}>
        <View style={styles.topPanel}>
          <Phosphor animated={!booting} />
          <Header />
          <TopStatus />
          <Tabs />
          <LitEdge at="bottom" />
        </View>
        <View style={[styles.list, { paddingBottom: barHeight }]}>
          {tab === 'budget' && <EmptyState message="NO BUDGET LINES YET" cursor />}
          {tab === 'log' && <EmptyState message="NOTHING LOGGED YET" />}
          {tab === 'savings' && <EmptyState message="NO SAVINGS YET" />}
        </View>
      </View>
      <Toast bottom={barHeight + space.sm} />
      <BottomBar onHeight={setBarHeight} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Caps the width on large screens and split-screen.
  content: { flex: 1, width: '100%', maxWidth: size.maxContentWidth, alignSelf: 'center' },
  topPanel: { backgroundColor: colors.bg, borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  list: { flex: 1 },
});
