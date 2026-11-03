/**
 * app/tick.tsx: tick a bill off (PLAN F3), or change an earlier tick (F10).
 *
 *   > tick off
 *   RENT · DEBIT BILL R4 000
 *   PAID  R [4000]
 *   AFTER THIS: PAID AS PLANNED · SPARE DEBIT R1 000
 *   [ PAID ]
 *
 * Layer: UI (Expo Router screen). Route params: `line` (tick that bill off)
 * or `entry` (change that tick, from LOG). PAID starts at the bill's amount
 * (D7: always confirmed); paying less sends the rest back to spare, paying
 * more takes the extra from spare (refused if spare can't cover it, D3).
 *
 * A bill with someone else's share still due can't be ticked off (D35):
 * the page says so and offers RECEIVE instead. The PAYS THE CARD bill
 * settles the card instead (F21): PAID TO THE CARD, prefilled with what's
 * been deducted, moves from debit into credit.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview } from '@/components/form';
import { describeDue, payerKey, sideLabel, tickBill } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { TickEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

export default function TickScreen() {
  const params = useLocalSearchParams<{ line?: string; entry?: string }>();
  const { cycle, state } = useBudget();
  const entry = params.entry ? cycle?.entries.find((e): e is TickEntry => e.id === params.entry && e.type === 'tick') : undefined;
  const lineId = entry?.lineId ?? params.line;
  const lineState = state?.lines.find((l) => l.line.id === lineId);
  if (!lineState || lineState.line.kind !== 'bill' || (params.entry && !entry)) {
    return <Missing title="tick off" what="That bill isn't in this cycle any more." />;
  }
  if (!entry && lineState.paid) return <Missing title="tick off" what={`${lineState.line.name.toUpperCase()} is already paid.`} />;
  if (!entry && lineState.due > 0 && lineState.line.expected) {
    const { payer } = lineState.line.expected;
    return (
      <FormPage
        title="tick off"
        closeLabel="Cancel"
        intro={`${lineState.line.name} can be ticked off once ${payer}'s share has come in. To pay all of it yourself instead, edit the bill and untick COMING IN.`}
        actions={
          <FormButton
            label="RECEIVE"
            onPress={() => router.replace({ pathname: '/receive', params: { key: `bills:${payerKey(payer)}` } })}
            primary
            grow
            accessibilityLabel={`Receive ${payer}'s money`}
          />
        }
      >
        <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${describeDue(payer, lineState.due)} ON ${lineState.line.name.toUpperCase()}`}
        </Text>
      </FormPage>
    );
  }
  return <TickForm lineId={lineState.line.id} entry={entry} />;
}

function TickForm({ lineId, entry }: { lineId: string; entry?: TickEntry }) {
  const { state } = useBudget();
  if (state!.lines.find((l) => l.line.id === lineId)!.line.paysCard) return <SettleForm lineId={lineId} entry={entry} />;
  return <BillForm lineId={lineId} entry={entry} />;
}

/** An ordinary bill: what was paid against its amount (F3). */
function BillForm({ lineId, entry }: { lineId: string; entry?: TickEntry }) {
  const actions = useActions();
  const { ledger, state } = useBudget();
  const now = useMinute();
  const line = state!.lines.find((l) => l.line.id === lineId)!.line;
  const [paidText, setPaidText] = useState(String(entry?.paid ?? line.amount));
  const [error, setError] = useState<string | null>(null);
  const paid = parseRand(paidText);

  // The same builder CONFIRM runs, as a preview.
  const trial = paid === null ? null : tickBill(ledger, lineId, paid, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;
  const difference = paid === null ? 0 : line.amount - paid;
  const side = sideLabel(line.side);

  const confirm = () => {
    if (paid === null) return setError('ENTER WHAT WAS PAID');
    const outcome = actions.tickBill(lineId, paid, entry?.id);
    if (outcome) return setError(outcome);
    haptics.check();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit payment' : 'tick off'}
      closeLabel="Cancel"
      error={error}
      actions={
        <FormButton
          label={entry ? 'SAVE' : 'PAID'}
          onPress={confirm}
          primary
          grow
          accessibilityLabel={entry ? 'Save' : 'Paid: tick it off'}
        />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${line.name.toUpperCase()} · ${side} BILL ${formatRand(line.amount)}`}
      </Text>
      <AmountField label="PAID" value={paidText} onChange={setPaidText} hint="What actually went off" autoFocus={!!entry} />
      <Preview
        problem={paid === null ? 'ENTER WHAT WAS PAID' : trial && !trial.ok ? trial.error : null}
        lines={[
          difference > 0
            ? `${formatRand(difference)} GOES BACK TO SPARE ${side}`
            : difference < 0
              ? `${formatRand(-difference)} MORE COMES FROM SPARE ${side}`
              : 'PAID AS PLANNED',
          ...(after ? [`SPARE ${side} ${formatRand(after.spare[line.side])}`] : []),
        ]}
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  bright: { color: colors.textBright, ...platformText },
});

/**
 * The card settlement (F21): what's paid from debit into credit, prefilled
 * with what's been deducted. Paying more than that adds the extra to spare
 * credit; paying less takes the gap from it (D41). On debit, whatever the
 * bill set aside beyond what's paid goes back to spare.
 */
function SettleForm({ lineId, entry }: { lineId: string; entry?: TickEntry }) {
  const actions = useActions();
  const { ledger, state } = useBudget();
  const now = useMinute();
  const current = state!.lines.find((l) => l.line.id === lineId)!;
  const { line, deducted } = current;
  const [paidText, setPaidText] = useState(String(entry?.paid ?? deducted));
  const [error, setError] = useState<string | null>(null);
  const paid = parseRand(paidText);

  const trial = paid === null ? null : tickBill(ledger, lineId, paid, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;
  const difference = paid === null ? 0 : paid - deducted;

  const confirm = () => {
    if (paid === null) return setError('ENTER WHAT YOU PAID TO THE CARD');
    const outcome = actions.tickBill(lineId, paid, entry?.id);
    if (outcome) return setError(outcome);
    haptics.check();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit settlement' : 'settle card'}
      closeLabel="Cancel"
      intro="Pays the card from debit: credit goes back up by what you pay."
      error={error}
      actions={
        <FormButton
          label={entry ? 'SAVE' : 'SETTLED'}
          onPress={confirm}
          primary
          grow
          accessibilityLabel={entry ? 'Save' : 'Settled: pay the card'}
        />
      }
    >
      <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${line.name.toUpperCase()} · SET ASIDE ${formatRand(line.amount)} · DEDUCTED ${formatRand(deducted)}`}
      </Text>
      <AmountField label="PAID TO THE CARD" value={paidText} onChange={setPaidText} hint="From debit" autoFocus={!!entry} />
      <Preview
        problem={paid === null ? 'ENTER WHAT YOU PAID TO THE CARD' : trial && !trial.ok ? trial.error : null}
        lines={[
          difference > 0
            ? `${formatRand(difference)} MORE THAN DEDUCTED GOES TO SPARE CREDIT`
            : difference < 0
              ? `${formatRand(-difference)} SHORT COMES FROM SPARE CREDIT`
              : 'SETTLES WHAT WAS DEDUCTED',
          ...(after
            ? [
                `CREDIT AVAILABLE ${formatRand(after.balance.credit)}`,
                `SPARE CREDIT ${formatRand(after.spare.credit)}`,
                `SPARE DEBIT ${formatRand(after.spare.debit)}`,
              ]
            : []),
        ]}
      />
    </FormPage>
  );
}
