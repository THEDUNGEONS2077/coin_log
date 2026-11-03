/**
 * app/line.tsx: add a line (PLAN F6) or edit one (F5).
 *
 *   > add line                         > edit line
 *   NAME    [Toiletries]               NAME    [Toiletries]
 *   [BUDGET][BILL]  [CREDIT][DEBIT]    (kind and side fixed once it has entries)
 *   AMOUNT  R [250]                    AMOUNT  R [250]   R120 SPENT SO FAR
 *   AFTER THIS: SPARE CREDIT R250      AFTER THIS: SPARE CREDIT R…
 *   [ ADD ]                            [ SAVE ]
 *
 * Layer: UI (Expo Router screen). Route params: `side` (add a line there)
 * or `id` (edit that line). A new line's amount is set aside from its side's
 * spare. An edited amount is also the line's default for the next cycle
 * (D27); for a budget it's the amount shown on the BUDGET tab, top-ups
 * included. Food changes its amount only (D23). Both refuse anything that
 * would leave spare or the line short (D3).
 *
 * A debit bill can have COMING IN (F15): someone else's share, which spare
 * doesn't have to cover until it arrives. Once it's been received this
 * cycle it's locked (delete the receipt in LOG to change it). Or it PAYS
 * THE CARD (F19): one bill per cycle, fixed once deductions are logged
 * against it.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, Checkbox, ExpectedFields, FormButton, FormPage, Missing, Preview, Segmented, TextField } from '@/components/form';
import { expectedDraftFrom, expectedProblems, NO_EXPECTED, takesExpected, toExpected } from '@/components/lines/drafts';
import {
  addLine,
  cardBill,
  editLine,
  knownPayers,
  type LinePatch,
  lineHasEntries,
  type LineState,
  payerKey,
  sideLabel,
  SIDES,
} from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { Expected, LineKind, Side } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, type } from '@/theme';

const KINDS = [
  { key: 'budget', label: 'BUDGET', a11y: 'Budget line: drawn down by transactions' },
  { key: 'bill', label: 'BILL', a11y: 'Bill: a fixed amount, ticked off when paid' },
] as const satisfies readonly { key: LineKind; label: string; a11y: string }[];
const SIDE_OPTIONS = SIDES.map((s) => ({ key: s, label: sideLabel(s) }));

/** Whether two expected amounts are the same (payer ignoring case, D33). */
const sameExpected = (a: Expected | null | undefined, b: Expected | null | undefined) =>
  (!a && !b) || (!!a && !!b && payerKey(a.payer) === payerKey(b.payer) && a.amount === b.amount);

export default function LineScreen() {
  const params = useLocalSearchParams<{ id?: string; side?: string }>();
  const { state } = useBudget();
  if (!state) return <Missing title="line" what="Set coin_log up first." />;
  if (params.id) {
    const current = state.lines.find((l) => l.line.id === params.id);
    if (!current) return <Missing title="edit line" what="That line isn't in this cycle any more." />;
    return <EditLine current={current} />;
  }
  return <AddLine initialSide={params.side === 'debit' ? 'debit' : 'credit'} />;
}

/** F6: a new line. */
function AddLine({ initialSide }: { initialSide: Side }) {
  const actions = useActions();
  const { ledger } = useBudget();
  const now = useMinute();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LineKind>('budget');
  const [side, setSide] = useState<Side>(initialSide);
  const [amountText, setAmountText] = useState('');
  const [coming, setComing] = useState(NO_EXPECTED);
  const [card, setCard] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);
  // PAYS THE CARD and COMING IN are for debit bills, one or the other (F15, F19).
  const paysCard = card && takesExpected(kind, side);
  const expected = paysCard ? null : toExpected(coming, kind, side);
  const comingProblem = !!expected && Object.values(expectedProblems(coming, amount)).some((p) => p !== null);
  const cardTaken = cardBill(ledger) !== null;

  const trial =
    amount === null || comingProblem
      ? null
      : addLine(ledger, { name: name || '?', kind, side, amount, expected, paysCard }, { newId: () => 'preview', now });
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;

  const confirm = () => {
    setTried(true);
    if (name.trim() === '' || amount === null || comingProblem) return setError('FILL IN THE MARKED FIELDS');
    const outcome = actions.addLine({ name, kind, side, amount, expected, paysCard });
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title="add line"
      closeLabel="Cancel"
      intro={`Its amount is set aside from spare ${sideLabel(side).toLowerCase()}, and it comes back every cycle.`}
      error={error}
      actions={<FormButton label="ADD" onPress={confirm} primary grow accessibilityLabel="Add the line" />}
    >
      <TextField
        label="NAME"
        value={name}
        onChange={setName}
        placeholder="e.g. Toiletries"
        autoFocus
        problem={tried && name.trim() === '' ? 'NEEDS A NAME' : null}
      />
      <Segmented options={KINDS} value={kind} onChange={setKind} accessibilityLabel="Kind" />
      <Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} accessibilityLabel="Side" />
      <AmountField
        label={kind === 'bill' ? 'BILL AMOUNT' : 'AMOUNT THIS CYCLE'}
        value={amountText}
        onChange={setAmountText}
        problem={tried && amount === null ? 'ENTER A WHOLE RAND AMOUNT' : null}
      />
      {takesExpected(kind, side) && !coming.on && !cardTaken && (
        <Checkbox checked={card} onChange={setCard} label="PAYS THE CARD" spoken="This bill settles the credit card's deductions" />
      )}
      {takesExpected(kind, side) && !paysCard && (
        <ExpectedFields
          value={coming}
          onChange={setComing}
          bill={amount}
          payers={knownPayers(ledger)}
          showProblems={tried}
          name={name.trim() || 'New line'}
        />
      )}
      <Preview
        problem={amount === null ? 'ENTER THE AMOUNT' : comingProblem ? 'FILL IN COMING IN' : trial && !trial.ok ? trial.error : null}
        lines={after ? [`SPARE ${sideLabel(side)} ${formatRand(after.spare[side])}`] : []}
      />
    </FormPage>
  );
}

