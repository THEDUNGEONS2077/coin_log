/**
 * __tests__/store/store.test.ts: the store's wiring (store/createStore.ts):
 * every flow is one undo step with its toast, a refused change leaves
 * everything as it was, and persistence writes the ledger.
 *
 * The rules themselves are tested in __tests__/lib/ledger.test.ts; this file
 * checks what the store adds around them.
 */
import { currentCycle, savingsTotal } from '@/lib/ledger';
import type { StartInput } from '@/lib/ledger';
import { SPARE } from '@/lib/types';
import { createAppStore, installPersistence } from '@/store/createStore';
import { createMemoryKV, KEYS } from '@/store/kv';

const NOW = new Date(2026, 9, 27, 12).getTime();

const SETUP: StartInput = {
  savingsOnHand: 1000,
  actualCredit: 2000,
  actualDebit: 3000,
  payDate: new Date(2026, 10, 25).getTime(),
  lines: [
    { name: 'Food', kind: 'budget', side: 'credit', isFood: true, monthly: 1500, leftNow: 1500, paid: false },
    { name: 'Rent', kind: 'bill', side: 'debit', isFood: false, monthly: 2500, leftNow: 0, paid: false },
  ],
};

/** A store on an in-memory KV, with sequential IDs and a fixed clock. */
function makeStore(kv = createMemoryKV()) {
  let n = 0;
  return createAppStore({ kv, now: () => NOW, newId: () => `id${++n}` });
}

describe('flows through the store', () => {
  it('records each change as one undo step, with its toast', () => {
    const store = makeStore();
    const s = () => store.getState();
    expect(s().start(SETUP)).toBeNull();
    expect(s().toast).toMatchObject({ message: 'STARTED', undo: true });
    const started = s().ledger;

    expect(s().logSpend({ side: 'credit', total: 100, label: 'Lunch', parts: [{ source: SPARE, amount: 100 }] })).toBeNull();
    expect(s().toast).toMatchObject({ message: 'LOGGED', undo: true });
    expect(currentCycle(s().ledger)!.entries).toHaveLength(2);

    expect(s().undo()).toBe(true);
    expect(s().ledger).toBe(started);
    expect(s().redo()).toBe(true);
    expect(currentCycle(s().ledger)!.entries).toHaveLength(2);
  });

  it('a refused change returns its reason and changes nothing', () => {
    const store = makeStore();
    store.getState().start(SETUP);
    const before = store.getState().ledger;
    const pastBefore = store.getState().history.past.length;
    const error = store.getState().move('savings-debit', 5000);
    expect(error).toMatch(/SAVINGS WOULD BE SHORT/);
    expect(store.getState().ledger).toBe(before);
    expect(store.getState().history.past).toHaveLength(pastBefore);
  });

  it('chip edits hide a toast whose UNDO would undo the wrong step', () => {
    const store = makeStore();
    store.getState().start(SETUP);
    expect(store.getState().toast).not.toBeNull();
    expect(store.getState().addChip('spend', 'Fuel')).toBeNull();
    expect(store.getState().toast).toBeNull();
  });

  it('delete all data is one undo step away from coming back', () => {
    const store = makeStore();
    store.getState().start(SETUP);
    store.getState().deleteAllData();
    expect(store.getState().ledger.cycles).toHaveLength(0);
    store.getState().undo();
    expect(savingsTotal(store.getState().ledger)).toBe(1000);
  });

  it('remembers the side last spent on', () => {
    const store = makeStore();
    store.getState().setLastSpendSide('debit');
    expect(store.getState().ui.lastSpendSide).toBe('debit');
  });
});

describe('persistence', () => {
  it('writes the ledger (throttled) and loads it back', () => {
    jest.useFakeTimers();
    try {
      const kv = createMemoryKV();
      const store = makeStore(kv);
      const stop = installPersistence(store, kv, { listenAppState: false });
      store.getState().start(SETUP);
      expect(kv.getString(KEYS.ledger)).toBeUndefined();
      jest.advanceTimersByTime(300);
      expect(kv.getString(KEYS.ledger)).toBeDefined();
      stop();
      // A second launch reads the same budget.
      expect(makeStore(kv).getState().ledger).toEqual(store.getState().ledger);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never writes over data from a newer app version', () => {
    const kv = createMemoryKV({ [KEYS.ledger]: JSON.stringify({ schemaVersion: 99, cycles: [], chips: { spend: [], income: [] } }) });
    const store = makeStore(kv);
    const stop = installPersistence(store, kv, { listenAppState: false });
    store.getState().start(SETUP);
    stop();
    expect(JSON.parse(kv.getString(KEYS.ledger)!).schemaVersion).toBe(99);
  });
});
