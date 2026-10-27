/**
 * app/load-salary.tsx: load salary (PLAN F1), a full page in three steps.
 *
 *   STEP 1/3 · AMOUNTS   date received, salary, savings (off the top),
 *                        credit (typed; debit gets the rest), next pay date
 *   STEP 2/3 · BALANCES  the actual debit balance and credit available now
 *   STEP 3/3 · LINES     RESET (every line back at its default) or EDIT,
 *                        the spare that leaves, [ CONFIRM ]
 *
 * Layer: UI (Expo Router screen). Opened from ⊕ SALARY or the red payday
 * line, at any time (also before the pay date). Nothing changes until
 * CONFIRM, which runs the F1 builder: it closes this cycle and opens the
 * next (back on the main screen: SALARY LOADED · UNDO), or says what's wrong.
 * ✕ discards everything; Android back steps back a step, then closes.
 *
 * Prefilled [P]: DATE RECEIVED today, SAVINGS R0, CREDIT the last salary's
 * credit amount, NEXT PAY DATE a month after the date received.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { NotYet } from '@/components/common/NotYet';
import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { AmountField, DateField, FormButton, FormPage, Segmented, SparePreview } from '@/components/form';
import { anyProblem, draftsFrom, type LineDraft, toSalaryLines } from '@/components/lines/drafts';
import { LinesEditor } from '@/components/lines/LinesEditor';
import { addDays, addMonths, dayDiff, startOfDay } from '@/lib/dates';
import { debitShare, salarySpare, type SalaryLineInput, sideLabel, SIDES, templateLines } from '@/lib/ledger';
import { formatRand, parseRand } from '@/lib/money';
import type { Ledger, SalaryEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions, useBudget } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

/** The amounts typed, as text. */
interface Fields {
  salary: string;
  savings: string;
  credit: string;
  actualDebit: string;
  actualCredit: string;
}

/** The newest salary entry in the ledger, if there's been one (for CREDIT's prefill). */
function lastSalary(ledger: Ledger): SalaryEntry | null {
  for (let c = ledger.cycles.length - 1; c >= 0; c--) {
    const salary = ledger.cycles[c]!.entries.find((e): e is SalaryEntry => e.type === 'salary');
    if (salary) return salary;
  }
  return null;
}

export default function LoadSalaryScreen() {
  const { ledger, cycle } = useBudget();
  if (!cycle) return <NotYet title="load salary" what="Set coin_log up first: the salary load starts from your current budget." />;
  return <LoadSalary ledger={ledger} template={templateLines(cycle)} />;
}

