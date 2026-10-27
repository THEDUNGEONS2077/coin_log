/**
 * components/common/Tabs.tsx: the main screen's tabs (PLAN D22).
 *
 *   [ BUDGET ][ LOG ][ SAVINGS ]
 *
 * Layer: UI. quest_log's quest tabs, unchanged in look: equal widths, a lit
 * frame for the selected one, a lit frame the moment a finger lands. The
 * open tab is remembered across launches. Switching is by tap only: a
 * horizontal pager would fight the rows' swipes.
 *
 * Instant (quest_log's responsiveness pass): a tapped tab lights up at once,
 * on its own light render; the switch itself (the heavier list) follows
 * once that frame is drawn.
 */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActions, useAppStore } from '@/store/react';
import type { Tab } from '@/store/uiState';
import { colors, glowShadow, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** The tabs in order, with their screen-reader names. */
const TABS: readonly { key: Tab; label: string; a11y: string }[] = [
  { key: 'budget', label: 'BUDGET', a11y: 'Budget lines' },
  { key: 'log', label: 'LOG', a11y: 'Log of every entry' },
  { key: 'savings', label: 'SAVINGS', a11y: 'Savings' },
];

export const Tabs = memo(function Tabs() {
  const tab = useAppStore((s) => s.ui.tab);
  const actions = useActions();
  // The tab just tapped, lit before the store and the list catch up (forgotten once they have).
  const [pending, setPending] = useState<Tab | null>(null);
  if (pending !== null && pending === tab) setPending(null);
  const shown = pending ?? tab;

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {TABS.map((t) => {
        const selected = shown === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (t.key === tab) return;
              setPending(t.key);
              afterPaint(() => actions.setTab(t.key));
            }}
            style={({ pressed }) => [styles.tab, selected ? styles.tabOn : pressed && styles.tabPressed]}
            // Half-height tabs (quest_log's), still 44 pt to tap.
            hitSlop={{ top: TAB_SLOP, bottom: TAB_SLOP }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // The web build reads only aria-selected (react-native-web ignores accessibilityState).
            aria-selected={selected}
            accessibilityLabel={t.a11y}
          >
            <Text
              style={[type.tab, styles.label, selected ? styles.bright : styles.dim]}
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

/**
 * Runs `fn` after the next frame has been drawn: the light render that lit a tab
 * reaches the screen before the heavy one (the new tab's list) starts.
 */
function afterPaint(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

/** A tab's drawn height (quest_log's half-height tabs). */
const TAB_HEIGHT = 26;
/** Extra touch area above and below, so a tab is still 44 pt to tap. */
const TAB_SLOP = Math.ceil((size.hitTarget - TAB_HEIGHT) / 2);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs + 2, marginHorizontal: space.lg, marginBottom: space.md },
  tab: {
    flex: 1,
    minHeight: TAB_HEIGHT,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  // Selected: accent frame on surface, with the faint glow.
  tabOn: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: glowShadow.faint },
  // Pressed (not yet selected): the header buttons' lit frame.
  tabPressed: { borderColor: colors.lineLit, backgroundColor: colors.surface },
  // A step smaller than the tab role, as on quest_log's quest tabs.
  label: { fontSize: 12, lineHeight: 16 },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
