/**
 * app/income.tsx: extra cash into debit (PLAN F9), or change an earlier one
 * (F10).
 *
 *   > cash in
 *   AMOUNT  R [500]
 *   LABEL   [REFUND] [SIDE INCOME] …  or type one
 *   AFTER THIS: SPARE DEBIT R1 500
 *   [ LOG ]
 *
 * Layer: UI (Expo Router screen). Route param `entry`: change that one.
 * The money goes to debit's spare (D13); from there it can be moved to
 * credit or savings (MOVE). A typed label becomes an income chip once it's
 * logged [P, like spend labels].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, LabelPicker, Missing, Preview } from '@/components/form';
import { income } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { IncomeEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useAppStore, useBudget } from '@/store/react';

export default function IncomeScreen() {
  const params = useLocalSearchParams<{ entry?: string }>();
  const { cycle } = useBudget();
  if (!cycle) return <Missing title="cash in" what="Set coin_log up first." />;
  const entry = params.entry ? cycle.entries.find((e): e is IncomeEntry => e.id === params.entry && e.type === 'income') : undefined;
  if (params.entry && !entry) return <Missing title="edit cash in" what="That entry isn't in this cycle any more." />;
  return <IncomeForm entry={entry} />;
}

function IncomeForm({ entry }: { entry?: IncomeEntry }) {
  const actions = useActions();
  const { ledger } = useBudget();
  const chips = useAppStore((s) => s.ledger.chips.income);
  const now = useMinute();
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);

  const trial =
    amount === null || amount === 0 ? null : income(ledger, amount, label.trim() || '?', { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;

  const confirm = () => {
    setTried(true);
    if (amount === null || amount === 0) return setError('ENTER AN AMOUNT ABOVE R0');
    if (label.trim() === '') return setError('ADD A LABEL');
    const outcome = actions.income(amount, label, entry?.id);
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit cash in' : 'cash in'}
      closeLabel="Cancel"
      intro="Extra money coming into your debit account."
      error={error}
      actions={
        <FormButton label={entry ? 'SAVE' : 'LOG'} onPress={confirm} primary grow accessibilityLabel={entry ? 'Save' : 'Log the cash in'} />
      }
    >
      <AmountField
        label="AMOUNT"
        value={amountText}
        onChange={setAmountText}
        autoFocus={!entry}
        problem={tried && (amount === null || amount === 0) ? 'ENTER AN AMOUNT ABOVE R0' : null}
      />
      <LabelPicker
        chips={chips}
        value={label}
        onChange={setLabel}
        placeholder="e.g. Refund"
        problem={tried && label.trim() === '' ? 'ADD A LABEL' : null}
      />
      <Preview
        problem={amount === null || amount === 0 ? 'ENTER AN AMOUNT ABOVE R0' : trial && !trial.ok ? trial.error : null}
        lines={after ? [`SPARE DEBIT ${formatRand(after.spare.debit)}`] : []}
      />
    </FormPage>
  );
}
