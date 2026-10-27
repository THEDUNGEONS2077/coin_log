/**
 * __tests__/lib/ledger.test.ts: the budget's rules (lib/ledger.ts), flow by
 * flow (PLAN §3, §7 Verification).
 *
 * Every flow gets its happy path and each of its "blocked" branches (D3:
 * nothing may go below zero), and deleting an entry is checked to put the
 * money back exactly. The worked example from the plan runs through it:
 * credit R3 000 = food 1 800, water 200, toilet paper 250, toiletries 250,
 * spare 500; a R200 restaurant bill = food 100 + spare 100 → food 1 700 left,
 * spare 400.
 */
import {
  addChip,
  addLine,
  cancelLine,
  computeCycle,
  currentCycle,
  deleteEntry,
  editLine,
  emptyLedger,
  income,
  loadSalary,
  logSpend,
  move,
  removeChip,
  renameChip,
  type Result,
  salarySpare,
  savingsTotal,
  setSavings,
  type SpendInput,
  start,
  type StartInput,
  startSpare,
  templateLines,
  tickBill,
  topUp,
} from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import { type Ledger, SPARE } from '@/lib/types';

/** Local time → epoch ms (month is 1-based here, for readability). */
const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 10, 27, 12);
const PAYDAY = at(2026, 11, 25);

/** Sequential IDs (id1, id2, …) shared by every builder call in a test, at a fixed time. */
function makeIds(now = NOW) {
  let n = 0;
  return { newId: () => `id${++n}`, now };
}
let ids = makeIds();
beforeEach(() => {
  ids = makeIds();
});

/** The ledger from a result, failing the test with the refusal message if there isn't one. */
function ok(result: Result): Ledger {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.ledger;
}

/** The refusal message from a result, failing the test if it worked. */
function refused(result: Result): string {
  if (result.ok) throw new Error('expected a refusal, but it worked');
  return result.error;
}

/** The plan's example: credit 3 000 over four budget lines; debit 5 000 with rent open and electricity paid. */
const SETUP: StartInput = {
  savingsOnHand: 8000,
  actualCredit: 3000,
  actualDebit: 5000,
  payDate: PAYDAY,
  lines: [
    { name: 'Food', kind: 'budget', side: 'credit', isFood: true, monthly: 1800, leftNow: 1800, paid: false },
    { name: 'Water', kind: 'budget', side: 'credit', isFood: false, monthly: 200, leftNow: 200, paid: false },
    { name: 'Toilet paper', kind: 'budget', side: 'credit', isFood: false, monthly: 250, leftNow: 250, paid: false },
    { name: 'Toiletries', kind: 'budget', side: 'credit', isFood: false, monthly: 250, leftNow: 250, paid: false },
    { name: 'Rent', kind: 'bill', side: 'debit', isFood: false, monthly: 4000, leftNow: 0, paid: false },
    { name: 'Electricity', kind: 'bill', side: 'debit', isFood: false, monthly: 500, leftNow: 0, paid: true },
  ],
};

/** A started ledger (F0) with the example setup. */
const started = () => ok(start(emptyLedger(), SETUP, ids));

/** The current cycle's numbers. */
const stateOf = (ledger: Ledger) => computeCycle(currentCycle(ledger)!);
/** A line's ID by name. */
const lineId = (ledger: Ledger, name: string) => currentCycle(ledger)!.lines.find((l) => l.name === name)!.id;
/** A line's derived state by name. */
const line = (ledger: Ledger, name: string) => stateOf(ledger).lines.find((l) => l.line.name === name)!;
/** The newest entry of the current cycle. */
const lastEntry = (ledger: Ledger) => currentCycle(ledger)!.entries.at(-1)!;

/** The plan's restaurant bill: R200 = food 100 + spare 100. */
const restaurant = (ledger: Ledger): SpendInput => ({
  side: 'credit',
  total: 200,
  label: 'Restaurant',
  parts: [
    { source: lineId(ledger, 'Food'), amount: 100 },
    { source: SPARE, amount: 100 },
  ],
});

