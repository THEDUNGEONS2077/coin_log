/**
 * store/react.tsx: React bindings for the store, through context.
 *
 * Layer: store. Components get the store from context instead of importing
 * the app singleton, so tests can render them against an in-memory store
 * (store/index.ts imports MMKV, which needs native code). The app provides
 * the real store once, in app/_layout.tsx.
 *
 * Derived numbers (spare, what's left on each line, savings) are computed
 * from the ledger by lib/ledger.ts, once per ledger: the ledger is
 * immutable, so a ledger object always gives the same numbers, and they're
 * cached by its identity (useBudget).
 */
import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';

import { computeCycle, currentCycle, type CycleState, savingsTotal } from '@/lib/ledger';
import type { Cycle, Ledger } from '@/lib/types';

import type { AppStore, AppStoreInstance } from './createStore';

/** What the context carries. */
export interface StoreBundle {
  store: AppStoreInstance;
}

const StoreContext = createContext<StoreBundle | null>(null);

/** Bundles a store for the provider. */
export function bundleStore(store: AppStoreInstance): StoreBundle {
  return { store };
}

/** Provides a store to everything below it. */
export function StoreProvider({ value, children }: { value: StoreBundle; children: ReactNode }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The store bundle from context. Throws if there's no provider (a setup bug). */
export function useStoreBundle(): StoreBundle {
  const bundle = useContext(StoreContext);
  if (!bundle) throw new Error('useStoreBundle: no <StoreProvider> above this component');
  return bundle;
}

/**
 * Subscribe to a slice of the store. The component re-renders only when the
 * selected value changes (Object.is), so select narrowly:
 *   useAppStore((s) => s.ui.tab)
 */
export function useAppStore<T>(selector: (s: AppStore) => T): T {
  return useStore(useStoreBundle().store, selector);
}

/** Actions and imperative reads (event handlers): `useActions().logSpend(…)`. */
export function useActions(): AppStore {
  return useStoreBundle().store.getState();
}

/** The budget as it stands: the current cycle, its numbers, and total savings. */
export interface Budget {
  ledger: Ledger;
  /** Null before the first-run setup (F0). */
  cycle: Cycle | null;
  state: CycleState | null;
  savings: number;
}

/** One computed Budget per ledger object (ledgers are immutable, so it never goes stale). */
const cache = new WeakMap<Ledger, Budget>();

/** Derives the Budget for a ledger, cached by the ledger's identity. */
export function budgetOf(ledger: Ledger): Budget {
  let budget = cache.get(ledger);
  if (!budget) {
    const cycle = currentCycle(ledger);
    budget = { ledger, cycle, state: cycle ? computeCycle(cycle) : null, savings: savingsTotal(ledger) };
    cache.set(ledger, budget);
  }
  return budget;
}

/** The budget as it stands; re-renders when the ledger changes. */
export function useBudget(): Budget {
  return budgetOf(useAppStore((s) => s.ledger));
}
