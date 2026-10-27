/**
 * components/savings/SavingsView.tsx: the SAVINGS tab (PLAN D17, F8, F14).
 *
 *   SAVINGS
 *   R12 250
 *   [ → DEBIT ][ → CREDIT ]
 *   [ ← FROM DEBIT ][ SET BALANCE ]
 *   HISTORY ━━━━━━━───────
 *   NOV 25  ⊕ SALARY            +R3 000
 *   OCT 27  ▸ START             +R8 000
 *
 * Layer: UI. The running total across every cycle, the four things that
 * move it (MOVE with the route set, SET BALANCE), and every entry that ever
 * changed it, newest first, each showing what it did to savings. Rows in
 * the current cycle can be changed or deleted, as on LOG (F10).
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { FormButton } from '@/components/form';
import { EntryRow } from '@/components/log/EntryRow';
import { savingsHistory } from '@/lib/entries';
import { currentCycle } from '@/lib/ledger';
import { formatDelta, formatRand } from '@/lib/money';
import type { MoveRoute } from '@/lib/types';
import { useBudget } from '@/store/react';
import { colors, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** Opens MOVE with a route already chosen. */
const openMove = (route: MoveRoute) => router.push({ pathname: '/move', params: { route } });

export function SavingsView({ bottomInset }: { bottomInset: number }) {
  const { ledger, savings } = useBudget();
  const now = useMinute();
  const history = useMemo(() => savingsHistory(ledger), [ledger]);
  const current = currentCycle(ledger);

  const top = (
    <View style={styles.top}>
      <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        SAVINGS
      </Text>
      <Text
        style={[type.title, styles.total]}
        accessibilityLabel={`Savings: ${formatRand(savings)}`}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {formatRand(savings)}
      </Text>
      <View style={styles.buttons}>
        <FormButton
          label={`${glyphs.next.glyph} DEBIT`}
          onPress={() => openMove('savings-debit')}
          grow
          accessibilityLabel="Move savings to debit"
        />
        <FormButton
          label={`${glyphs.next.glyph} CREDIT`}
          onPress={() => openMove('savings-credit')}
          grow
          accessibilityLabel="Move savings to credit"
        />
      </View>
      <View style={styles.buttons}>
        <FormButton
          label={`${glyphs.back.glyph} FROM DEBIT`}
          onPress={() => openMove('debit-savings')}
          grow
          accessibilityLabel="Put spare debit into savings"
        />
        <FormButton label="SET BALANCE" onPress={() => router.push('/savings-set')} grow accessibilityLabel="Set the savings balance" />
      </View>
      <View style={styles.head}>
        <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
          HISTORY
        </Text>
        <Rule lit />
      </View>
    </View>
  );

  return (
    <FlatList
      data={history}
      keyExtractor={(item) => item.entry.id}
      ListHeaderComponent={top}
      ListEmptyComponent={<EmptyState message="NOTHING HAS CHANGED SAVINGS YET" />}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      renderItem={({ item }) => (
        <EntryRow cycle={item.cycle} entry={item.entry} current={item.cycle === current} now={now} amount={formatDelta(item.delta)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  total: { color: colors.accent, ...glowTextSoft, ...platformText },
  buttons: { flexDirection: 'row', gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