describe('F0 start, mid-cycle', () => {
  it('opens a cycle from the balances as they are now', () => {
    const l = started();
    const s = stateOf(l);
    expect(s.balance).toEqual({ credit: 3000, debit: 5000 });
    // Credit: 3000 − (1800 + 200 + 250 + 250) = 500. Debit: 5000 − rent 4000 (electricity is paid) = 1000.
    expect(s.spare).toEqual({ credit: 500, debit: 1000 });
    expect(savingsTotal(l)).toBe(8000);
    expect(currentCycle(l)!.payDate).toBe(PAYDAY);
    expect(currentCycle(l)!.entries[0]!.type).toBe('start');
  });

  it('puts Food first and keeps the monthly amount as the template default', () => {
    const l = ok(start(emptyLedger(), { ...SETUP, lines: [...SETUP.lines.slice(1), { ...SETUP.lines[0]!, leftNow: 900 }] }, ids));
    const food = currentCycle(l)!.lines[0]!;
    expect(food).toMatchObject({ name: 'Food', isFood: true, amount: 900, base: 1800 });
  });

  it('ticks off bills already paid without deducting them again', () => {
    const l = started();
    const electricity = line(l, 'Electricity');
    expect(electricity.paid).toBe(true);
    expect(electricity.tick).toMatchObject({ paid: 0, beforeStart: true });
    expect(stateOf(l).balance.debit).toBe(5000);
  });

  it('matches the live preview', () => {
    expect(startSpare(SETUP)).toEqual(stateOf(started()).spare);
  });

  it('refuses a pay date that is not after today', () => {
    expect(refused(start(emptyLedger(), { ...SETUP, payDate: NOW }, ids))).toMatch(/AFTER TODAY/);
  });

  it('refuses lines that hold back more than the balance', () => {
    expect(refused(start(emptyLedger(), { ...SETUP, actualCredit: 2400 }, ids))).toBe('SPARE CREDIT WOULD BE SHORT BY R100');
  });

  it('refuses LEFT NOW above the monthly amount', () => {
    const lines = SETUP.lines.map((x) => (x.name === 'Water' ? { ...x, leftNow: 300 } : x));
    expect(refused(start(emptyLedger(), { ...SETUP, lines }, ids))).toMatch(/WATER: LEFT NOW/);
  });

  it('needs exactly one Food line, on credit, as a budget', () => {
    expect(refused(start(emptyLedger(), { ...SETUP, lines: SETUP.lines.slice(1) }, ids))).toMatch(/FOOD/);
    const debitFood = SETUP.lines.map((x) => (x.isFood ? { ...x, side: 'debit' as const } : x));
    expect(refused(start(emptyLedger(), { ...SETUP, lines: debitFood }, ids))).toMatch(/FOOD/);
  });

  it('refuses to set up twice', () => {
    expect(refused(start(started(), SETUP, ids))).toMatch(/ALREADY SET UP/);
  });
});

