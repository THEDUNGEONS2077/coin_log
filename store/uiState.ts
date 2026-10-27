/**
 * store/uiState.ts: view state that persists across launches (`ui.v1`).
 *
 * Layer: store. loadJSON fills in defaults for missing fields, so adding a
 * field needs no migration.
 */
import type { Side } from '@/lib/types';

/** The main screen's tabs (PLAN D22). */
export type Tab = 'budget' | 'log' | 'savings';

export interface UiState {
  /** Last open tab, restored on launch. */
  tab: Tab;
  /** The side LOG A TRANSACTION starts on: the last one used (PLAN F2). */
  lastSpendSide: Side;
}

export const DEFAULT_UI: UiState = { tab: 'budget', lastSpendSide: 'credit' };
