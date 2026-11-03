/**
 * __tests__/lib/card.test.ts: the card settlement (PLAN D39–D42, F19–F22).
 *
 * The worked example from the plan: R20 000 debit, R10 000 credit; Food
 * R1 800 on credit, Card settlement R1 200 on debit (PAYS THE CARD). Spare
 * credit 8 200, spare debit 18 800. Deductions of R380 + R50 + R750 = R1 180
 * take credit to 8 820 with spare credit still 8 200; settling R1 180 takes
 * debit to 18 820 and credit back to 10 000, spare debit 18 820 (the R20
 * not needed), spare credit 8 200.
 */
import { describeEntry } from '@/lib/entries';
import {
  addLine,
  cancelLine,
  cardOwed,
  computeCycle,
  currentCycle,
  deduct,
  deductionLabels,
  deleteEntry,
  editLine,
  emptyLedger,
  loadSalary,
  type Result,
  salarySpare,
  start,
  type StartInput,
  startSpare,
  templateLines,
  tickBill,
} from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import type { Ledger } from '@/lib/types';

/** Local time → epoch ms (month is 1-based here). */
const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 11, 3, 12);

/** Sequential IDs at a fixed time. */
function makeIds(now = NOW, prefix = 'id') {
  let n = 0;
  return { newId: () => `${prefix}${++n}`, now };
}
let ids = makeIds();
beforeEach(() => {
  ids = makeIds();
});

/** The ledger from a result (failing the test with the refusal otherwise). */
function ok(result: Result): Ledger {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.ledger;
}

/** The refusal from a result (failing the test if it worked). */
function refused(result: Result): string {
  if (result.ok) throw new Error('expected a refusal, but it worked');
  return result.error;
}

const SETUP: StartInput = {
  savingsOnHand: 0,
  actualCredit: 10000,
  actualDebit: 20000,
  payDate: at(2026, 11, 25),
  lines: [
    { name: 'Food', kind: 'budget', side: 'credit', isFood: true, monthly: 1800, leftNow: 1800, paid: false },
    { name: 'Card settlement', kind: 'bill', side: 'debit', isFood: false, monthly: 1200, leftNow: 0, paid: false, paysCard: true },
    { name: 'Rent', kind: 'bill', side: 'debit', isFood: false, monthly: 4000, leftNow: 0, paid: false },
  ],
};

const started = (input: StartInput = SETUP) => ok(start(emptyLedger(), input, ids));
const state = (l: Ledger) => computeCycle(currentCycle(l)!);
const line = (l: Ledger, name: string) => state(l).lines.find((x) => x.line.name === name)!;
const cardId = (l: Ledger) => line(l, 'Card settlement').line.id;
const last = (l: Ledger) => currentCycle(l)!.entries.at(-1)!;

/** The three deductions of the example. */
function deducted(l: Ledger): Ledger {
  l = ok(deduct(l, cardId(l), 380, 'Interest', ids));
  l = ok(deduct(l, cardId(l), 50, 'Fees', ids));
  return ok(deduct(l, cardId(l), 750, 'Facility', ids));
}

