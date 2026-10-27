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
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, Missing, Preview } from '@/components/form';
import { sideLabel, tickBill } from '@/lib/ledger';
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
  return <TickForm lineId={lineState.line.id} entry={entry} />;
}

function TickForm({ lineId, entry }: { lineId: string; entry?: TickEntry }) {
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
