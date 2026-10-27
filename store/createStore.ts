/**
 * store/createStore.ts: the app store (Zustand) and its persistence wiring.
 *
 * Layer: store. ARCHITECTURE.md §3 (data flow) and §4 (persistence).
 *
 * One store, five parts:
 *   ledger      the budget (lib/types.ts); changed only through lib/ledger.ts builders
 *   history     undo (in memory)
 *   ui          the open tab and the last spend side (persisted)
 *   settings    user settings (persisted)
 *   onboarding  the last "What's new" shown (persisted)
 *
 * Every budget change goes through `commit`: a builder from lib/ledger.ts
 * makes the next ledger (or says why it can't), and commit records the step
 * for undo and shows its toast. Business rules live in lib/ledger.ts, not
 * here. Each flow action returns null when it worked, or the message to show
 * where the user is (a form's error line).
 *
 * Hydration is synchronous inside createAppStore, so the very first render
 * already has the user's data (no flash of an empty budget).
 */
import { AppState } from 'react-native';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

import { countLedger, type LedgerCounts } from '@/lib/backup';
import * as ledgerLib from '@/lib/ledger';
import type { ChipKind, LinePatch, NewLineInput, Result, SalaryInput, SpendInput, StartInput } from '@/lib/ledger';
import type { ID, Ledger, MoveRoute, Rand } from '@/lib/types';

import { readLedger } from './backup';
import { EMPTY_HISTORY, type History, record } from './history';
import { KEYS, type KV } from './kv';
import { DEFAULT_ONBOARDING, type Onboarding } from './onboarding';
import {
  createThrottledWriter,
  defaultTimers,
  listDailySnapshots,
  loadJSON,
  loadLedger,
  type LoadResult,
  saveLedger,
  takeDailySnapshot,
  type Timers,
  type Writer,
} from './persist';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { DEFAULT_UI, type Tab, type UiState } from './uiState';

/** Everything the store needs from the outside world (injected for tests). */
export interface StoreDeps {
  kv: KV;
  /** Current time in epoch ms. */
  now: () => number;
  /** New unique ID (cycles, lines, entries). */
  newId: () => ID;
}

/** A short message at the bottom of the main screen, optionally with UNDO (PLAN F11). */
export interface Toast {
  /** Unique per toast, so a new toast restarts the timer even with the same text. */
  key: number;
  message: string;
  /** Show an UNDO button that undoes the most recent step. */
  undo: boolean;
}

/** A daily safety snapshot, as Settings lists them. */
export interface SnapshotInfo {
  key: string;
  /** YYYY-MM-DD. */
  date: string;
  ledger: Ledger;
  counts: LedgerCounts;
}

/** A flow action's answer: null when it worked, otherwise the message saying why not. */
export type Outcome = string | null;

export interface AppStore {
  /** The budget. Persisted (`ledger.v1`). */
  ledger: Ledger;
  /** Undo / redo. Not persisted. */
  history: History;
  /** Persisted (`ui.v1`). */
  ui: UiState;
  /** Persisted (`settings.v1`). */
  settings: Settings;
  /** Persisted (`onboarding.v1`). */
  onboarding: Onboarding;
  /** The toast on screen, if any. Not persisted. */
  toast: Toast | null;
  /** How the ledger was loaded at startup (for diagnostics and recovery messages). */
  loadStatus: LoadResult['status'];

  // --- Undo (F11) and toasts ---
  undo(): boolean;
  redo(): boolean;
  showToast(message: string, undo?: boolean): void;
  /** Hides the toast, only if it's still the one with this key. */
  dismissToast(key: number): void;