describe('F2 log a transaction', () => {
  it('splits the restaurant bill over Food and spare (the worked example)', () => {
    let l = started();
    l = ok(logSpend(l, restaurant(l), ids));
    expect(line(l, 'Food').left).toBe(1700);
    expect(stateOf(l).spare.credit).toBe(400);
    expect(stateOf(l).balance.credit).toBe(2800);
  });

  it('covers several lines at once (a bulk grocery run)', () => {
    let l = started();
    const parts = [
      { source: lineId(l, 'Toilet paper'), amount: 250 },
      { source: lineId(l, 'Toiletries'), amount: 230 },
      { source: lineId(l, 'Food'), amount: 520 },
    ];
    l = ok(logSpend(l, { side: 'credit', total: 1000, label: 'Groceries', parts }, ids));
    expect(line(l, 'Toilet paper').left).toBe(0);
    expect(line(l, 'Toiletries').left).toBe(20);
    expect(line(l, 'Food').left).toBe(1280);
    expect(stateOf(l).spare.credit).toBe(500);
  });

  it('needs the parts to add up to the total exactly', () => {
    const l = started();
    expect(refused(logSpend(l, { side: 'credit', total: 300, label: 'x', parts: [{ source: SPARE, amount: 200 }] }, ids))).toBe(
      'ASSIGN R100 MORE',
    );
    expect(refused(logSpend(l, { side: 'credit', total: 100, label: 'x', parts: [{ source: SPARE, amount: 200 }] }, ids))).toBe(
      'R100 TOO MUCH ASSIGNED',
    );
  });

  it('refuses taking more than a line or spare has (D3)', () => {
    const l = started();
    const water = lineId(l, 'Water');
    expect(refused(logSpend(l, { side: 'credit', total: 250, label: 'x', parts: [{ source: water, amount: 250 }] }, ids))).toBe(
      'WATER WOULD BE SHORT BY R50',
    );
    expect(refused(logSpend(l, { side: 'credit', total: 600, label: 'x', parts: [{ source: SPARE, amount: 600 }] }, ids))).toBe(
      'SPARE CREDIT WOULD BE SHORT BY R100',
    );
  });

  it('draws from one side only, and never from a bill (D9, D25)', () => {
    const l = started();
    const food = lineId(l, 'Food');
    const rent = lineId(l, 'Rent');
    expect(refused(logSpend(l, { side: 'debit', total: 50, label: 'x', parts: [{ source: food, amount: 50 }] }, ids))).toMatch(
      /BUDGET LINE ON THIS SIDE/,
    );
    expect(refused(logSpend(l, { side: 'debit', total: 50, label: 'x', parts: [{ source: rent, amount: 50 }] }, ids))).toMatch(
      /BUDGET LINE ON THIS SIDE/,
    );
  });

  it('needs a label and an amount above zero', () => {
    const l = started();
    expect(refused(logSpend(l, { side: 'credit', total: 50, label: '  ', parts: [{ source: SPARE, amount: 50 }] }, ids))).toBe(
      'ADD A LABEL',
    );
    expect(refused(logSpend(l, { side: 'credit', total: 0, label: 'x', parts: [] }, ids))).toMatch(/ABOVE R0/);
  });

  it('turns a custom label into a chip on first use, once (D29)', () => {
    let l = started();
    l = ok(logSpend(l, restaurant(l), ids));
    l = ok(logSpend(l, { ...restaurant(l), label: 'RESTAURANT', total: 10, parts: [{ source: SPARE, amount: 10 }] }, ids));
    expect(l.chips.spend).toEqual(['Restaurant']);
  });
});

describe('F3 tick off a bill', () => {
  it('pays the planned amount: spare is unchanged', () => {
    let l = started();
    l = ok(tickBill(l, lineId(l, 'Rent'), 4000, ids));
    expect(line(l, 'Rent').paid).toBe(true);
    expect(stateOf(l).spare.debit).toBe(1000);
    expect(stateOf(l).balance.debit).toBe(1000);
  });

  it('paid less: the rest goes back to spare; paid more: the extra comes from spare (D7)', () => {
    const l = started();
    expect(stateOf(ok(tickBill(l, lineId(l, 'Rent'), 3800, ids))).spare.debit).toBe(1200);
    expect(stateOf(ok(tickBill(l, lineId(l, 'Rent'), 4300, ids))).spare.debit).toBe(700);
  });

  it('refuses paying more than spare can cover', () => {
    const l = started();
    expect(refused(tickBill(l, lineId(l, 'Rent'), 5200, ids))).toBe('SPARE DEBIT WOULD BE SHORT BY R200');
  });

  it('refuses a bill that is already paid, and budget lines', () => {
    let l = started();
    l = ok(tickBill(l, lineId(l, 'Rent'), 4000, ids));
    expect(refused(tickBill(l, lineId(l, 'Rent'), 4000, ids))).toMatch(/ALREADY PAID/);
    expect(refused(tickBill(l, lineId(l, 'Food'), 10, ids))).toMatch(/BILL/);
  });

  it('changes an earlier tick in place (F10)', () => {
    let l = started();
    l = ok(tickBill(l, lineId(l, 'Rent'), 4000, ids));
    const tick = lastEntry(l);
    l = ok(tickBill(l, lineId(l, 'Rent'), 3900, makeIds(NOW + 1000), tick.id));
    expect(lastEntry(l)).toMatchObject({ id: tick.id, at: tick.at, paid: 3900 });
    expect(stateOf(l).spare.debit).toBe(1100);
  });
});

