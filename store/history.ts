/**
 * store/history.ts: the undo history (PLAN F11).
 *
 * Layer: store. Pure functions over an immutable history value; the store
 * calls them from its actions. History lives in memory only (it isn't
 * persisted).
 *
 * quest_log recorded each step as an op and its inverse. A budget is small,
 * so coin_log records the whole ledger before and after each step instead:
 * undoing is putting the "before" back, which can never drift from what the
 * step did, and needs no inverse logic per flow. Ledgers are immutable, so
 * an entry only holds references (no copies).
 */
import type { Ledger } from '@/lib/types';

/** History depth (quest_log's: 100 steps). */
export const HISTORY_LIMIT = 100;

/** One undoable step. */
export interface HistoryEntry {
  /** The ledger before the step: putting it back undoes it. */
  before: Ledger;
  /** The ledger after the step: putting it back redoes it. */
  after: Ledger;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Records a new step. Any new step clears the redo stack; the oldest steps beyond the limit are dropped. */
export function record(history: History, entry: HistoryEntry): History {
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}
