/**
 * __tests__/lib/expected.test.ts: expected money (PLAN D32–D37, F15–F18),
 * money someone else pays in towards a debit bill.
 *
 * The worked example from the plan: R20 000 in debit; Rent R10 000 with
 * Partner R5 000 coming in, Internet R800 with Partner R400. Spare debit is
 * 20 000 − 5 000 − 400 = R14 600, and stays R14 600 when Partner's R5 400
 * arrives (debit 25 400 − 10 800 held back). Each rule is checked with its
 * blocked branches, and every delete with what it puts back.
 */
import { describeEntry } from '@/lib/entries';
import {
  cancelLine,
  computeCycle,
  currentCycle,
  deleteEntry,
  dues,
  editLine,
  emptyLedger,
  knownPayers,
  loadSalary,
  payerDues,
  receive,
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
import { migrate } from '@/store/migrations';

import fixtureV1 from '../fixtures/ledger-v1.json';

/** Local time → epoch ms (month is 1-based here). */
const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 11, 3, 12);
const PAYDAY = at(2026, 11, 25);

/** Sequential IDs at a fixed time. */
function makeIds(now = NOW) {
  let n = 0;
  return { newId: () => `id${++n}`, now };
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

/** The plan's example, set up mid-cycle with nothing received yet. */
const SETUP: StartInput = {
  savingsOnHand: 0,
  actualCredit: 2000,
  actualDebit: 20000,
  payDate: PAYDAY,
  lines: [
    { name: 'Food', kind: 'budget', side: 'credit', isFood: true, monthly: 1800, leftNow: 1800, paid: false },
    {
      name: 'Rent',
      kind: 'bill',
      side: 'debit',
      isFood: false,
      monthly: 10000,
      leftNow: 0,
      paid: false,
      expected: { payer: 'Partner', amount: 5000 },
    },
    {
      name: 'Internet',
      kind: 'bill',
      side: 'debit',
      isFood: false,
      monthly: 800,
      leftNow: 0,
      paid: false,
      expected: { payer: 'partner ', amount: 400 },
    },
    { name: 'Card settlement', kind: 'bill', side: 'debit', isFood: false, monthly: 1200, leftNow: 0, paid: false },
  ],
};

const started = (input: StartInput = SETUP) => ok(start(emptyLedger(), input, ids));
const state = (l: Ledger) => computeCycle(currentCycle(l)!);
const line = (l: Ledger, name: string) => state(l).lines.find((x) => x.line.name === name)!;
const lineId = (l: Ledger, name: string) => line(l, name).line.id;
const partnerKey = 'bills:partner';

describe('D32 a bill holds back only your share until theirs arrives', () => {
  it('spare debit counts only your share (the worked example)', () => {
    const l = started();
    // 20 000 − (5 000 + 400 + 1 200) = 13 400.
    expect(state(l).spare.debit).toBe(13400);
    expect(line(l, 'Rent')).toMatchObject({ left: 5000, due: 5000, received: false });
    expect(startSpare(SETUP).debit).toBe(13400);
  });

  it('receiving it leaves spare debit as it is (D33: one payment covers both bills)', () => {
    let l = started();
    l = ok(receive(l, partnerKey, 5400, ids));
    const s = state(l);
    expect(s.balance.debit).toBe(25400);
    expect(s.spare.debit).toBe(13400);
    expect(line(l, 'Rent')).toMatchObject({ left: 10000, due: 0, received: true });
    expect(line(l, 'Internet')).toMatchObject({ left: 800, due: 0, received: true });
    expect(dues(currentCycle(l)!)).toEqual([]);
  });
});

describe('dues', () => {
  it('groups shares by payer, ignoring case and spacing, in line order', () => {
    const l = started();
    expect(dues(currentCycle(l)!)).toEqual([
      {
        key: partnerKey,
        payer: 'Partner',
        amount: 5400,
        shares: [
          { lineId: lineId(l, 'Rent'), amount: 5000 },
          { lineId: lineId(l, 'Internet'), amount: 400 },
        ],
      },
    ]);
    expect(knownPayers(l)).toEqual(['Partner']);
  });
});

describe('D34 what arrives may differ from what was expected', () => {
  it('less: the shortfall comes out of spare debit', () => {
    const l = ok(receive(started(), partnerKey, 5200, ids));
    expect(state(l).spare.debit).toBe(13200);
    expect(describeEntry(currentCycle(l)!.entries.at(-1)!, currentCycle(l)!)).toMatchObject({
      glyph: 'receive',
      title: 'FROM PARTNER',
      amount: `+${formatRand(5200)}`,
      side: 'DB',
      detail: `RENT ${formatRand(5000)} · INTERNET R400 · EXPECTED ${formatRand(5400)}`,
    });
  });

  it('more: the extra goes to spare debit', () => {
    const l = ok(receive(started(), partnerKey, 6000, ids));
    expect(state(l).spare.debit).toBe(14000);
  });

  it('refuses a shortfall spare debit can’t cover', () => {
    const tight = { ...SETUP, actualDebit: 6700 }; // spare 100
    expect(refused(receive(started(tight), partnerKey, 5000, ids))).toBe('SPARE DEBIT WOULD BE SHORT BY R300');
  });

  it('refuses R0, and a payer with nothing due', () => {
    const l = started();
    expect(refused(receive(l, partnerKey, 0, ids))).toMatch(/ABOVE R0/);
    expect(refused(receive(l, 'bills:landlord', 100, ids))).toMatch(/NOTHING IS DUE/);
    const done = ok(receive(l, partnerKey, 5400, ids));
    expect(refused(receive(done, partnerKey, 5400, ids))).toMatch(/NOTHING IS DUE/);
  });

  it('a receipt can be changed (what arrived) and deleted (it’s due again)', () => {
    let l = ok(receive(started(), partnerKey, 5400, ids));
    const entry = currentCycle(l)!.entries.at(-1)!;
    l = ok(receive(l, '', 5300, ids, entry.id));
    expect(state(l).spare.debit).toBe(13300);
    expect(currentCycle(l)!.entries.filter((e) => e.type === 'receive')).toHaveLength(1);
    l = ok(deleteEntry(l, entry.id));
    expect(state(l).spare.debit).toBe(13400);
    expect(line(l, 'Rent').due).toBe(5000);
  });
});

describe('D35 a bill with money due can’t be ticked off', () => {
  it('refuses the tick until it’s received, then allows it', () => {
    let l = started();
    expect(refused(tickBill(l, lineId(l, 'Rent'), 10000, ids))).toBe(`PARTNER ${formatRand(5000)} STILL DUE ON RENT: RECEIVE IT FIRST`);
    l = ok(receive(l, partnerKey, 5400, ids));
    l = ok(tickBill(l, lineId(l, 'Rent'), 10000, ids));
    expect(state(l).spare.debit).toBe(13400);
  });

  it('a receipt can’t be deleted while a bill it covers is paid', () => {
    let l = ok(receive(started(), partnerKey, 5400, ids));
    const receipt = currentCycle(l)!.entries.at(-1)!;
    l = ok(tickBill(l, lineId(l, 'Rent'), 10000, ids));
    expect(refused(deleteEntry(l, receipt.id))).toMatch(/STILL DUE ON RENT/);
  });
});

describe('F15 setting expected money', () => {
  it('is for debit bills only, at most the bill, with a payer', () => {
    const l = started();
    const food = lineId(l, 'Food');
    expect(refused(editLine(l, food, { expected: { payer: 'Partner', amount: 100 } }))).toMatch(
      /FOOD CHANGES ITS AMOUNT ONLY|DEBIT BILLS ONLY/,
    );
    const card = lineId(l, 'Card settlement');
    expect(refused(editLine(l, card, { expected: { payer: 'Partner', amount: 1300 } }))).toMatch(/CAN’T BE MORE THAN THE BILL/);
    expect(refused(editLine(l, card, { expected: { payer: ' ', amount: 100 } }))).toMatch(/SAY WHO PAYS IT IN/);
    expect(refused(editLine(l, lineId(l, 'Rent'), { side: 'credit' }))).toMatch(/DEBIT BILLS ONLY/);
  });

  it('changing it while due moves spare to match; removing it makes you cover it', () => {
    let l = started();
    l = ok(editLine(l, lineId(l, 'Rent'), { expected: { payer: 'Partner', amount: 4000 } }));
    expect(state(l).spare.debit).toBe(12400);
    l = ok(editLine(l, lineId(l, 'Rent'), { expected: null }));
    expect(state(l).spare.debit).toBe(8400);
    expect(line(l, 'Rent').line.expected).toBeUndefined();
    // Spare can't always cover it.
    const tight = started({ ...SETUP, actualDebit: 7000 });
    expect(refused(editLine(tight, lineId(tight, 'Rent'), { expected: null }))).toMatch(/SPARE DEBIT WOULD BE SHORT/);
  });

  it('is locked once received', () => {
    const l = ok(receive(started(), partnerKey, 5400, ids));
    expect(refused(editLine(l, lineId(l, 'Rent'), { expected: null }))).toMatch(/ALREADY RECEIVED/);
    // Other changes are still fine.
    expect(ok(editLine(l, lineId(l, 'Rent'), { name: 'Flat' })).cycles).toHaveLength(1);
  });

  it('setup: ALREADY RECEIVED is in the balance, and a paid bill has nothing to come in', () => {
    const input: StartInput = {
      ...SETUP,
      lines: SETUP.lines.map((x) => (x.name === 'Rent' ? { ...x, expectedIn: true } : x.name === 'Internet' ? { ...x, paid: true } : x)),
    };
    // Rent holds 10 000 (received), Internet nothing (paid), card 1 200.
    expect(startSpare(input).debit).toBe(8800);
    const l = started(input);
    expect(state(l).spare.debit).toBe(8800);
    expect(line(l, 'Rent')).toMatchObject({ received: true, due: 0 });
    expect(line(l, 'Internet').line.expected).toBeUndefined();
    const receipt = currentCycle(l)!.entries.find((e) => e.type === 'receive')!;
    expect(receipt).toMatchObject({ amount: 0, beforeStart: true });
    expect(describeEntry(receipt, currentCycle(l)!)).toMatchObject({ amount: null, detail: 'RECEIVED BEFORE SETUP' });
    expect(refused(receive(l, '', 100, ids, receipt.id))).toMatch(/BEFORE SETUP/);
  });
});

describe('F18 cancelling a bill with money due', () => {
  it('only your share comes back, and its share leaves the payer’s due', () => {
    let l = started();
    l = ok(cancelLine(l, lineId(l, 'Internet'), ids));
    expect(state(l).spare.debit).toBe(13800);
    expect(dues(currentCycle(l)!)[0]!.amount).toBe(5000);
  });

  it('once received, the whole bill comes back', () => {
    let l = ok(receive(started(), partnerKey, 5400, ids));
    l = ok(cancelLine(l, lineId(l, 'Internet'), ids));
    expect(state(l).spare.debit).toBe(14200);
  });
});

describe('D37 the salary load: CARRY or DROP', () => {
  const salaryInput = (l: Ledger) => ({
    receivedAt: at(2026, 11, 25, 9),
    salary: 25000,
    savings: 0,
    credit: 2000,
    payDate: at(2026, 12, 24),
    actualDebit: 20000,
    actualCredit: 2000,
    lines: templateLines(currentCycle(l)!),
  });
  const later = () => makeIds(at(2026, 11, 25, 10));

  it('the template keeps the expected money, due again in the new cycle', () => {
    const l = started();
    expect(templateLines(currentCycle(l)!).find((x) => x.name === 'Rent')!.expected).toEqual({ payer: 'Partner', amount: 5000 });
    expect(salarySpare(salaryInput(l)).debit).toBe(13400);
  });

  it('asks about every payer still due', () => {
    const l = started();
    expect(payerDues(currentCycle(l)!)).toEqual([{ key: 'partner', payer: 'Partner', amount: 5400 }]);
    expect(refused(loadSalary(l, salaryInput(l), later()))).toBe('CHOOSE CARRY OR DROP FOR PARTNER');
  });

  it('DROP: nothing carries; the new month’s share is due as normal', () => {
    let l = started();
    l = ok(loadSalary(l, { ...salaryInput(l), stillDue: { partner: 'drop' } }, later()));
    expect(dues(currentCycle(l)!).map((d) => d.amount)).toEqual([5400]);
    expect(state(l).spare.debit).toBe(13400);
  });

  it('CARRY: a separate item, not tied to a bill, that adds to spare when received', () => {
    let l = started();
    l = ok(loadSalary(l, { ...salaryInput(l), stillDue: { partner: 'carry' } }, later()));
    const cycle = currentCycle(l)!;
    const carried = dues(cycle).find((d) => d.carryId)!;
    expect(carried).toMatchObject({ payer: 'Partner', amount: 5400, shares: [] });
    expect(describeEntry(cycle.entries[1]!, cycle)).toMatchObject({ glyph: 'carry', title: 'PARTNER STILL DUE', amount: formatRand(5400) });
    // It holds nothing back…
    expect(state(l).spare.debit).toBe(13400);
    // …and goes to spare when it arrives.
    l = ok(receive(l, carried.key, 5400, ids));
    expect(state(l).spare.debit).toBe(18800);
    expect(describeEntry(currentCycle(l)!.entries.at(-1)!, currentCycle(l)!).detail).toBe('FROM LAST CYCLE');
    // The carry can't be dropped (deleted) once received; the receipt goes first.
    expect(refused(deleteEntry(l, cycle.entries[1]!.id))).toMatch(/DELETE THE RECEIPT FIRST/);
    l = ok(deleteEntry(l, currentCycle(l)!.entries.at(-1)!.id));
    l = ok(deleteEntry(l, cycle.entries[1]!.id));
    expect(dues(currentCycle(l)!).filter((d) => d.carryId)).toEqual([]);
  });

  it('a carried amount still due at the next payday is asked about again, with the new shares', () => {
    let l = started();
    l = ok(loadSalary(l, { ...salaryInput(l), stillDue: { partner: 'carry' } }, later()));
    expect(payerDues(currentCycle(l)!)).toEqual([{ key: 'partner', payer: 'Partner', amount: 10800 }]);
  });

  it('nothing to ask when everything arrived', () => {
    let l = ok(receive(started(), partnerKey, 5400, ids));
    l = ok(loadSalary(l, salaryInput(l), later()));
    expect(currentCycle(l)!.entries.filter((e) => e.type === 'carry')).toEqual([]);
  });
});

describe('schema 2', () => {
  it('migrates version 1 data unchanged, stamped as version 2', () => {
    const { ledger, migrated } = migrate(JSON.parse(JSON.stringify(fixtureV1)));
    expect(migrated).toBe(true);
    expect(ledger.schemaVersion).toBe(2);
    expect(ledger.cycles).toEqual(fixtureV1.cycles);
  });

  it('a ledger with expected money, receipts and carries passes the load checks', () => {
    let l = started();
    l = ok(
      loadSalary(
        l,
        {
          ...{
            receivedAt: at(2026, 11, 25, 9),
            salary: 25000,
            savings: 0,
            credit: 2000,
            payDate: at(2026, 12, 24),
            actualDebit: 20000,
            actualCredit: 2000,
            lines: templateLines(currentCycle(l)!),
          },
          stillDue: { partner: 'carry' },
        },
        makeIds(at(2026, 11, 25, 10)),
      ),
    );
    l = ok(receive(l, partnerKey, 5400, ids));
    expect(() => migrate(JSON.parse(JSON.stringify(l)))).not.toThrow();
  });
});