  // --- Flows (PLAN §3). Each returns null when it worked, else why not. ---
  /** F0: first-run setup, mid-cycle. */
  start(input: StartInput): Outcome;
  /** F1: closes the cycle and opens the next from the salary and actual balances. */
  loadSalary(input: SalaryInput): Outcome;
  /** F2: logs a transaction; with `replacing`, changes an earlier one (F10). */
  logSpend(input: SpendInput, replacing?: ID): Outcome;
  /** F3: ticks a bill off at what was paid; with `replacing`, changes an earlier tick (F10). */
  tickBill(lineId: ID, paid: Rand, replacing?: ID): Outcome;
  /** F4: cancels a line (it leaves the cycle and the template). */
  cancelLine(lineId: ID): Outcome;
  /** F5: edits a line (and its template default). */
  editLine(lineId: ID, patch: LinePatch): Outcome;
  /** F6: adds a line. */
  addLine(input: NewLineInput): Outcome;
  /** F7: tops a budget line up from its side's spare; with `replacing`, changes a top-up (F10). */
  topUp(lineId: ID, amount: Rand, replacing?: ID): Outcome;
  /** F8: moves money between debit, credit and savings; with `replacing`, changes a move (F10). */
  move(route: MoveRoute, amount: Rand, replacing?: ID): Outcome;
  /** F9: extra cash into debit; with `replacing`, changes one (F10). */
  income(amount: Rand, label: string, replacing?: ID): Outcome;
  /** F14: sets savings to the real total; with `replacing`, changes an adjustment (F10). */
  setSavings(total: Rand, replacing?: ID): Outcome;
  /** F10: deletes an entry of the current cycle (its money goes back). */
  deleteEntry(entryId: ID): Outcome;

  // --- Chips (D29, Settings) ---
  addChip(kind: ChipKind, label: string): Outcome;
  renameChip(kind: ChipKind, index: number, label: string): Outcome;
  removeChip(kind: ChipKind, index: number): Outcome;

  // --- Data (Settings) ---
  /** Replaces the whole ledger with a backup's, as one undo step. */
  importLedger(ledger: Ledger): void;
  /** The daily safety snapshots, newest first. Unreadable ones are left out. */
  listSnapshots(): SnapshotInfo[];
  /** Replaces the ledger with a daily snapshot (one undo step). False if it can't be read. */
  restoreSnapshot(key: string): boolean;
  /** Deletes the whole budget (one undo step); the app shows its setup screen again. */
  deleteAllData(): void;

  // --- UI ---
  setTab(tab: Tab): void;
  /** Remembers the side a transaction was logged on (F2 starts there next time). */
  setLastSpendSide(side: UiState['lastSpendSide']): void;
  /** Records that "What's new" for this build has been shown (or skipped). */
  markWhatsNewSeen(build: number): void;
  updateSettings(patch: Partial<Settings>): void;
}

/**
 * Creates the store: hydrates synchronously from `deps.kv`. Call
 * installPersistence afterwards to start saving changes (it also schedules
 * the daily snapshot).
 */
