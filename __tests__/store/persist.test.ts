/**
 * __tests__/store/persist.test.ts: loading, migrating, recovering and saving
 * the ledger (store/persist.ts, store/migrations).
 *
 * The safety net is quest_log's: a newer app's data is never overwritten,
 * unreadable data is kept under `corrupt.*` and the newest good snapshot is
 * loaded instead, and writes are throttled into one trailing write.
 */
import { computeCycle, currentCycle, emptyLedger, savingsTotal } from '@/lib/ledger';
import { SCHEMA_VERSION } from '@/lib/types';
import { createMemoryKV, KEYS } from '@/store/kv';
import { assertValidLedger, FutureSchemaError, migrate, MIGRATIONS } from '@/store/migrations';
import {
  createThrottledWriter,
  listDailySnapshots,
  loadJSON,
  loadLedger,
  localDateKey,
  saveLedger,
  takeDailySnapshot,
} from '@/store/persist';

import fixtureV1 from '../fixtures/ledger-v1.json';

const NOW = new Date(2026, 9, 27, 12).getTime();
/** The fixture as a fresh object (tests mutate copies). */
const fixture = () => JSON.parse(JSON.stringify(fixtureV1));

describe('migrations', () => {
  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v]).toBeDefined();
  });

  it('loads the v1 fixture into the current format, numbers intact', () => {
    const { ledger } = migrate(fixture());
    expect(ledger.cycles).toHaveLength(2);
    // Current cycle: credit 3200 − Food 1800 = 1400; debit 14500 − 1000 moved to savings − rent 4000 = 9500.
    expect(computeCycle(currentCycle(ledger)!).spare).toEqual({ credit: 1400, debit: 9500 });
    // 8000 on hand + 3000 from the salary + 1000 moved + 250 adjusted.
    expect(savingsTotal(ledger)).toBe(12250);
  });

  it('refuses data from a newer app version', () => {
    expect(() => migrate({ ...fixture(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FutureSchemaError);
  });

  it('rejects structurally broken ledgers', () => {
    const noChips = { ...fixture(), chips: undefined };
    expect(() => assertValidLedger(noChips)).toThrow();
    const twoOpen = fixture();
    twoOpen.cycles[0].closedAt = null;
    expect(() => assertValidLedger(twoOpen)).toThrow(/open\/closed/);
    const noOpening = fixture();
    noOpening.cycles[1].entries.shift();
    expect(() => assertValidLedger(noOpening)).toThrow(/opening entry/);
    const duplicateLine = fixture();
    duplicateLine.cycles[1].lines.push(duplicateLine.cycles[1].lines[0]);
    expect(() => assertValidLedger(duplicateLine)).toThrow(/line id/);
    const halfRand = fixture();
    halfRand.cycles[1].lines[0].base = 12.5;
    expect(() => assertValidLedger(halfRand)).toThrow(/amounts/);
  });

  it('accepts an empty ledger (before setup)', () => {
    expect(() => assertValidLedger(emptyLedger())).not.toThrow();
  });
});

describe('loadLedger', () => {
  it('starts fresh when nothing is saved', () => {
    expect(loadLedger(createMemoryKV(), NOW)).toMatchObject({ status: 'fresh', writable: true, ledger: emptyLedger() });
  });

  it('round-trips saved data', () => {
    const kv = createMemoryKV();
    const { ledger } = migrate(fixture());
    saveLedger(kv, ledger);
    expect(loadLedger(kv, NOW)).toEqual({ ledger, writable: true, status: 'loaded' });
  });

  it('keeps corrupt bytes and recovers from the newest valid snapshot', () => {
    const kv = createMemoryKV({
      [KEYS.ledger]: '{not json',
      'snapshot.2026-10-25': JSON.stringify(fixture()),
      'snapshot.2026-10-26': 'garbage',
    });
    const result = loadLedger(kv, NOW);
    expect(result.status).toBe('recovered-from-snapshot');
    expect(result.ledger.cycles).toHaveLength(2);
    expect(kv.getString(`${KEYS.corruptPrefix}${NOW}`)).toBe('{not json');
  });

  it('falls back to empty when no snapshot is usable, still keeping the bytes', () => {
    const kv = createMemoryKV({ [KEYS.ledger]: '{"schemaVersion":1}' });
    expect(loadLedger(kv, NOW)).toMatchObject({ status: 'recovered-empty', ledger: emptyLedger() });
    expect(kv.getString(`${KEYS.corruptPrefix}${NOW}`)).toBe('{"schemaVersion":1}');
  });

  it('does not allow writes over data from a newer app version', () => {
    const kv = createMemoryKV({ [KEYS.ledger]: JSON.stringify({ ...fixture(), schemaVersion: SCHEMA_VERSION + 1 }) });
    expect(loadLedger(kv, NOW)).toMatchObject({ status: 'future-schema', writable: false });
  });
});

describe('daily snapshots', () => {
  it('writes one per day and keeps the newest 3', () => {
    const kv = createMemoryKV();
    const { ledger } = migrate(fixture());
    const day = 86_400_000;
    for (let i = 0; i < 5; i++) expect(takeDailySnapshot(kv, ledger, NOW + i * day)).toBe(true);
    // Snapshots are plain ledgers (readable, and loadable by migrate()).
    expect(migrate(JSON.parse(kv.getString('snapshot.2026-10-31')!)).ledger).toEqual(ledger);
    expect(takeDailySnapshot(kv, ledger, NOW + 4 * day + 1000)).toBe(false); // same day again
    expect(listDailySnapshots(kv)).toEqual(['snapshot.2026-10-31', 'snapshot.2026-10-30', 'snapshot.2026-10-29']);
  });

  it('formats local date keys', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('createThrottledWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst of changes into one trailing write', () => {
    const write = jest.fn();
    const w = createThrottledWriter(write, 300);
    for (let i = 0; i < 50; i++) w.markDirty();
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately and only when something is pending', () => {
    const write = jest.fn();
    const w = createThrottledWriter(write, 300);
    w.flush();
    expect(write).not.toHaveBeenCalled();
    w.markDirty();
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1); // the timer was cancelled by flush
  });
});

describe('loadJSON', () => {
  it('fills defaults for missing fields and ignores garbage', () => {
    const kv = createMemoryKV({ ok: '{"a":5}', bad: 'nope' });
    expect(loadJSON(kv, 'ok', { a: 1, b: 2 })).toEqual({ a: 5, b: 2 });
    expect(loadJSON(kv, 'bad', { a: 1 })).toEqual({ a: 1 });
    expect(loadJSON(kv, 'missing', { a: 1 })).toEqual({ a: 1 });
  });
});