describe('D39 deductions lower credit, not spare credit', () => {
  it('each deduction as it appears (D40)', () => {
    const l = deducted(started());
    const s = state(l);
    expect(s.balance.credit).toBe(8820);
    expect(s.spare).toEqual({ credit: 8200, debit: 14800 });
    expect(s.owed).toBe(1180);
    expect(line(l, 'Card settlement')).toMatchObject({ deducted: 1180, owed: 1180, left: 1200 });
  });

  it('shows on LOG with its label (or the default one)', () => {
    const s0 = started();
    let l = ok(deduct(s0, cardId(s0), 380, 'Interest', ids));
    expect(describeEntry(last(l), currentCycle(l)!)).toEqual({
      glyph: 'deduct',
      title: 'INTEREST',
      amount: '−R380',
      side: 'CR',
      detail: 'CARD DEDUCTION · CARD SETTLEMENT',
    });
    l = ok(deduct(l, cardId(l), 20, '  ', ids));
    expect(last(l)).toMatchObject({ label: 'Card deduction' });
    expect(deductionLabels(l)).toEqual(['Interest']);
  });

  it('past what was set aside, the bill holds more back and spare debit drops (F20)', () => {
    const s0 = started();
    let l = ok(deduct(s0, cardId(s0), 1500, 'Interest', ids));
    expect(line(l, 'Card settlement').left).toBe(1500);
    expect(state(l).spare.debit).toBe(14500);
    // Refused when spare debit can't cover that.
    const tight = started({ ...SETUP, actualDebit: 5300 }); // spare debit 100
    expect(refused(deduct(tight, cardId(tight), 1400, '', ids))).toBe('SPARE DEBIT WOULD BE SHORT BY R100');
    l = ok(deduct(l, cardId(l), 10, '', ids));
    expect(state(l).spare.debit).toBe(14490);
  });

  it('refuses R0, and a bill that doesn’t pay the card', () => {
    const l = started();
    expect(refused(deduct(l, cardId(l), 0, '', ids))).toMatch(/ABOVE R0/);
    expect(refused(deduct(l, line(l, 'Rent').line.id, 100, '', ids))).toMatch(/DOESN’T PAY THE CARD/);
  });

  it('can be changed and deleted before settling', () => {
    let l = deducted(started());
    const interest = currentCycle(l)!.entries.find((e) => e.type === 'deduct')!;
    l = ok(deduct(l, '', 400, 'Interest', ids, interest.id));
    expect(state(l).owed).toBe(1200);
    l = ok(deleteEntry(l, interest.id));
    expect(state(l)).toMatchObject({ owed: 800, spare: { credit: 8200, debit: 14800 } });
    expect(state(l).balance.credit).toBe(9200);
  });
});

describe('D41 SETTLE pays debit into credit', () => {
  it('settling what was deducted: credit back up, the unused set-aside back to spare debit', () => {
    let l = deducted(started());
    l = ok(tickBill(l, cardId(l), 1180, ids));
    const s = state(l);
    expect(s.balance).toEqual({ credit: 10000, debit: 18820 });
    expect(s.spare).toEqual({ credit: 8200, debit: 14820 });
    expect(s.owed).toBe(0);
    expect(describeEntry(last(l), currentCycle(l)!)).toEqual({
      glyph: 'paid',
      title: 'SETTLED CARD SETTLEMENT',
      amount: `−${formatRand(1180)}`,
      side: 'DB',
      detail: `TO CREDIT · DEDUCTED ${formatRand(1180)}`,
    });
  });

  it('paying more adds to spare credit; paying less takes it from spare credit', () => {
    const l = deducted(started());
    expect(state(ok(tickBill(l, cardId(l), 1200, ids))).spare).toEqual({ credit: 8220, debit: 14800 });
    expect(state(ok(tickBill(l, cardId(l), 1000, ids))).spare).toEqual({ credit: 8020, debit: 15000 });
    // Refused when spare credit can't cover the gap.
    const tight = deducted(started({ ...SETUP, actualCredit: 1900 })); // spare credit 100
    expect(refused(tickBill(tight, cardId(tight), 1000, ids))).toBe('SPARE CREDIT WOULD BE SHORT BY R80');
  });

  it('once settled, deductions are locked; deleting the settlement reopens it', () => {
    let l = deducted(started());
    const interest = currentCycle(l)!.entries.find((e) => e.type === 'deduct')!;
    l = ok(tickBill(l, cardId(l), 1180, ids));
    expect(refused(deduct(l, cardId(l), 10, '', ids))).toMatch(/ALREADY SETTLED/);
    expect(refused(deduct(l, '', 10, '', ids, interest.id))).toMatch(/ALREADY SETTLED/);
    expect(refused(deleteEntry(l, interest.id))).toMatch(/DELETE THE SETTLEMENT FIRST/);
    l = ok(deleteEntry(l, last(l).id));
    expect(state(l).owed).toBe(1180);
    l = ok(deleteEntry(l, interest.id));
    expect(state(l).owed).toBe(800);
  });
});