export function createAppStore(deps: StoreDeps) {
  const { kv, now, newId } = deps;
  const loaded = loadLedger(kv, now());
  /** IDs and the time for one builder call. */
  const ids = (): ledgerLib.Ids => ({ newId, now: now() });

  const store = createStore<AppStore>()(
    subscribeWithSelector((set, get) => {
      /**
       * Makes a builder's result the new ledger, as one undo step, then shows
       * `toast` (with UNDO). With no toast (chip edits in Settings), any toast
       * still up is hidden: its UNDO would no longer undo the step it names.
       */
      const commit = (result: Result, toast: string | null): Outcome => {
        if (!result.ok) return result.error;
        const before = get().ledger;
        set({ ledger: result.ledger, history: record(get().history, { before, after: result.ledger }) });
        if (toast) get().showToast(toast, true);
        else set({ toast: null });
        return null;
      };
      /** Replaces the whole ledger (import, restore, delete all), as one undo step. */
      const replace = (next: Ledger, toast: string) => commit({ ok: true, ledger: next }, toast);

      return {
        ledger: loaded.ledger,
        history: EMPTY_HISTORY,
        ui: loadJSON(kv, KEYS.ui, DEFAULT_UI),
        settings: loadJSON(kv, KEYS.settings, DEFAULT_SETTINGS),
        onboarding: loadJSON(kv, KEYS.onboarding, DEFAULT_ONBOARDING),
        toast: null,
        loadStatus: loaded.status,

        undo() {
          const { past, future } = get().history;
          const entry = past[past.length - 1];
          if (!entry) return false;
          set({ ledger: entry.before, history: { past: past.slice(0, -1), future: [...future, entry] } });
          return true;
        },

        redo() {
          const { past, future } = get().history;
          const entry = future[future.length - 1];
          if (!entry) return false;
          set({ ledger: entry.after, history: { past: [...past, entry], future: future.slice(0, -1) } });
          return true;
        },

        showToast(message, undo = false) {
          set({ toast: { key: (get().toast?.key ?? 0) + 1, message, undo } });
        },

        dismissToast(key) {
          if (get().toast?.key === key) set({ toast: null });
        },

        start: (input) => commit(ledgerLib.start(get().ledger, input, ids()), 'STARTED'),
        loadSalary: (input) => commit(ledgerLib.loadSalary(get().ledger, input, ids()), 'SALARY LOADED'),
        logSpend: (input, replacing) => commit(ledgerLib.logSpend(get().ledger, input, ids(), replacing), replacing ? 'SAVED' : 'LOGGED'),
        tickBill: (lineId, paid, replacing) =>
          commit(ledgerLib.tickBill(get().ledger, lineId, paid, ids(), replacing), replacing ? 'SAVED' : 'PAID'),
        cancelLine: (lineId) => commit(ledgerLib.cancelLine(get().ledger, lineId, ids()), 'CANCELLED'),
        editLine: (lineId, patch) => commit(ledgerLib.editLine(get().ledger, lineId, patch), 'SAVED'),
        addLine: (input) => commit(ledgerLib.addLine(get().ledger, input, ids()), 'ADDED'),
        topUp: (lineId, amount, replacing) =>
          commit(ledgerLib.topUp(get().ledger, lineId, amount, ids(), replacing), replacing ? 'SAVED' : 'TOPPED UP'),
        move: (route, amount, replacing) =>
          commit(ledgerLib.move(get().ledger, route, amount, ids(), replacing), replacing ? 'SAVED' : 'MOVED'),
        income: (amount, label, replacing) =>
          commit(ledgerLib.income(get().ledger, amount, label, ids(), replacing), replacing ? 'SAVED' : 'CASH IN LOGGED'),
        setSavings: (total, replacing) =>
          commit(ledgerLib.setSavings(get().ledger, total, ids(), replacing), replacing ? 'SAVED' : 'SAVINGS SET'),
        deleteEntry: (entryId) => commit(ledgerLib.deleteEntry(get().ledger, entryId), 'DELETED'),

        addChip: (kind, label) => commit(ledgerLib.addChip(get().ledger, kind, label), null),
        renameChip: (kind, index, label) => commit(ledgerLib.renameChip(get().ledger, kind, index, label), null),
        removeChip: (kind, index) => commit(ledgerLib.removeChip(get().ledger, kind, index), null),

        importLedger(next) {
          replace(next, 'REPLACED FROM BACKUP');
        },

        listSnapshots() {
          const out: SnapshotInfo[] = [];
          for (const key of listDailySnapshots(kv)) {
            try {
              const ledger = readLedger(JSON.parse(kv.getString(key) ?? ''));
              out.push({ key, date: key.slice(KEYS.snapshotPrefix.length), ledger, counts: countLedger(ledger) });
            } catch {
              // Unreadable snapshot: not offered.
            }
          }
          return out;
        },

        restoreSnapshot(key) {
          const snap = get()
            .listSnapshots()
            .find((x) => x.key === key);
          if (!snap) return false;
          replace(snap.ledger, `RESTORED ${snap.date}`);
          return true;
        },

        deleteAllData() {
          replace(ledgerLib.emptyLedger(), 'ALL DATA DELETED');
        },

        setTab: (tab) => set({ ui: { ...get().ui, tab } }),
        setLastSpendSide: (side) => {
          if (get().ui.lastSpendSide !== side) set({ ui: { ...get().ui, lastSpendSide: side } });
        },
        markWhatsNewSeen: (build) => set({ onboarding: { ...get().onboarding, lastSeenBuild: build } }),
        updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      };
    }),
  );

  return Object.assign(store, {
    /** False when saved data is from a newer app version (never overwrite it). */
    writable: loaded.writable,
    /** The disk doesn't match memory yet (recovered or migrated): the first save must happen anyway. */
    dirtyAtStart: loaded.status === 'migrated' || loaded.status === 'recovered-from-snapshot' || loaded.status === 'recovered-empty',
    /** Only cleanly loaded data becomes a daily snapshot. */
    snapshotEligible: loaded.writable && (loaded.status === 'loaded' || loaded.status === 'migrated'),
    now,
  });
}

