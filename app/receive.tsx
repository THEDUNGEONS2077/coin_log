/**
 * app/receive.tsx: expected money arriving (PLAN F16), or a change to an
 * earlier receipt (F10).
 *
 *   > receive
 *   FROM PARTNER · INTO DEBIT
 *   RENT                         R5 000
 *   INTERNET                       R400
 *   EXPECTED                     R5 400
 *   RECEIVED  R [5400]
 *   AFTER THIS: AS EXPECTED · SPARE DEBIT R14 600
 *   [ RECEIVED ]
 *
 * Layer: UI (Expo Router screen). Route params: `key` (receive that Due,
 * lib/ledger.ts `dues`: one payer's bill shares, or an amount carried over
 * from last cycle) or `entry` (change what arrived on that receipt; what it
 * covers stays). RECEIVED starts at what's expected; when a different amount
 * arrives, the difference lands in spare debit, or comes out of it (D34),
 * refused if spare can't cover it (D3).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview } from '@/components/form';
import { dues, expectedOf, lineName, receive } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { Cycle, ReceiveEntry, Share } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** What the form receives: a payer, what it covers, and what's expected. */
interface Target {
  payer: string;
  shares: Share[];
  /** Money carried over from last cycle, not tied to a bill. */
  carried: boolean;
  expected: number;
}

export default function ReceiveScreen() {
  const params = useLocalSearchParams<{ key?: string; entry?: string }>();
  const { cycle } = useBudget();
  if (!cycle) return <Missing title="receive" what="Set coin_log up first." />;

  if (params.entry) {
    const entry = cycle.entries.find((e): e is ReceiveEntry => e.id === params.entry && e.type === 'receive');
    if (!entry || entry.beforeStart) return <Missing title="edit receipt" what="That entry isn't in this cycle any more." />;
    const target = { payer: entry.payer, shares: entry.shares, carried: !!entry.carryId, expected: expectedOf(entry, cycle) };
    return <ReceiveForm cycle={cycle} target={target} dueKey="" entry={entry} />;
  }

  const due = dues(cycle).find((d) => d.key === params.key);
  if (!due) return <Missing title="receive" what="Nothing is due from them now: it may have been received already." />;
  const target = { payer: due.payer, shares: due.shares, carried: !!due.carryId, expected: due.amount };
  return <ReceiveForm cycle={cycle} target={target} dueKey={due.key} />;
}

function ReceiveForm({ cycle, target, dueKey, entry }: { cycle: Cycle; target: Target; dueKey: string; entry?: ReceiveEntry }) {
  const actions = useActions();
  const { ledger } = useBudget();
  const now = useMinute();
  const [amountText, setAmountText] = useState(String(entry?.amount ?? target.expected));
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);

  // The same builder CONFIRM runs, as a preview.
  const trial = amount === null || amount === 0 ? null : receive(ledger, dueKey, amount, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;
  const difference = amount === null ? 0 : amount - target.expected;

  const confirm = () => {
    if (amount === null || amount === 0) return setError('ENTER WHAT ARRIVED (ABOVE R0)');
    const outcome = actions.receive(dueKey, amount, entry?.id);
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit receipt' : 'receive'}
      closeLabel="Cancel"
      intro={
        target.carried
          ? 'Carried over from last cycle: it goes to spare debit when it arrives.'
          : 'Their share was never counted against your spare, so receiving it leaves spare debit as it is.'
      }
      error={error}
      actions={
        <FormButton
          label={entry ? 'SAVE' : 'RECEIVED'}
          onPress={confirm}
          primary
          grow
          accessibilityLabel={entry ? 'Save' : 'Received: it arrived in debit'}
        />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`FROM ${target.payer.toUpperCase()} · INTO DEBIT`}
      </Text>
      <View style={styles.rows}>
        {target.carried ? (
          <Row label="FROM LAST CYCLE" amount={target.expected} />
        ) : (
          target.shares.map((sh) => <Row key={sh.lineId} label={lineName(cycle, sh.lineId).toUpperCase()} amount={sh.amount} />)
        )}
        {!target.carried && target.shares.length > 1 && <Row label="EXPECTED" amount={target.expected} bright />}
      </View>
      <AmountField label="RECEIVED" value={amountText} onChange={setAmountText} hint="What actually arrived" autoFocus={!!entry} />
      <Preview
        problem={amount === null || amount === 0 ? 'ENTER WHAT ARRIVED' : trial && !trial.ok ? trial.error : null}
        lines={[
          difference > 0
            ? `${formatRand(difference)} MORE THAN EXPECTED GOES TO SPARE DEBIT`
            : difference < 0
              ? `${formatRand(-difference)} SHORT COMES FROM SPARE DEBIT`
              : 'AS EXPECTED',
          ...(after ? [`SPARE DEBIT ${formatRand(after.spare.debit)}`] : []),
        ]}
      />
    </FormPage>
  );
}

/** One line of what's expected: name on the left, amount on the right. */
function Row({ label, amount, bright }: { label: string; amount: number; bright?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${formatRand(amount)}`}>
      <Text
        style={[type.body, bright ? styles.bright : styles.text, styles.grow]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {label}
      </Text>
      <Text style={[type.body, bright ? styles.accent : styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {formatRand(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
});
