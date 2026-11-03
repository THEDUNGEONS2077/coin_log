/**
 * app/deduct.tsx: a deduction on the credit card (PLAN F20), or a change to
 * an earlier one (F10).
 *
 *   > deducted
 *   CARD SETTLEMENT · SET ASIDE R1 200
 *   AMOUNT  R [380]
 *   LABEL   [ INTEREST ] [ FEES ] …  or type one
 *   AFTER THIS: CREDIT AVAILABLE R9 620 · SPARE CREDIT R2 000 (UNCHANGED)
 *               R380 TO SETTLE
 *   [ DEDUCTED ]
 *
 * Layer: UI (Expo Router screen). Route params: `line` (the PAYS THE CARD
 * bill) or `entry` (change that deduction, from LOG). Credit goes down, but
 * the deduction is owed back to the card until the bill is settled, so spare
 * credit stays as it is (D39). The bill holds back at least what's been
 * deducted: past what was set aside, spare debit pays the difference
 * (refused if it can't, D3). The label is optional ("Card deduction");
 * labels used before are offered as chips [P].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, LabelPicker, Missing, Preview } from '@/components/form';
import { deduct, deductionLabels } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { DeductEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

export default function DeductScreen() {
  const params = useLocalSearchParams<{ line?: string; entry?: string }>();
  const { cycle, state } = useBudget();
  const entry = params.entry ? cycle?.entries.find((e): e is DeductEntry => e.id === params.entry && e.type === 'deduct') : undefined;
  const lineId = entry?.lineId ?? params.line;
  const lineState = state?.lines.find((l) => l.line.id === lineId);
  if (!lineState?.line.paysCard || (params.entry && (!entry || entry.origin))) {
    return <Missing title="deducted" what="That card settlement isn't in this cycle any more." />;
  }
  if (lineState.paid)
    return <Missing title="deducted" what="The card is already settled this cycle. Delete the settlement in LOG to add to it." />;
  return <DeductForm lineId={lineState.line.id} entry={entry} />;
}

function DeductForm({ lineId, entry }: { lineId: string; entry?: DeductEntry }) {
  const actions = useActions();
  const { ledger, state } = useBudget();
  const now = useMinute();
  const line = state!.lines.find((l) => l.line.id === lineId)!.line;
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);

  // The same builder the button runs, as a preview.
  const trial = amount === null || amount === 0 ? null : deduct(ledger, lineId, amount, label, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;
  const owed = after?.lines.find((l) => l.line.id === lineId)?.owed ?? null;

  const confirm = () => {
    setTried(true);
    if (amount === null || amount === 0) return setError('ENTER AN AMOUNT ABOVE R0');
    const outcome = actions.deduct(lineId, amount, label, entry?.id);
    if (outcome) return setError(outcome);
    haptics.check();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit deduction' : 'deducted'}
      closeLabel="Cancel"
      intro="Taken off your credit card: interest, fees, a budget-facility payment. It's owed back to the card until you settle it, so spare credit stays the same."
      error={error}
      actions={
        <FormButton
          label={entry ? 'SAVE' : 'DEDUCTED'}
          onPress={confirm}
          primary
          grow
          accessibilityLabel={entry ? 'Save' : 'Log the deduction'}
        />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${line.name.toUpperCase()} · SET ASIDE ${formatRand(line.amount)}`}
      </Text>
      <AmountField
        label="AMOUNT"
        value={amountText}
        onChange={setAmountText}
        autoFocus
        problem={tried && (amount === null || amount === 0) ? 'ENTER AN AMOUNT ABOVE R0' : null}
      />
      <LabelPicker
        chips={deductionLabels(ledger)}
        value={label}
        onChange={setLabel}
        placeholder="e.g. Interest (optional)"
        newHint={null}
      />
      <Preview
        problem={amount === null || amount === 0 ? 'ENTER AN AMOUNT ABOVE R0' : trial && !trial.ok ? trial.error : null}
        lines={
          after
            ? [
                `CREDIT AVAILABLE ${formatRand(after.balance.credit)}`,
                `SPARE CREDIT ${formatRand(after.spare.credit)}`,
                ...(owed !== null ? [`${formatRand(owed)} TO SETTLE FROM DEBIT`] : []),
                ...(owed !== null && owed > line.amount ? [`SPARE DEBIT ${formatRand(after.spare.debit)}`] : []),
              ]
            : []
        }
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  bright: { color: colors.textBright, ...platformText },
});