function LoadSalary({ ledger, template }: { ledger: Ledger; template: SalaryLineInput[] }) {
  const actions = useActions();
  const now = useMinute();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fields, setFields] = useState<Fields>(() => ({
    salary: '',
    savings: '0',
    credit: String(lastSalary(ledger)?.credit ?? ''),
    actualDebit: '',
    actualCredit: '',
  }));
  const [received, setReceived] = useState(() => startOfDay(Date.now()));
  const [payDate, setPayDate] = useState(() => addMonths(startOfDay(Date.now()), 1));
  const [mode, setMode] = useState<'reset' | 'edit'>('reset');
  const [drafts, setDrafts] = useState<LineDraft[]>(() => draftsFrom(template));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));

  /** Moves to another step, clearing the last step's messages. */
  const go = (to: 1 | 2 | 3) => {
    setTried(false);
    setError(null);
    setStep(to);
  };

  // Android back steps back; on step 1 it closes the page (nothing was saved).
  useEffect(() => {
    if (step === 1) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      go(step === 3 ? 2 : 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const salary = parseRand(fields.salary);
  const savings = parseRand(fields.savings);
  const credit = parseRand(fields.credit);
  const actualDebit = parseRand(fields.actualDebit);
  const actualCredit = parseRand(fields.actualCredit);
  const share = salary !== null && savings !== null && credit !== null ? debitShare(salary, savings, credit) : null;
  const payDateOk = dayDiff(received, payDate) >= 1;
  const mark = (v: number | null) => (tried && v === null ? 'ENTER A WHOLE RAND AMOUNT' : null);

  // The lines CONFIRM would use: the template (RESET) or the edited drafts (EDIT).
  const lines = useMemo(() => (mode === 'reset' ? template : toSalaryLines(drafts)), [mode, template, drafts]);

  /** Step 1 → 2, once the amounts add up and the dates are in order. */
  const afterAmounts = () => {
    setTried(true);
    if (salary === null || savings === null || credit === null) return setError('FILL IN THE MARKED FIELDS');
    if (salary === 0) return setError('ENTER THE SALARY RECEIVED');
    if (savings > salary) return setError('SAVINGS ARE MORE THAN THE SALARY');
    if (share !== null && share < 0) return setError('SAVINGS AND CREDIT ADD UP TO MORE THAN THE SALARY');
    if (!payDateOk) return setError('THE NEXT PAY DATE MUST BE AFTER THE DATE RECEIVED');
    go(2);
  };

  /** Step 2 → 3, once both balances are entered. */
  const afterBalances = () => {
    setTried(true);
    if (actualDebit === null || actualCredit === null) return setError('FILL IN THE MARKED FIELDS');
    go(3);
  };

  /** CONFIRM: runs F1 with everything as entered. */
  const confirm = () => {
    setTried(true);
    if (mode === 'edit' && anyProblem(drafts, 'salary')) return setError('FILL IN THE MARKED FIELDS');
    const outcome = actions.loadSalary({
      receivedAt: received,
      salary: salary!,
      savings: savings!,
      credit: credit!,
      payDate,
      actualDebit: actualDebit!,
      actualCredit: actualCredit!,
      lines,
    });
    if (outcome) return setError(outcome);
    haptics.success();
    router.back();
  };

  const close = { closeLabel: 'Cancel the salary load', title: 'load salary' } as const;

  if (step === 1) {
    return (
      <FormPage
        {...close}
        step="STEP 1/3 · AMOUNTS"
        intro="Savings come off the top. Type what went to credit; debit gets the rest."
        error={error}
        actions={<FormButton label={`NEXT ${glyphs.next.glyph}`} onPress={afterAmounts} primary grow accessibilityLabel="Next: balances" />}
      >
        <DateField label="DATE RECEIVED" value={received} onChange={setReceived} max={now} />
        <AmountField label="SALARY" value={fields.salary} onChange={(v) => set({ salary: v })} problem={mark(salary)} />
        <AmountField
          label="TO SAVINGS"
          value={fields.savings}
          onChange={(v) => set({ savings: v })}
          problem={mark(savings)}
          hint="Off the top"
        />
        <AmountField label="TO CREDIT" value={fields.credit} onChange={(v) => set({ credit: v })} problem={mark(credit)} />
        <Text
          style={[type.body, share !== null && share < 0 ? styles.bright : styles.accent]}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {share === null
            ? 'DEBIT GETS THE REST'
            : share < 0
              ? `${formatRand(-share)} MORE THAN THE SALARY`
              : `DEBIT GETS ${formatRand(share)}`}
        </Text>
        <DateField
          label="NEXT PAY DATE"
          value={payDate}
          onChange={setPayDate}
          min={addDays(received, 1)}
          problem={tried && !payDateOk ? 'PICK A DAY AFTER THE DATE RECEIVED' : null}
        />
      </FormPage>
    );
  }

  if (step === 2) {
    return (
      <FormPage
        {...close}
        step="STEP 2/3 · BALANCES"
        intro="Check your banking app now. Whatever is left from the last cycle is in these balances, so it becomes spare."
        error={error}
        actions={
          <>
            <FormButton label={`${glyphs.back.glyph} BACK`} onPress={() => go(1)} grow accessibilityLabel="Back: amounts" />
            <FormButton label={`NEXT ${glyphs.next.glyph}`} onPress={afterBalances} primary grow accessibilityLabel="Next: lines" />
          </>
        }
      >
        <AmountField
          label="DEBIT BALANCE NOW"
          value={fields.actualDebit}
          onChange={(v) => set({ actualDebit: v })}
          hint={share !== null ? `Expected at least ${formatRand(share)}` : undefined}
          problem={mark(actualDebit)}
        />
        <AmountField
          label="CREDIT AVAILABLE NOW"
          value={fields.actualCredit}
          onChange={(v) => set({ actualCredit: v })}
          hint={credit !== null ? `Expected at least ${formatRand(credit)}` : undefined}
          problem={mark(actualCredit)}
        />
      </FormPage>
    );
  }

  return (
    <FormPage
      {...close}
      step="STEP 3/3 · LINES"
      intro="RESET puts every line back at its default amount. EDIT lets you change, remove or add lines first."
      error={error}
      actions={
        <>
          <FormButton label={`${glyphs.back.glyph} BACK`} onPress={() => go(2)} grow accessibilityLabel="Back: balances" />
          <FormButton label="CONFIRM" onPress={confirm} primary grow accessibilityLabel="Confirm: load the salary" />
        </>
      }
    >
      <Segmented
        options={[
          { key: 'reset', label: 'RESET', a11y: 'Reset every line to its default' },
          { key: 'edit', label: 'EDIT', a11y: 'Edit the lines first' },
        ]}
        value={mode}
        onChange={(m) => {
          setTried(false);
          setError(null);
          setMode(m);
        }}
        accessibilityLabel="Lines for the new cycle"
      />
      {mode === 'reset' ? (
        <TemplateList lines={template} />
      ) : (
        <LinesEditor mode="salary" drafts={drafts} onChange={setDrafts} showProblems={tried} />
      )}
      <SparePreview spare={salarySpare({ actualDebit: actualDebit ?? 0, actualCredit: actualCredit ?? 0, lines })} />
    </FormPage>
  );
}

/** RESET's lines, read only: name, kind and default amount, grouped by side. */
function TemplateList({ lines }: { lines: SalaryLineInput[] }) {
  return (
    <View style={styles.template}>
      {SIDES.map((side) => (
        <View key={side} style={styles.side}>
          <View style={styles.sideHead}>
            <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {sideLabel(side)}
            </Text>
            <Rule />
          </View>
          {lines
            .filter((l) => l.side === side)
            .map((l) => (
              <View key={l.id ?? l.name} style={styles.row} accessible accessibilityLabel={`${l.name}, ${l.kind}, ${formatRand(l.amount)}`}>
                <Text style={[type.body, styles.text, styles.grow]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {l.name.toUpperCase()}
                  <Text style={[type.meta, styles.dim]}>{l.kind === 'bill' ? '  BILL' : ''}</Text>
                </Text>
                <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {formatRand(l.amount)}
                </Text>
              </View>
            ))}
          {!lines.some((l) => l.side === side) && (
            <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              NO LINES
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  template: { gap: space.lg },
  side: { gap: space.xs },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: space.xl + space.sm },
  grow: { flex: 1 },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
