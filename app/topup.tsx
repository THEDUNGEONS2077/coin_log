/**
 * app/topup.tsx: top a budget line up from its side's spare (PLAN F7), or
 * change an earlier top-up (F10).
 *
 *   > top up
 *   FOOD · R1 700 LEFT
 *   FROM SPARE CREDIT: R500 AVAILABLE
 *   AMOUNT  R [200]
 *   AFTER THIS: FOOD R1 900 LEFT · SPARE CREDIT R300
 *   [ TOP UP ]
 *
 * Layer: UI (Expo Router screen). Route params: `line` (top it up) or
 * `entry` (change that top-up, from LOG). The money comes only from the
 * same side's spare (D13); this cycle only, so next cycle's default stays.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview } from '@/components/form';
import { sideLabel, topUp } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { TopUpEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

export default function TopUpScreen() {
  const params = useLocalSearchParams<{ line?: string; entry?: string }>();
  const { cycle, state } = useBudget();
  const entry = params.entry ? cycle?.entries.find((e): e is TopUpEntry => e.id === params.entry && e.type === 'topup') : undefined;
  const lineId = entry?.lineId ?? params.line;
  const lineState = state?.lines.find((l) => l.line.id === lineId);
  if (!lineState || lineState.line.kind !== 'budget' || (params.entry && !entry)) {
    return <Missing title="top up" what="That budget line isn't in this cycle any more." />;
  }
  return <TopUpForm lineId={lineState.line.id} entry={entry} />;
}

function TopUpForm({ lineId, entry }: { lineId: string; entry?: TopUpEntry }) {
  const actions = useActions();
  const { ledger, state } = useBudget();
  const now = useMinute();
  const current = state!.lines.find((l) => l.line.id === lineId)!;
  const { line } = current;
  const side = sideLabel(line.side);
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);
  // Editing: the old top-up's money counts as available again.
  const available = state!.spare[line.side] + (entry?.amount ?? 0);

  // The same builder TOP UP runs, as a preview.
  const trial = amount === null || amount === 0 ? null : topUp(ledger, lineId, amount, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;
  const afterLine = after?.lines.find((l) => l.line.id === lineId);

  const confirm = () => {
    if (amount === null || amount === 0) return setError('ENTER AN AMOUNT ABOVE R0');
    const outcome = actions.topUp(lineId, amount, entry?.id);
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit top-up' : 'top up'}
      closeLabel="Cancel"
      error={error}
      actions={
        <FormButton label={entry ? 'SAVE' : 'TOP UP'} onPress={confirm} primary grow accessibilityLabel={entry ? 'Save' : 'Top up'} />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${line.name.toUpperCase()} · ${formatRand(current.left)} LEFT`}
      </Text>
      <Text style={[type.meta, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`FROM SPARE ${side}: ${formatRand(available)} AVAILABLE`}
      </Text>
      <AmountField label="AMOUNT" value={amountText} onChange={setAmountText} autoFocus />
      <Preview
        problem={amount === null || amount === 0 ? 'ENTER AN AMOUNT ABOVE R0' : trial && !trial.ok ? trial.error : null}
        lines={
          after && afterLine
            ? [`${line.name.toUpperCase()} ${formatRand(afterLine.left)} LEFT`, `SPARE ${side} ${formatRand(after.spare[line.side])}`]
            : []
        }
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
});