describe('F4 cancel a line', () => {
  it('removes a bill and returns its amount to spare', () => {
    let l = started();
    const rent = lineId(l, 'Rent');
    l = ok(cancelLine(l, rent, ids));
    expect(currentCycle(l)!.lines.some((x) => x.id === rent)).toBe(false);
    expect(stateOf(l).spare.debit).toBe(5000);
    expect(lastEntry(l)).toMatchObject({ type: 'cancel', released: 4000 });
  });

  it('returns only what is left on a budget line', () => {
    let l = started();
    const water = lineId(l, 'Water');
    l = ok(logSpend(l, { side: 'credit', total: 150, label: 'Water', parts: [{ source: water, amount: 150 }] }, ids));
    l = ok(cancelLine(l, water, ids));
    expect(lastEntry(l)).toMatchObject({ released: 50 });
    // 3000 − 150 spent − (1800 + 250 + 250) still held = 550.
    expect(stateOf(l).spare.credit).toBe(550);
  });

  it('never cancels Food or a paid bill', () => {
    const l = started();
    expect(refused(cancelLine(l, lineId(l, 'Food'), ids))).toMatch(/FOOD/);
    expect(refused(cancelLine(l, lineId(l, 'Electricity'), ids))).toMatch(/ALREADY PAID/);
  });
});

describe('F5 edit a line', () => {
  it('sets the amount and the template default (D27)', () => {
    let l = started();
    l = ok(editLine(l, lineId(l, 'Water'), { name: 'Bottled water', amount: 300 }));
    expect(currentCycle(l)!.lines.find((x) => x.name === 'Bottled water')).toMatchObject({ amount: 300, base: 300 });
    expect(stateOf(l).spare.credit).toBe(400);
  });

  it('refuses raising an amount past spare, or lowering a budget below what was spent', () => {
    let l = started();
    expect(refused(editLine(l, lineId(l, 'Water'), { amount: 800 }))).toBe('SPARE CREDIT WOULD BE SHORT BY R100');
    const water = lineId(l, 'Water');
    l = ok(logSpend(l, { side: 'credit', total: 150, label: 'Water', parts: [{ source: water, amount: 150 }] }, ids));
    expect(refused(editLine(l, water, { amount: 100 }))).toBe('WATER WOULD BE SHORT BY R50');
  });

  it('counts top-ups in the amount shown', () => {
    let l = started();
    const food = lineId(l, 'Food');
    l = ok(topUp(l, food, 200, ids));
    expect(line(l, 'Food').allocated).toBe(2000);
    l = ok(editLine(l, food, { amount: 2100 }));
    expect(line(l, 'Food').allocated).toBe(2100);
    expect(currentCycle(l)!.lines[0]).toMatchObject({ amount: 1900, base: 2100 });
  });

  it('fixes kind and side once a line has entries; Food changes its amount only', () => {
    let l = started();
    const water = lineId(l, 'Water');
    // Before it has entries, Water may move to debit.
    expect(() => ok(editLine(l, water, { side: 'debit' }))).not.toThrow();
    l = ok(logSpend(l, { side: 'credit', total: 10, label: 'x', parts: [{ source: water, amount: 10 }] }, ids));
    expect(refused(editLine(l, water, { side: 'debit' }))).toMatch(/FIXED/);
    expect(refused(editLine(l, lineId(l, 'Food'), { name: 'Eats' }))).toMatch(/AMOUNT ONLY/);
  });
});

describe('F6 add a line', () => {
  it('holds its amount back from spare, at the end of its side', () => {
    let l = started();
    l = ok(addLine(l, { name: 'Gym', kind: 'bill', side: 'debit', amount: 400 }, ids));
    expect(currentCycle(l)!.lines.at(-1)).toMatchObject({ name: 'Gym', base: 400 });
    expect(stateOf(l).spare.debit).toBe(600);
  });

  it('refuses an amount spare can’t cover', () => {
    expect(refused(addLine(started(), { name: 'Gym', kind: 'bill', side: 'debit', amount: 1200 }, ids))).toBe(
      'SPARE DEBIT WOULD BE SHORT BY R200',
    );
  });
});

describe('F7 top up a budget line', () => {
  it('moves spare onto the line, this cycle only', () => {
    let l = started();
    l = ok(topUp(l, lineId(l, 'Food'), 300, ids));
    expect(line(l, 'Food').left).toBe(2100);
    expect(stateOf(l).spare.credit).toBe(200);
    expect(currentCycle(l)!.lines[0]!.base).toBe(1800);
  });

  it('refuses more than spare has, and bills', () => {
    const l = started();
    expect(refused(topUp(l, lineId(l, 'Food'), 600, ids))).toBe('SPARE CREDIT WOULD BE SHORT BY R100');
    expect(refused(topUp(l, lineId(l, 'Rent'), 10, ids))).toMatch(/BUDGET LINE/);
  });
});

