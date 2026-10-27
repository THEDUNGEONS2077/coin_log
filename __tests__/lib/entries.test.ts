/**
 * __tests__/lib/entries.test.ts: what each entry says on the LOG and
 * SAVINGS tabs (lib/entries.ts).
 */
import { describeEntry, savingsHistory } from '@/lib/entries';
import {
  cancelLine,
  currentCycle,
  emptyLedger,
  income,
  logSpend,
  move,
  type Result,
  setSavings,
  start,
  tickBill,
  topUp,
} from '@/lib/ledger';
import { type Ledger, SPARE } from '@/lib/types';

const NOW = new Date(2026, 9, 27, 12).getTime();
let n = 0;
const ids = { newId: () => `id${++n}`, now: NOW };

/** The ledger from a result (failing the test with the refusal otherwise). */
function ok(r: Result): Ledger {
  if (!r.ok) throw new Error(r.error);
  return r.ledger;
}

/** A small budget: Food and Water on credit, Rent on debit. */
function started(): Ledger {
  return ok(
    start(
      emptyLedger(),
      {
        savingsOnHand: 8000,
        actualCredit: 3000,
        actualDebit: 5000,
        payDate: new Date(2026, 10, 25).getTime(),
        lines: [
          { name: 'Food', kind: 'budget', side: 'credit', isFood: true, monthly: 1800, leftNow: 1800, paid: false },
          { name: 'Water', kind: 'budget', side: 'credit', isFood: false, monthly: 200, leftNow: 200, paid: false },
          { name: 'Rent', kind: 'bill', side: 'debit', isFood: false, monthly: 4000, leftNow: 0, paid: false },
        ],
      },
      ids,
    ),
  );
}

/** The newest entry, described. */
const last = (l: Ledger) => {
  const cycle = currentCycle(l)!;
  return describeEntry(cycle.entries.at(-1)!, cycle);
};
const id = (l: Ledger, name: string) => currentCycle(l)!.lines.find((x) => x.name === name)!.id;
const NB = ' ';
const MINUS = '−';

describe('describeEntry', () => {
  it('a start lists the balances it began from', () => {
    expect(last(started())).toMatchObject({
      glyph: 'start',
      title: 'START',
      amount: null,
      detail: `DEBIT R5${NB}000 · CREDIT R3${NB}000 · SAVINGS R8${NB}000`,
    });
  });

  it('a transaction shows minus its total and its parts', () => {
    let l = started();
    l = ok(
      logSpend(
        l,
        {
          side: 'credit',
          total: 200,
          label: 'Restaurant',
          parts: [
            { source: id(l, 'Food'), amount: 100 },
            { source: SPARE, amount: 100 },
          ],
        },
        ids,
      ),
    );
    expect(last(l)).toEqual({ glyph: 'spend', title: 'RESTAURANT', amount: `${MINUS}R200`, side: 'CR', detail: 'FOOD R100 · SPARE R100' });
  });

  it('a paid bill shows what was paid against the bill', () => {
    let l = started();
    l = ok(tickBill(l, id(l, 'Rent'), 3800, ids));
    expect(last(l)).toEqual({ glyph: 'paid', title: 'PAID RENT', amount: `${MINUS}R3${NB}800`, side: 'DB', detail: `BILL R4${NB}000` });
  });

  it('a cancelled line still has its name, and what came back', () => {
    let l = started();
    l = ok(cancelLine(l, id(l, 'Water'), ids));
    expect(last(l)).toMatchObject({ glyph: 'cancel', title: 'CANCELLED WATER', detail: 'R200 BACK TO SPARE CREDIT' });
  });

  it('moves within the budget carry no sign; money in does', () => {
    let l = started();
    l = ok(topUp(l, id(l, 'Food'), 100, ids));
    expect(last(l)).toMatchObject({ title: 'TOP UP FOOD', amount: 'R100', detail: 'FROM SPARE CREDIT' });
    l = ok(move(l, 'debit-credit', 300, ids));
    expect(last(l)).toMatchObject({ title: 'DEBIT → CREDIT', amount: 'R300' });
    l = ok(income(l, 500, 'Refund', ids));
    expect(last(l)).toMatchObject({ title: 'REFUND', amount: '+R500', side: 'DB' });
    l = ok(setSavings(l, 8300, ids));
    expect(last(l)).toMatchObject({ title: `SAVINGS SET TO R8${NB}300`, amount: '+R300' });
  });
});

describe('savingsHistory', () => {
  it('lists what changed savings, newest first', () => {
    let l = started();
    l = ok(move(l, 'debit-savings', 500, ids));
    l = ok(logSpend(l, { side: 'credit', total: 10, label: 'x', parts: [{ source: SPARE, amount: 10 }] }, ids));
    l = ok(move(l, 'savings-credit', 200, ids));
    expect(savingsHistory(l).map((x) => x.delta)).toEqual([-200, 500, 8000]);
  });
});
