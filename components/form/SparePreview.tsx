/**
 * components/form/SparePreview.tsx: what spare will be once the form is
 * confirmed (F0, F1's live preview).
 *
 *   SPARE CREDIT        SPARE DEBIT
 *   R500                −R200   SHORT
 *
 * Layer: UI. The top panel's totals, a size smaller. A side that would be
 * below zero shows its amount with SHORT: the form can't be confirmed until
 * the lines are reduced (PLAN D3).
 */
import { StyleSheet, Text, View } from 'react-native';

import { sideLabel, SIDES } from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import type { Side } from '@/lib/types';
import { colors, glowTextSoft, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** Each side's spare after the form, side by side. */
export function SparePreview({ spare }: { spare: Record<Side, number> }) {
  return (
    <View style={styles.row}>
      {SIDES.map((side) => {
        const short = spare[side] < 0;
        const label = `SPARE ${sideLabel(side)}`;
        return (
          <View
            key={side}
            style={styles.total}
            accessible
            accessibilityLabel={`${label} would be ${formatRand(spare[side])}${short ? ', short' : ''}`}
          >
            <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {label}
            </Text>
            <Text style={[type.body, short ? styles.short : styles.amount]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {formatRand(spare[side])}
              {short ? '  SHORT' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.lg },
  total: { flex: 1 },
  amount: { color: colors.accent, ...glowTextSoft, ...platformText },
  // Short: bright, so it stands out without a second hue (red is the payday line's alone).
  short: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