describe('F8 move money, F9 extra cash in', () => {
  it('moves debit to credit', () => {
    let l = started();
    l = ok(move(l, 'debit-credit', 400, ids));
    expect(stateOf(l).spare).toEqual({ credit: 900, debit: 600 });
  });

  it('moves between savings and the sides', () => {
    let l = started();
    l = ok(move(l, 'debit-savings', 1000, ids));
    expect(savingsTotal(l)).toBe(9000);
    l = ok(move(l, 'savings-credit', 2500, ids));
    expect(savingsTotal(l)).toBe(6500);
    expect(stateOf(l).spare.credit).toBe(3000);
  });

  it('refuses moving more than the source has', () => {
    const l = started();
    expect(refused(move(l, 'debit-credit', 1500, ids))).toBe('SPARE DEBIT WOULD BE SHORT BY R500');
    // Amounts use a non-breaking space between thousands (lib/money.ts formatRand).
    expect(refused(move(l, 'savings-debit', 9000, ids))).toBe(`SAVINGS WOULD BE SHORT BY ${formatRand(1000)}`);
  });

  it('adds extra cash to debit, and remembers its label as a chip', () => {
    let l = started();
    l = ok(income(l, 750, 'Refund', ids));
    expect(stateOf(l).spare.debit).toBe(1750);
    expect(l.chips.income).toEqual(['Refund']);
    expect(refused(income(l, 10, '', ids))).toBe('ADD A LABEL');
  });
});

describe('F14 savings SET BALANCE', () => {
  it('logs the difference', () => {
    let l = started();
    l = ok(setSavings(l, 8300, ids));
    expect(lastEntry(l)).toMatchObject({ type: 'adjust', delta: 300, setTo: 8300 });
    expect(savingsTotal(l)).toBe(8300);
    expect(refused(setSavings(l, 8300, ids))).toMatch(/ALREADY/);
  });

  it('editing an adjustment re-aims it at the new total', () => {
    let l = started();
    l = ok(setSavings(l, 8300, ids));
    l = ok(move(l, 'debit-savings', 100, ids));
    const adjust = currentCycle(l)!.entries.find((e) => e.type === 'adjust')!;
    // Without the adjustment, savings are 8100; setting it to 7500 makes the adjustment −600.
    l = ok(setSavings(l, 7500, ids, adjust.id));
    expect(currentCycle(l)!.entries.find((e) => e.id === adjust.id)).toMatchObject({ delta: -600, setTo: 7500 });
    // Savings end at exactly the total set: 8100 without the adjustment, −600 with it.
    expect(savingsTotal(l)).toBe(7500);
  });
});

describe('F10 delete an entry', () => {
  it('puts a transaction’s money back exactly', () => {
    const before = started();
    let l = ok(logSpend(before, restaurant(before), ids));
    l = ok(deleteEntry(l, lastEntry(l).id));
    expect(stateOf(l)).toEqual(stateOf(before));
  });

  it('reopens a bill, if spare can still cover it', () => {
    let l = started();
    l = ok(tickBill(l, lineId(l, 'Rent'), 3500, ids));
    const tick = lastEntry(l);
    l = ok(move(l, 'debit-credit', 1400, ids));
    // Reopened, rent holds back 4000 again but only 3500 comes back: spare 100 would be −400.
    expect(refused(deleteEntry(l, tick.id))).toBe('SPARE DEBIT WOULD BE SHORT BY R400');
  });

  it('puts a cancelled line back in its place', () => {
    const before = started();
    let l = ok(cancelLine(before, lineId(before, 'Water'), ids));
    l = ok(deleteEntry(l, lastEntry(l).id));
    expect(currentCycle(l)!.lines).toEqual(currentCycle(before)!.lines);
    expect(stateOf(l)).toEqual(stateOf(before));
  });

  it('refuses deleting income that was already spent', () => {
    let l = started();
    l = ok(income(l, 500, 'Refund', ids));
    const cash = lastEntry(l);
    l = ok(logSpend(l, { side: 'debit', total: 1200, label: 'x', parts: [{ source: SPARE, amount: 1200 }] }, ids));
    expect(refused(deleteEntry(l, cash.id))).toBe('SPARE DEBIT WOULD BE SHORT BY R200');
  });

  it('never deletes a start or salary entry', () => {
    const l = started();
    expect(refused(deleteEntry(l, currentCycle(l)!.entries[0]!.id))).toMatch(/UNDONE/);
  });
});

