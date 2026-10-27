/**
 * app/savings-set.tsx: savings SET BALANCE (PLAN F14), or change an earlier
 * one (F10).
 *
 *   > set savings
 *   SAVINGS NOW: R8 000
 *   REAL TOTAL  R [8300]
 *   AFTER THIS: SAVINGS R8 300 (+R300 LOGGED)
 *   [ SET ]
 *
 * Layer: UI (Expo Router screen). Route param `entry`: change that
 * adjustment. For corrections the moves don't cover (interest, a mistake):
 * the difference is logged as an ADJUST entry. Changing one re-aims it, so
 * savings end at the new total [P].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview } from '@/components/form';
import { savingsDelta, setSavings } from '@/lib/ledger';
import { formatDelta, formatRand, parseRand } from '@/lib/money';
import type { AdjustEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

export default function SavingsSetScreen() {
  const params = useLocalSearchParams<{ entry?: string }>();
  const { cycle } = useBudget();
  if (!cycle) return <Missing title="set savings" what="Set coin_log up first." />;
  const entry = params.entry ? cycle.entries.find((e): e is AdjustEntry => e.id === params.entry && e.type === 'adjust') : undefined;
  if (params.entry && !entry) return <Missing title="edit savings" what="That adjustment isn't in this cycle any more." />;
  return <SetForm entry={entry} />;
}

function SetForm({ entry }: { entry?: AdjustEntry }) {
  const actions = useActions();
  const { ledger, savings } = useBudget();
  const now = useMinute();
  const [totalText, setTotalText] = useState(String(entry?.setTo ?? savings));
  const [error, setError] = useState<string | null>(null);
  const total = parseRand(totalText);
  // Savings without the adjustment being changed (all of them for a new one).
  const without = savings - (entry ? savingsDelta(entry) : 0);

  const trial = total === null ? null : setSavings(ledger, total, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger) : null;

  const confirm = () => {
    if (total === null) return setError('ENTER THE REAL TOTAL');
    const outcome = actions.setSavings(total, entry?.id);
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit savings' : 'set savings'}
      closeLabel="Cancel"
      intro="For what the moves don't cover, like interest or a mistake. The difference is logged."
      error={error}
      actions={
        <FormButton label={entry ? 'SAVE' : 'SET'} onPress={confirm} primary grow accessibilityLabel={entry ? 'Save' : 'Set savings'} />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {entry ? `WITHOUT THIS ADJUSTMENT: ${formatRand(without)}` : `SAVINGS NOW: ${formatRand(savings)}`}
      </Text>
      <AmountField label="REAL TOTAL" value={totalText} onChange={setTotalText} autoFocus />
      <Preview
        problem={total === null ? 'ENTER THE REAL TOTAL' : trial && !trial.ok ? trial.error : null}
        lines={after && total !== null ? [`SAVINGS ${formatRand(after.savings)}`, `${formatDelta(total - without)} LOGGED`] : []}
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  bright: { color: colors.textBright, ...platformText },
});
