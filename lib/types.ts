/**
 * lib/types.ts: the coin_log data model (PLAN §2).
 *
 * Layer: pure lib (types only). The whole budget is one `Ledger`: a list of
 * pay cycles, each holding its budget lines and its log of entries. Every
 * balance on screen (spare credit and debit, what's left on each line,
 * savings) is derived from these by lib/ledger.ts; nothing derived is stored.
 *
 * Money is whole rand (PLAN D28): integers, never floats.
 */

/** Data format version, for migrations (store/migrations). */
export const SCHEMA_VERSION = 1;

/** An amount in whole rand. Stored amounts are integers ≥ 0 unless a field says otherwise. */
export type Rand = number;

/** A unique ID (a UUID in the app). */
export type ID = string;

/** The two pools money is split into (PLAN D1, D2). */
export type Side = 'credit' | 'debit';

/**
 * The two kinds of budget line (PLAN D12):
 *   bill   a static amount (a debit order), settled in full by ticking it off (F3),
 *   budget drawn down by transactions (F2) and topped up from spare (F7).
 */
export type LineKind = 'bill' | 'budget';

/** One budget line ("upcoming payment") in a cycle. */
export interface Line {
  id: ID;
  side: Side;
  kind: LineKind;
  /** As typed (shown uppercase). */
  name: string;
  /** The one Food line (PLAN D23): always a credit budget line, never removable. */
  isFood: boolean;
  /**
   * This cycle's amount before top-ups: a bill's amount, or a budget's
   * allocation. A budget's full allocation is this plus its top-up entries
   * (lib/ledger.ts `allocated`).
   */
  amount: Rand;
  /**
   * The template default: what RESET gives this line in the next cycle
   * (PLAN D19). Editing the line's amount sets it too (D27); a top-up doesn't.
   */
  base: Rand;
}

/** One source a transaction draws from (PLAN D10): a budget line, or the side's spare. */
export interface Part {
  source: ID | typeof SPARE;
  amount: Rand;
}

/** The `source` of a part that draws on spare rather than a line. */
export const SPARE = 'spare';

/** The four ways money moves between pools (PLAN F8). */
export type MoveRoute = 'debit-credit' | 'debit-savings' | 'savings-debit' | 'savings-credit';

/** Fields every log entry has. */
interface EntryBase {
  id: ID;
  /** When it was logged (epoch ms). Entries are logged after the fact (PLAN D15). */
  at: number;
}

/** The first-run start, mid-cycle (PLAN F0): the balances as they were then. */
export interface StartEntry extends EntryBase {
  type: 'start';
  actualDebit: Rand;
  actualCredit: Rand;
  savingsOnHand: Rand;
}

/** A salary load (PLAN F1). The new cycle's balances come from the actual ones (D16, D18). */
export interface SalaryEntry extends EntryBase {
  type: 'salary';
  salary: Rand;
  /** Off the top, into savings (D1). */
  savings: Rand;
  /** Typed; the debit share is the remainder (salary − savings − credit). */
  credit: Rand;
  actualDebit: Rand;
  actualCredit: Rand;
}

/** A transaction (PLAN F2): a card tap, split over budget lines and spare on one side. */
export interface SpendEntry extends EntryBase {
  type: 'spend';
  side: Side;
  total: Rand;
  /** A chip's label or custom text (D11). */
  label: string;
  /** Adds up to `total` exactly (D10). */
  parts: Part[];
}

/** A bill ticked off (PLAN F3). */
export interface TickEntry extends EntryBase {
  type: 'tick';
  lineId: ID;
  /** What was actually paid (D7): less than the bill returns the rest to spare, more takes it from spare. */
  paid: Rand;
  /**
   * Paid before coin_log was set up (F0 "ALREADY PAID THIS CYCLE"): the
   * actual balances already reflect it, so `paid` is 0 and nothing is deducted.
   */
  beforeStart?: boolean;
}

/** A line cancelled (PLAN F4): removed from the cycle and the template. */
export interface CancelEntry extends EntryBase {
  type: 'cancel';
  /** The removed line as it was, so deleting this entry (F10) can put it back. */
  line: Line;
  /** Its position in the cycle's lines. */
  index: number;
  /** What went back to spare (for the log). */
  released: Rand;
}

/** A budget line topped up from its side's spare (PLAN F7). */
export interface TopUpEntry extends EntryBase {
  type: 'topup';
  lineId: ID;
  amount: Rand;
}

/** Extra cash in, to debit (PLAN F9). */
export interface IncomeEntry extends EntryBase {
  type: 'income';
  amount: Rand;
  label: string;
}

/** Money moved between debit, credit and savings (PLAN F8). */
export interface MoveEntry extends EntryBase {
  type: 'move';
  route: MoveRoute;
  amount: Rand;
}

/** Savings SET BALANCE (PLAN F14). */
export interface AdjustEntry extends EntryBase {
  type: 'adjust';
  /** The change it made (may be negative). */
  delta: number;
  /** The total savings were set to. */
  setTo: Rand;
}

/** One log entry: every money movement in a cycle (PLAN §2). */
export type Entry = StartEntry | SalaryEntry | SpendEntry | TickEntry | CancelEntry | TopUpEntry | IncomeEntry | MoveEntry | AdjustEntry;

/** One pay cycle, from a salary (or the first-run start) to the next. */
export interface Cycle {
  id: ID;
  /** Local midnight of the day it started (DATE RECEIVED, or the setup day). */
  startAt: number;
  /** Local midnight of the NEXT PAY DATE. */
  payDate: number;
  /** When the next salary load closed it; null for the current cycle. */
  closedAt: number | null;
  /** In display order within each side (Food first on credit). */
  lines: Line[];
  /** In the order they were logged; the first is the cycle's `start` or `salary`. */
  entries: Entry[];
}

/** Everything coin_log stores about the budget. */
export interface Ledger {
  schemaVersion: number;
  /** Oldest first; the last is the current cycle. Empty before the first-run setup. */
  cycles: Cycle[];
  /** The quick-select labels (D29): spend and income chips, in the order shown. */
  chips: { spend: string[]; income: string[] };
}