describe('F1 load salary', () => {
  /** The next salary on the 25th, with RESET lines and the actual balances. */
  const salaryInput = (l: Ledger) => ({
    receivedAt: at(2026, 11, 25, 9),
    salary: 20000,
    savings: 3000,
    credit: 3000,
    payDate: at(2026, 12, 24),
    actualDebit: 14500,
    actualCredit: 3200,
    lines: templateLines(currentCycle(l)!),
  });

  it('opens the next cycle from the actual balances (D16, D18) and adds the savings', () => {
    let l = started();
    l = ok(logSpend(l, restaurant(l), ids));
    l = ok(loadSalary(l, salaryInput(l), makeIds(at(2026, 11, 25, 10))));
    expect(l.cycles).toHaveLength(2);
    expect(l.cycles[0]!.closedAt).not.toBeNull();
    const s = stateOf(l);
    // Credit: 3200 − (1800 + 200 + 250 + 250) = 700. Debit: 14500 − (4000 + 500) = 10000.
    expect(s.spare).toEqual({ credit: 700, debit: 10000 });
    expect(savingsTotal(l)).toBe(11000);
    // RESET: every line back at its default, bills open again.
    expect(line(l, 'Food').left).toBe(1800);
    expect(line(l, 'Electricity').paid).toBe(false);
  });

  it('matches the live preview', () => {
    const l = started();
    expect(salarySpare(salaryInput(l))).toEqual({ credit: 700, debit: 10000 });
  });

  it('refuses savings and credit that add up to more than the salary', () => {
    const l = started();
    const later = makeIds(at(2026, 11, 25, 10));
    expect(refused(loadSalary(l, { ...salaryInput(l), savings: 21000 }, later))).toMatch(/MORE THAN THE SALARY/);
    expect(refused(loadSalary(l, { ...salaryInput(l), credit: 18000 }, later))).toMatch(/ADD UP TO MORE/);
  });

  it('refuses a future date received, and a pay date not after it', () => {
    const l = started();
    expect(refused(loadSalary(l, salaryInput(l), ids))).toMatch(/FUTURE/);
    const later = makeIds(at(2026, 11, 25, 10));
    expect(refused(loadSalary(l, { ...salaryInput(l), payDate: at(2026, 11, 25) }, later))).toMatch(/AFTER THE DATE RECEIVED/);
  });

  it('refuses lines the actual balance can’t cover', () => {
    const l = started();
    expect(refused(loadSalary(l, { ...salaryInput(l), actualDebit: 4000 }, makeIds(at(2026, 11, 25, 10))))).toBe(
      'SPARE DEBIT WOULD BE SHORT BY R500',
    );
  });

  it('leaves the closed cycle read-only for the builders', () => {
    let l = started();
    const oldTick = ok(tickBill(l, lineId(l, 'Rent'), 4000, ids));
    l = ok(loadSalary(oldTick, salaryInput(oldTick), makeIds(at(2026, 11, 25, 10))));
    const oldEntry = l.cycles[0]!.entries.at(-1)!;
    expect(refused(deleteEntry(l, oldEntry.id))).toMatch(/ISN’T IN THIS CYCLE/);
  });
});

describe('chips (D29)', () => {
  it('adds, renames and removes, refusing duplicates', () => {
    let l = started();
    l = ok(addChip(l, 'spend', 'Fuel'));
    expect(refused(addChip(l, 'spend', 'fuel'))).toMatch(/ALREADY/);
    l = ok(renameChip(l, 'spend', 0, 'Petrol'));
    expect(l.chips.spend).toEqual(['Petrol']);
    l = ok(removeChip(l, 'spend', 0));
    expect(l.chips.spend).toEqual([]);
  });
});
