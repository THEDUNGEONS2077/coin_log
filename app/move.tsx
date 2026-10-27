/**
 * app/move.tsx: move money between debit, credit and savings (PLAN F8), or
 * change an earlier move (F10).
 *
 *   > move money
 *   [ DEBIT → CREDIT ][ DEBIT → SAVINGS ]
 *   [ SAVINGS → DEBIT ][ SAVINGS → CREDIT ]
 *   FROM SPARE DEBIT: R1 000 AVAILABLE
 *   AMOUNT  R [400]
 *   AFTER THIS: SPARE DEBIT R600 · SPARE CREDIT R900
 *   [ MOVE ]
 *
 * Layer: UI (Expo Router screen). Route params: `route` (preset, from the
 * SAVINGS tab's buttons) or `entry` (change that move, from LOG). Money
 * leaves spare debit or savings, never a line; refused when the source
 * hasn't got it (D3).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview, Segmented } from '@/components/form';
import { deleteEntry, move, MOVE_ROUTES, routeEnds, routeLabel, sideLabel } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { MoveEntry, MoveRoute, Side } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, type Budget, useActions, useBudget } from '@/store/react';
import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** The routes as options, two to a row. */
const OPTIONS = MOVE_ROUTES.map((r) => ({ key: r, label: routeLabel(r) }));

export default function MoveScreen() {
  const params = useLocalSearchParams<{ route?: string; entry?: string }>();
  const { cycle } = useBudget();
  if (!cycle) return <Missing title="move money" what="Set coin_log up first." />;
  const entry = params.entry ? cycle.entries.find((e): e is MoveEntry => e.id === params.entry && e.type === 'move') : undefined;
  if (params.entry && !entry) return <Missing title="edit move" what="That move isn't in this cycle any more." />;
  const preset = MOVE_ROUTES.find((r) => r === params.route);
  return <MoveForm entry={entry} preset={preset} />;
}

/** "SPARE DEBIT" / "SAVINGS". */
const endLabel = (end: Side | 'savings') => (end === 'savings' ? 'SAVINGS' : `SPARE ${sideLabel(end)}`);

/** What an end of a route holds in a budget. */
const holds = (b: Budget, end: Side | 'savings') => (end === 'savings' ? b.savings : b.state!.spare[end]);

function MoveForm({ entry, preset }: { entry?: MoveEntry; preset?: MoveRoute }) {
  const actions = useActions();
  const { ledger } = useBudget();
  const now = useMinute();
  const [route, setRoute] = useState<MoveRoute>(entry?.route ?? preset ?? 'debit-credit');
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const amount = parseRand(amountText);
  const [from, to] = routeEnds(route);

  // What the source has before this move (an edit: without the move being edited).
  const before = useMemo(() => {
    const without = entry ? deleteEntry(ledger, entry.id) : null;
    return budgetOf(without?.ok ? without.ledger : ledger);
  }, [ledger, entry]);

  const trial = amount === null || amount === 0 ? null : move(ledger, route, amount, { newId: () => 'preview', now }, entry?.id);
  const after = trial?.ok ? budgetOf(trial.ledger) : null;

  const confirm = () => {
    if (amount === null || amount === 0) return setError('ENTER AN AMOUNT ABOVE R0');
    const outcome = actions.move(route, amount, entry?.id);
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  return (
    <FormPage
      title={entry ? 'edit move' : 'move money'}
      closeLabel="Cancel"
      error={error}
      actions={
        <FormButton label={entry ? 'SAVE' : 'MOVE'} onPress={confirm} primary grow accessibilityLabel={entry ? 'Save' : 'Move it'} />
      }
    >
      <View style={styles.routes}>
        <Segmented options={OPTIONS.slice(0, 2)} value={route} onChange={setRoute} accessibilityLabel="From debit" />
        <Segmented options={OPTIONS.slice(2)} value={route} onChange={setRoute} accessibilityLabel="From savings" />
      </View>
      <Text style={[type.meta, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`FROM ${endLabel(from)}: ${formatRand(holds(before, from))} AVAILABLE`}
      </Text>
      <AmountField label="AMOUNT" value={amountText} onChange={setAmountText} autoFocus />
      <Preview
        problem={amount === null || amount === 0 ? 'ENTER AN AMOUNT ABOVE R0' : trial && !trial.ok ? trial.error : null}
        lines={after ? [from, to].map((end) => `${endLabel(end)} ${formatRand(holds(after, end))}`) : []}
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  routes: { gap: space.xs + 2 },
  text: { color: colors.text, ...platformText },
});
