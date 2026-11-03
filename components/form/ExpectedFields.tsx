/**
 * components/form/ExpectedFields.tsx: a debit bill's COMING IN, money
 * someone else pays in towards it (PLAN D32, F15).
 *
 *   [x] COMING IN FROM SOMEONE ELSE
 *   FROM    [ PARTNER ]  or type one
 *   AMOUNT  R [5000]
 *   [ ] ALREADY RECEIVED                ← setup only
 *
 * Layer: UI. Shown only on debit bills. Until that money is received, the
 * bill holds back only your share of it; the builder (lib/ledger.ts) has
 * the last word on every rule, the fields only mark what can't be read.
 * FROM offers the payers already named on other bills as chips, so two
 * bills paid in by one person get the same payer and are received together
 * (D33).
 */
import { StyleSheet, View } from 'react-native';

import { type ExpectedDraft, expectedProblems } from '@/components/lines/drafts';
import { colors, shape, space } from '@/theme';

import { Checkbox } from './Checkbox';
import { AmountField } from './Field';
import { LabelPicker } from './LabelPicker';

interface Props {
  value: ExpectedDraft;
  onChange: (next: ExpectedDraft) => void;
  /** The bill amount as typed (null when unreadable), for the at-most-the-bill check. */
  bill: number | null;
  /** Payers already named, offered as chips. */
  payers: readonly string[];
  /** Offer ALREADY RECEIVED (setup, F0: the balance may already include it). */
  showReceived?: boolean;
  /** Mark the fields that can't be used. */
  showProblems: boolean;
  /** The bill's name, for the screen reader. */
  name: string;
}

/** The COMING IN box and, once ticked, who pays in how much. */
export function ExpectedFields({ value, onChange, bill, payers, showReceived, showProblems, name }: Props) {
  const problems = expectedProblems(value, bill);
  const set = (patch: Partial<ExpectedDraft>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.wrap}>
      <Checkbox
        checked={value.on}
        onChange={(on) => set({ on })}
        label="COMING IN FROM SOMEONE ELSE"
        spoken={`${name}: part of it is paid in by someone else`}
      />
      {value.on && (
        <View style={styles.inner}>
          <LabelPicker
            title="FROM"
            chips={payers}
            value={value.payer}
            onChange={(payer) => set({ payer })}
            placeholder="e.g. Partner"
            newHint={null}
            problem={showProblems ? problems.payer : null}
          />
          <AmountField
            label="THEIR SHARE"
            value={value.amount}
            onChange={(amount) => set({ amount })}
            hint="Until it arrives, only your share is held back"
            problem={showProblems ? problems.amount : null}
            accessibilityLabel={`${name}, their share`}
          />
          {showReceived && (
            <Checkbox
              checked={value.received}
              onChange={(received) => set({ received })}
              label="ALREADY RECEIVED"
              spoken={`${name}: their share is already in the debit balance`}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  inner: { gap: space.md, paddingLeft: space.md, borderLeftWidth: shape.hairline, borderLeftColor: colors.line },
});