describe('F19 / F22 the PAYS THE CARD bill', () => {
  it('is on one debit bill, never with COMING IN', () => {
    const l = started();
    expect(refused(addLine(l, { name: 'Card 2', kind: 'bill', side: 'debit', amount: 100, paysCard: true }, ids))).toBe(
      'ONLY ONE BILL CAN PAY THE CARD',
    );
    const rent = line(l, 'Rent').line.id;
    expect(refused(editLine(l, rent, { paysCard: true }))).toBe('ONLY ONE BILL CAN PAY THE CARD');
    expect(refused(editLine(l, cardId(l), { expected: { payer: 'Partner', amount: 100 } }))).toMatch(/CAN’T ALSO HAVE COMING IN/);
    const moved = ok(editLine(l, cardId(l), { paysCard: false }));
    expect(ok(editLine(moved, rent, { paysCard: true })).cycles).toHaveLength(1);
    expect(refused(addLine(moved, { name: 'Gym', kind: 'budget', side: 'debit', amount: 100, paysCard: true }, ids))).toMatch(
      /DEBIT BILLS ONLY/,
    );
  });

  it('can’t be turned off or cancelled while it has deductions', () => {
    const l = deducted(started());
    expect(refused(editLine(l, cardId(l), { paysCard: false }))).toMatch(/DELETE THEM FIRST/);
    expect(refused(cancelLine(l, cardId(l), ids))).toMatch(/SETTLE IT, OR DELETE THEM FIRST/);
    const fresh = started();
    expect(ok(cancelLine(fresh, cardId(fresh), ids)).cycles).toHaveLength(1);
  });

  it('setup: ALREADY DEDUCTED is in the balance and owed (F19)', () => {
    const input: StartInput = {
      ...SETUP,
      actualCredit: 8820,
      lines: SETUP.lines.map((x) => (x.paysCard ? { ...x, deductedBefore: 1180 } : x)),
    };
    expect(startSpare(input)).toEqual({ credit: 8200, debit: 14800 });
    let l = started(input);
    expect(state(l).spare).toEqual({ credit: 8200, debit: 14800 });
    expect(state(l).balance.credit).toBe(8820);
    const before = currentCycle(l)!.entries.find((e) => e.type === 'deduct')!;
    expect(describeEntry(before, currentCycle(l)!)).toMatchObject({
      amount: formatRand(1180),
      detail: 'DEDUCTED BEFORE SETUP · TO SETTLE',
    });
    expect(refused(deduct(l, '', 100, '', ids, before.id))).toMatch(/DELETE IT INSTEAD/);
    l = ok(tickBill(l, cardId(l), 1180, ids));
    expect(state(l).balance.credit).toBe(10000);
  });
});

describe('D42 unsettled at payday: carried over', () => {
  const salaryInput = (l: Ledger) => ({
    receivedAt: at(2026, 11, 25, 9),
    salary: 25000,
    savings: 0,
    credit: 2000,
    payDate: at(2026, 12, 24),
    actualDebit: 20000,
    actualCredit: 8820,
    lines: templateLines(currentCycle(l)!),
  });
  // Its own ID prefix: sequential IDs starting again at id1 would repeat existing ones.
  const later = () => makeIds(at(2026, 11, 25, 10), 'pay');

  it('becomes a one-off card settlement, already deducted, settled as usual', () => {
    let l = deducted(started());
    expect(cardOwed(currentCycle(l)!)).toBe(1180);
    // 20000 − Card 1200 − Rent 4000 − carried 1180 = 13620; credit 8820 − Food 1800 + 1180 owed = 8200.
    expect(salarySpare(salaryInput(l), 1180)).toEqual({ credit: 8200, debit: 13620 });
    l = ok(loadSalary(l, salaryInput(l), later()));
    expect(state(l).spare).toEqual({ credit: 8200, debit: 13620 });
    const carried = line(l, 'Card settlement (last cycle)');
    expect(carried.line).toMatchObject({ paysCard: true, carried: true, amount: 1180 });
    expect(carried).toMatchObject({ deducted: 1180, owed: 1180 });
    expect(describeEntry(last(l), currentCycle(l)!).detail).toBe('OWED FROM LAST CYCLE · TO SETTLE');
    // This month's settlement starts fresh beside it.
    expect(line(l, 'Card settlement')).toMatchObject({ deducted: 0, left: 1200 });
    // Settling it: credit back up by what's paid.
    l = ok(tickBill(l, carried.line.id, 1180, ids));
    expect(state(l).balance.credit).toBe(10000);
    expect(state(l).spare).toEqual({ credit: 8200, debit: 13620 });
    // It isn't part of the template.
    expect(templateLines(currentCycle(l)!).map((x) => x.name)).toEqual(['Food', 'Card settlement', 'Rent']);
  });

  it('nothing carries once settled', () => {
    let l = deducted(started());
    l = ok(tickBill(l, cardId(l), 1180, ids));
    l = ok(loadSalary(l, { ...salaryInput(l), actualCredit: 10000 }, later()));
    expect(currentCycle(l)!.lines.some((x) => x.carried)).toBe(false);
  });
});
