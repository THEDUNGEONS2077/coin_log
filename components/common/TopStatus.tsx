/**
 * components/common/TopStatus.tsx: the money at the top of the main screen
 * (PLAN D22, D24, F12).
 *
 *   You Got Paid, Load Salary Now                 ← red, from the pay date on
 *   SPARE CR            SPARE DB
 *   R500                R1 240
 *   12 DAYS TO PAYDAY · WED NOV 25      [ ⊕ SALARY ]
 *
 * Layer: UI. Spare credit and spare debit are the money not held back by
 * any line (D4), shown large and lit: they're what the app is for. The
 * payday line is the one red thing in the app (D24); it and the day count
 * follow the clock (useMinute), so they change at midnight without a
 * restart. Tapping the payday line or SALARY opens the salary load (F1).
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay } from '@/lib/dates';
import { sideLabel } from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import { isPaydayDue, paydayLabel } from '@/lib/payday';
import type { Side } from '@/lib/types';
import { useBudget } from '@/store/react';
import { colors, glowShadow, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { useMinute } from './useMinute';

/** The payday line's exact words (PLAN D24). */
export const PAYDAY_MESSAGE = 'You Got Paid, Load Salary Now';

export const TopStatus = memo(function TopStatus() {
  const { cycle, state } = useBudget();
  const now = useMinute();
  const due = cycle !== null && isPaydayDue(cycle.payDate, now);

  return (
    <View style={styles.wrap}>
      {due && (
        <Pressable
          onPress={() => router.push('/load-salary')}
          style={styles.payday}
          accessibilityRole="button"
          accessibilityLabel={`${PAYDAY_MESSAGE}. Opens the salary load.`}
        >
          {({ pressed }) => (
            <Text style={[type.meta, styles.paydayText, pressed && styles.paydayPressed]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {PAYDAY_MESSAGE}
            </Text>
          )}
        </Pressable>
      )}

      <View style={styles.totals}>
        {(['credit', 'debit'] as const).map((side) => (
          <Total key={side} side={side} amount={state?.spare[side] ?? null} />
        ))}
      </View>

      <View style={styles.statusRow}>
        <Text style={[type.meta, styles.dim, styles.grow]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {cycle ? `${paydayLabel(cycle.payDate, now)} · ${formatDay(cycle.payDate, now)}` : 'NOT SET UP YET'}
        </Text>
        <Pressable
          onPress={() => router.push('/load-salary')}
          disabled={cycle === null}
          style={({ pressed }) => [styles.salary, pressed && styles.salaryPressed]}
          hitSlop={SALARY_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Load salary"
        >
          <Text style={[type.meta, cycle ? styles.accent : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`${glyphs.salary.glyph} SALARY`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

/** One side's spare: its label, then the amount, large and lit. */
function Total({ side, amount }: { side: Side; amount: number | null }) {
  const label = `SPARE ${sideLabel(side)}`;
  return (
    <View style={styles.total} accessible accessibilityLabel={`${label}: ${amount === null ? 'not set up' : formatRand(amount)}`}>
      <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
      <Text
        style={[type.display, styles.amount]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {amount === null ? '—' : formatRand(amount)}
      </Text>
    </View>
  );
}

/** The SALARY button's drawn height; hitSlop brings it to 44 pt. */
const SALARY_HEIGHT = 26;
const SALARY_SLOP = Math.ceil((size.hitTarget - SALARY_HEIGHT) / 2);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  // Subtle (D24): a small line in the alert red, no frame, no glow.
  payday: { minHeight: size.hitTarget, justifyContent: 'center' },
  paydayText: { color: colors.alert, ...platformText },
  paydayPressed: { textDecorationLine: 'underline' },
  totals: { flexDirection: 'row', gap: space.lg },
  total: { flex: 1 },
  // The two numbers the app is for: large, lit, glowing softly.
  amount: { color: colors.accent, ...glowTextSoft, ...platformText },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  salary: {
    minHeight: SALARY_HEIGHT,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  salaryPressed: { backgroundColor: colors.surface, borderColor: colors.lineLit, boxShadow: glowShadow.faint },
  accent: { color: colors.accent, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
