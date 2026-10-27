/**
 * store/persist.ts: loading and saving app data in MMKV.
 *
 * Layer: store. The ledger (lib/types.ts) is saved as one JSON document
 * under `ledger.v1`: a budget is small (a few hundred entries a year), so
 * there's no need for quest_log's per-bucket saving. The safety net is
 * quest_log's, unchanged:
 *
 * Startup (all synchronous, before the first render):
 *   1. read the document,
 *   2. if it's an old format, keep a pre-migration snapshot, then migrate,
 *   3. validate,
 *   4. if anything is unreadable, keep the raw data under `corrupt.<time>`
 *      (never overwrite it) and fall back to the newest daily snapshot.
 *
 * Saving: throttled to one write per 300 ms (trailing edge), and flushed
 * when the app leaves the foreground. A daily snapshot of the ledger is
 * kept for 3 days.
 */
import { emptyLedger } from '@/lib/ledger';
import type { Ledger } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

import { KEYS, type KV } from './kv';
import { FutureSchemaError, migrate } from './migrations';

/** Write throttle window. */
export const PERSIST_THROTTLE_MS = 300;
/** Daily snapshots kept. */
export const SNAPSHOTS_KEPT = 3;

/** Outcome of loading the ledger, for diagnostics and recovery messages. */
export interface LoadResult {
  ledger: Ledger;
  /**
   * False when saved data comes from a newer app version: the app runs on
   * an empty ledger and must not overwrite the newer data.
   */
  writable: boolean;
  status: 'fresh' | 'loaded' | 'migrated' | 'recovered-from-snapshot' | 'recovered-empty' | 'future-schema';
}

/**
 * Loads the ledger (startup steps 1–4 above). Never throws: every failure
 * path keeps the original bytes and returns something usable.
 */
export function loadLedger(kv: KV, now: number): LoadResult {
  const raw = kv.getString(KEYS.ledger);
  if (raw === undefined) return { ledger: emptyLedger(), writable: true, status: 'fresh' };

  try {
    const data = JSON.parse(raw) as { schemaVersion?: unknown };
    // Keep the exact pre-migration data before running any migration.
    if (typeof data?.schemaVersion === 'number' && data.schemaVersion < SCHEMA_VERSION) {
      kv.set(`${KEYS.snapshotPrefix}premigration.v${data.schemaVersion}`, raw);
    }
    const { ledger, migrated } = migrate(data);
    return { ledger, writable: true, status: migrated ? 'migrated' : 'loaded' };
  } catch (e) {
    if (e instanceof FutureSchemaError) return { ledger: emptyLedger(), writable: false, status: 'future-schema' };
    // Unreadable: preserve the raw value, then try the newest snapshot.
    kv.set(`${KEYS.corruptPrefix}${now}`, raw);
    return recoverFromSnapshot(kv);
  }
}

/** Loads the newest daily snapshot that migrates and validates; empty if none does. */
function recoverFromSnapshot(kv: KV): LoadResult {
  for (const key of listDailySnapshots(kv)) {
    try {
      const { ledger } = migrate(JSON.parse(kv.getString(key) ?? ''));
      return { ledger, writable: true, status: 'recovered-from-snapshot' };
    } catch {
      // Try the next older snapshot.
    }
  }
  return { ledger: emptyLedger(), writable: true, status: 'recovered-empty' };
}

/** Writes the whole ledger. */
export function saveLedger(kv: KV, ledger: Ledger): void {
  kv.set(KEYS.ledger, JSON.stringify(ledger));
}

/** Local date as YYYY-MM-DD (for snapshot keys). */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Daily snapshot keys, newest first (pre-migration snapshots excluded). */
export function listDailySnapshots(kv: KV): string[] {
  const pattern = new RegExp(`^${KEYS.snapshotPrefix.replace('.', '\\.')}\\d{4}-\\d{2}-\\d{2}$`);
  return kv
    .getAllKeys()
    .filter((k) => pattern.test(k))
    .sort()
    .reverse();
}

/**
 * Takes today's safety snapshot (the whole ledger) if there isn't one yet,
 * then deletes all but the newest SNAPSHOTS_KEPT. The store runs it a few
 * seconds after startup rather than before the first render. Returns true
 * if a snapshot was written.
 */
export function takeDailySnapshot(kv: KV, ledger: Ledger, now: number): boolean {
  const key = `${KEYS.snapshotPrefix}${localDateKey(now)}`;
  if (kv.getString(key) !== undefined) return false;
  kv.set(key, JSON.stringify(ledger));
  for (const old of listDailySnapshots(kv).slice(SNAPSHOTS_KEPT)) kv.remove(old);
  return true;
}

/** Timer functions, injectable so tests can use fake timers. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** A trailing-edge throttled writer. */
export interface Writer {
  /** Note that data changed; a write happens at most PERSIST_THROTTLE_MS later. */
  markDirty(): void;
  /** Write now if anything is pending (going to background, before export). */
  flush(): void;
  /** Drop any pending write (tests, teardown). */
  cancel(): void;
}

/**
 * Creates a throttled writer. `write` reads the *current* state when it
 * runs, so a burst of changes produces one write of the latest data.
 */
export function createThrottledWriter(write: () => void, ms = PERSIST_THROTTLE_MS, timers: Timers = defaultTimers): Writer {
  let handle: unknown = null;
  const run = () => {
    handle = null;
    write();
  };
  return {
    markDirty() {
      // Already scheduled: this change will be included in that write.
      if (handle === null) handle = timers.setTimeout(run, ms);
    },
    flush() {
      if (handle === null) return;
      timers.clearTimeout(handle);
      run();
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
    },
  };
}

/**
 * Loads a small JSON object (settings, UI state) and fills in defaults for
 * missing or unreadable fields, so adding a new setting needs no migration.
 */
export function loadJSON<T extends object>(kv: KV, key: string, defaults: T): T {
  const raw = kv.getString(key);
  if (raw === undefined) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...defaults, ...(parsed as Partial<T>) } : defaults;
  } catch {
    return defaults;
  }
}