/** F5: an existing line. */
function EditLine({ current }: { current: LineState }) {
  const actions = useActions();
  const { ledger, cycle } = useBudget();
  const { line } = current;
  // A budget's amount as the BUDGET tab shows it: top-ups included.
  const shown = line.kind === 'budget' ? current.allocated : line.amount;
  const [name, setName] = useState(line.name);
  const [kind, setKind] = useState<LineKind>(line.kind);
  const [side, setSide] = useState<Side>(line.side);
  const [amountText, setAmountText] = useState(String(shown));
  const [coming, setComing] = useState(() => expectedDraftFrom(line.expected));
  const [card, setCard] = useState(!!line.paysCard);
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);
  const fixed = line.isFood || lineHasEntries(cycle!, line.id);
  // Received this cycle: what came in is settled, so COMING IN can't change (F15).
  const locked = current.received;
  // PAYS THE CARD can't change once there are deductions; another bill may already have it (F19).
  const cardFixed = current.deducted > 0 || !!line.carried;
  const cardTaken = (cardBill(ledger)?.id ?? line.id) !== line.id;
  const paysCard = card && takesExpected(kind, side);
  const expected = locked ? line.expected : paysCard ? null : toExpected(coming, kind, side);
  const comingProblem = !locked && !!expected && Object.values(expectedProblems(coming, amount)).some((p) => p !== null);

  /** Only what changed (Food: its amount only). */
  const patch = (): LinePatch => ({
    ...(!line.isFood && name !== line.name && { name }),
    ...(!fixed && kind !== line.kind && { kind }),
    ...(!fixed && side !== line.side && { side }),
    ...(amount !== null && amount !== shown && { amount }),
    ...(!locked && !sameExpected(expected, line.expected) && { expected }),
    ...(paysCard !== !!line.paysCard && { paysCard }),
  });
  const trial = amount === null || comingProblem ? null : editLine(ledger, line.id, patch());
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;

  const confirm = () => {
    if (amount === null) return setError('ENTER A WHOLE RAND AMOUNT');
    if (comingProblem) return setError('FILL IN COMING IN');
    if (!line.isFood && name.trim() === '') return setError('EVERY LINE NEEDS A NAME (UP TO 40 CHARACTERS)');
    const changes = patch();
    if (Object.keys(changes).length === 0) return router.back();
    const outcome = actions.editLine(line.id, changes);
    if (outcome) return setError(outcome);
    haptics.check();
    router.back();
  };

  return (
    <FormPage
      title={line.isFood ? 'edit food' : 'edit line'}
      closeLabel="Cancel"
      intro="The new amount is this line's default for the next cycles too."
      error={error}
      actions={<FormButton label="SAVE" onPress={confirm} primary grow accessibilityLabel="Save the line" />}
    >
      {line.isFood ? (
        <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          FOOD · CREDIT BUDGET
        </Text>
      ) : (
        <>
          <TextField label="NAME" value={name} onChange={setName} problem={name.trim() === '' ? 'NEEDS A NAME' : null} />
          <Segmented options={KINDS} value={kind} onChange={setKind} accessibilityLabel="Kind" disabled={fixed} />
          <Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} accessibilityLabel="Side" disabled={fixed} />
          {fixed && (
            <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              KIND AND SIDE ARE FIXED ONCE A LINE HAS ENTRIES
            </Text>
          )}
        </>
      )}
      <AmountField
        label={line.kind === 'bill' ? 'BILL AMOUNT' : 'AMOUNT THIS CYCLE'}
        value={amountText}
        onChange={setAmountText}
        hint={line.kind === 'budget' && current.spent > 0 ? `${formatRand(current.spent)} SPENT SO FAR: IT CAN'T GO LOWER` : undefined}
        problem={amount === null ? 'ENTER A WHOLE RAND AMOUNT' : null}
      />
      {line.paysCard && cardFixed ? (
        <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {line.carried
            ? 'PAYS THE CARD · CARRIED FROM LAST CYCLE'
            : `PAYS THE CARD · ${formatRand(current.deducted)} DEDUCTED: TO TURN IT OFF, DELETE THE DEDUCTIONS IN LOG`}
        </Text>
      ) : (
        takesExpected(kind, side) &&
        !coming.on &&
        !cardTaken && (
          <Checkbox checked={card} onChange={setCard} label="PAYS THE CARD" spoken={`${line.name}: settles the credit card's deductions`} />
        )
      )}
      {paysCard ? null : locked && line.expected ? (
        <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${line.expected.payer.toUpperCase()} ${formatRand(line.expected.amount)} RECEIVED THIS CYCLE · TO CHANGE IT, DELETE THE RECEIPT IN LOG`}
        </Text>
      ) : (
        takesExpected(kind, side) && (
          <ExpectedFields value={coming} onChange={setComing} bill={amount} payers={knownPayers(ledger)} showProblems name={line.name} />
        )
      )}
      <Preview
        problem={comingProblem ? 'FILL IN COMING IN' : trial && !trial.ok ? trial.error : null}
        lines={
          after ? SIDES.filter((s) => s === side || s === line.side).map((s) => `SPARE ${sideLabel(s)} ${formatRand(after.spare[s])}`) : []
        }
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