export type AppStoreInstance = ReturnType<typeof createAppStore>;

/** Options for installPersistence. */
export interface PersistenceOptions {
  /** Flush on AppState changes (default true; tests turn it off). */
  listenAppState?: boolean;
  /** Delay before the daily snapshot, so it stays off the startup path. */
  snapshotDelayMs?: number;
  timers?: Timers;
}

/**
 * Starts saving the store to `kv`:
 *   - ledger, ui, settings and onboarding each get a throttled writer (300 ms),
 *   - everything is flushed when the app leaves the foreground,
 *   - a daily snapshot of the ledger is taken a few seconds after launch.
 * Returns a function that stops persistence (flushing pending writes); its
 * `.flush()` property writes pending changes without stopping.
 *
 * When loaded data was from a newer app version (writable = false), the
 * ledger is never written, so the newer data can't be overwritten.
 */
export function installPersistence(store: AppStoreInstance, kv: KV, opts: PersistenceOptions = {}): (() => void) & { flush: () => void } {
  const timers = opts.timers ?? defaultTimers;
  const writers: Writer[] = [];
  const unsubs: (() => void)[] = [];

  // Wire one slice to one key: changes mark the writer dirty, and the writer
  // serializes the latest value when its throttle window ends.
  const wire = <T>(select: (s: AppStore) => T, write: (value: T) => void) => {
    const writer = createThrottledWriter(() => write(select(store.getState())), undefined, timers);
    writers.push(writer);
    unsubs.push(store.subscribe(select, () => writer.markDirty()));
    return writer;
  };

  if (store.writable) {
    const ledgerWriter = wire(
      (s) => s.ledger,
      (ledger) => saveLedger(kv, ledger),
    );
    // Bring the disk up to date if memory already differs from it at startup.
    if (store.dirtyAtStart) ledgerWriter.markDirty();
  }
  wire(
    (s) => s.ui,
    (ui) => kv.set(KEYS.ui, JSON.stringify(ui)),
  );
  wire(
    (s) => s.onboarding,
    (o) => kv.set(KEYS.onboarding, JSON.stringify(o)),
  );
  wire(
    (s) => s.settings,
    (st) => kv.set(KEYS.settings, JSON.stringify(st)),
  );

  const flushAll = () => writers.forEach((w) => w.flush());

  // Daily snapshot a few seconds after launch, off the startup path.
  let snapshotTimer: unknown = null;
  if (store.snapshotEligible) {
    snapshotTimer = timers.setTimeout(() => {
      snapshotTimer = null;
      // An empty ledger (before setup) isn't worth a copy.
      const { ledger } = store.getState();
      if (ledger.cycles.length > 0) takeDailySnapshot(kv, ledger, store.now());
    }, opts.snapshotDelayMs ?? 3000);
  }

  // Going to background: write now. Android may kill a background app
  // without warning, and pending writes would be lost.
  if (opts.listenAppState !== false) {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushAll();
    });
    unsubs.push(() => sub.remove());
  }

  const stop = () => {
    if (snapshotTimer !== null) timers.clearTimeout(snapshotTimer);
    flushAll();
    unsubs.forEach((u) => u());
  };
  return Object.assign(stop, { flush: flushAll });
}
