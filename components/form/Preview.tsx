/**
 * components/form/Preview.tsx: what a form will do, before it's confirmed.
 *
 *   AFTER THIS ━━━━━━━──────
 *   FOOD R1 900 LEFT
 *   SPARE CREDIT R300
 *
 * or, when the amount can't work:
 *
 *   AFTER THIS ━━━━━━━──────
 *   > SPARE CREDIT WOULD BE SHORT BY R100
 *
 * Layer: UI. Forms work out the preview by running the same builder the
 * confirm button runs (lib/ledger.ts), on the side, so what's shown is
 * exactly what will happen, including a refusal (PLAN D3).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Prompted } from '@/components/common/Prompted';
import { Rule } from '@/components/common/Rule';
import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

interface Props {
  /** One line each: "FOOD R1 900 LEFT". */
  lines: string[];
  /** Why it can't be done as entered; shown instead of the lines. */
  problem?: string | null;
}

/** AFTER THIS, then the outcome lines (or the problem). */
export function Preview({ lines, problem }: Props) {
  return (
    <View style={styles.wrap} accessible accessibilityLiveRegion="polite" accessibilityLabel={`After this: ${problem ?? lines.join(', ')}`}>
      <View style={styles.head}>
        <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          AFTER THIS
        </Text>
        <Rule />
      </View>
      {problem ? (
        <Text style={[type.body, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          <Prompted>{problem}</Prompted>
        </Text>
      ) : (
        lines.map((l) => (
          <Text key={l} style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {l}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
