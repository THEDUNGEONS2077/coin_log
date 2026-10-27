/**
 * components/setup/Setup.tsx: the first-run setup, starting mid-cycle
 * (PLAN F0).
 *
 *   STEP 1/2 · NOW     savings on hand, debit balance, credit available,
 *                      next pay date
 *   STEP 2/2 · LINES   Food plus your budget lines and bills (monthly amount,
 *                      what's left now / already paid), the spare they leave,
 *                      [ START ]
 *
 * Layer: UI. The main screen shows this instead of the budget while there's
 * no budget yet (a fresh install, or after Delete all data). Nothing is
 * saved until START, which runs the F0 builder: it either starts the budget
 * (the main screen then appears, with STARTED · UNDO) or says what's wrong.
 * Android back on step 2 returns to step 1; on step 1 it leaves the app.
 */
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { AmountField, DateField, FormButton, FormPage, SparePreview } from '@/components/form';
import { anyProblem, foodDraft, type LineDraft, toStartLines } from '@/components/lines/drafts';
import { LinesEditor } from '@/components/lines/LinesEditor';
import { addDays, dayDiff } from '@/lib/dates';
import { startSpare } from '@/lib/ledger';
import { parseRand } from '@/lib/money';
import { haptics } from '@/services/haptics';
import { useActions } from '@/store/react';
import { glyphs } from '@/theme';

/** The amounts typed on step 1, as text. */
interface NowFields {
  savings: string;
  debit: string;
  credit: string;
}

export function Setup() {
  const actions = useActions();
  const now = useMinute();
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<NowFields>({ savings: '', debit: '', credit: '' });
  const [payDate, setPayDate] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<LineDraft[]>(() => [foodDraft()]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android back on step 2 goes back a step (on step 1 it leaves the app, as usual).
  useEffect(() => {
    if (step !== 2) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const savings = parseRand(fields.savings);
  const debit = parseRand(fields.debit);
  const credit = parseRand(fields.credit);
  const payDateOk = payDate !== null && dayDiff(now, payDate) >= 1;
  const amountProblem = (v: number | null) => (tried && v === null ? 'ENTER A WHOLE RAND AMOUNT (R0 IS FINE)' : null);

  /** Step 1 → 2, once every field can be used. */
  const next = () => {
    setTried(true);
    if (savings === null || debit === null || credit === null || !payDateOk) {
      setError(payDate !== null && !payDateOk ? 'THE NEXT PAY DATE MUST BE AFTER TODAY' : 'FILL IN THE MARKED FIELDS');
      return;
    }
    setError(null);
    setTried(false);
    setStep(2);
  };

  /** START: runs F0 with everything as entered. */
  const begin = () => {
    setTried(true);
    if (anyProblem(drafts, 'start')) {
      setError('FILL IN THE MARKED FIELDS');
      return;
    }
    const outcome = actions.start({
      savingsOnHand: savings!,
      actualDebit: debit!,
      actualCredit: credit!,
      payDate: payDate!,
      lines: toStartLines(drafts),
    });
    if (outcome) {
      setError(outcome);
      return;
    }
    haptics.success();
  };

  if (step === 1) {
    return (
      <FormPage
        title="set up"
        step="STEP 1/2 · NOW"
        intro="coin_log starts from today. Enter things as they are right now: payday takes it from there."
        error={error}
        actions={<FormButton label={`NEXT ${glyphs.next.glyph}`} onPress={next} primary grow accessibilityLabel="Next: your lines" />}
      >
        <AmountField
          label="SAVINGS ON HAND"
          value={fields.savings}
          onChange={(savings) => setFields((f) => ({ ...f, savings }))}
          hint="What you have saved already"
          problem={amountProblem(savings)}
        />
        <AmountField
          label="DEBIT BALANCE NOW"
          value={fields.debit}
          onChange={(debit) => setFields((f) => ({ ...f, debit }))}
          hint="Your debit account's balance in your banking app"
          problem={amountProblem(debit)}
        />
        <AmountField
          label="CREDIT AVAILABLE NOW"
          value={fields.credit}
          onChange={(credit) => setFields((f) => ({ ...f, credit }))}
          hint="The credit available on your card"
          problem={amountProblem(credit)}
        />
        <DateField
          label="NEXT PAY DATE"
          value={payDate}
          onChange={setPayDate}
          min={addDays(now, 1)}
          problem={tried && !payDateOk ? 'PICK A DAY AFTER TODAY' : null}
          hint="The day your next salary comes in"
        />
      </FormPage>
    );
  }

  return (
    <FormPage
      title="set up"
      step="STEP 2/2 · LINES"
      intro="Budget lines are drawn down through the month (Food, toiletries). Bills are fixed amounts you tick off (debit orders). MONTHLY is the full amount each cycle."
      error={error}
      actions={
        <>
          <FormButton label={`${glyphs.back.glyph} BACK`} onPress={() => setStep(1)} grow accessibilityLabel="Back: balances" />
          <FormButton label="START" onPress={begin} primary grow />
        </>
      }
    >
      <LinesEditor mode="start" drafts={drafts} onChange={setDrafts} showProblems={tried} />
      <SparePreview spare={startSpare({ actualDebit: debit ?? 0, actualCredit: credit ?? 0, lines: toStartLines(drafts) })} />
    </FormPage>
  );
}
