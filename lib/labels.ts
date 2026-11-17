/**
 * lib/labels.ts: finding a transaction label while it's typed (PLAN D43).
 *
 *   labelsByRecency  the spend chips, most recently used first
 *   matchLabels      the ones whose words start with what's typed
 *   sameLabel        whether two labels are the same (ignoring case and spacing)
 *
 * Layer: pure lib. The + LOG label field (components/form/LabelSearch.tsx)
 * shows up to SUGGESTIONS matches as the label is typed, and every chip
 * behind a collapsed ▸ ALL LABELS. The chips themselves are still the list
 * managed in Settings → CHIPS, which a new label joins once it's logged
 * (lib/ledger.ts withChip).
 */
import type { Ledger } from './types';

/** How many matches the field shows while typing (D43). */
export const SUGGESTIONS = 6;

/** A label folded for comparing: trimmed, single-spaced, lowercase. */
const fold = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

/** Whether two labels are the same, ignoring case and spacing (as withChip compares them). */
export function sameLabel(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/**
 * The spend chips, most recently used first: by their newest transaction
 * in any cycle. Chips never used on a transaction (added in Settings) come
 * after, in the order Settings lists them.
 */
export function labelsByRecency(ledger: Ledger): string[] {
  const lastUsed = new Map<string, number>();
  for (const cycle of ledger.cycles) {
    for (const e of cycle.entries) {
      if (e.type !== 'spend') continue;
      const key = fold(e.label);
      lastUsed.set(key, Math.max(lastUsed.get(key) ?? 0, e.at));
    }
  }
  // Array.prototype.sort is stable, so unused chips keep their Settings order.
  return [...ledger.chips.spend].sort((a, b) => (lastUsed.get(fold(b)) ?? -1) - (lastUsed.get(fold(a)) ?? -1));
}

/** Where words start in a label: the beginning, and after a space or punctuation. */
const WORD_START = /(^|[\s\-_/&.,:;()'+])(?=\S)/g;

/**
 * The labels (in the order given) where any word starts with `typed`,
 * ignoring case and extra spaces, at most `limit` of them. "rest" finds
 * Restaurant, "fee" finds Bank fee, "bank f" finds Bank fee too. A label
 * typed in full comes first [P], so it always shows. Nothing typed finds
 * nothing.
 */
export function matchLabels(labels: readonly string[], typed: string, limit = SUGGESTIONS): string[] {
  const q = fold(typed);
  if (q === '') return [];
  const exact = labels.find((label) => fold(label) === q);
  const out: string[] = exact ? [exact] : [];
  for (const label of labels) {
    if (out.length === limit) break;
    if (label === exact) continue;
    const l = fold(label);
    let hit = false;
    for (const m of l.matchAll(WORD_START)) {
      if (l.startsWith(q, m.index + m[1]!.length)) {
        hit = true;
        break;
      }
    }
    if (hit) out.push(label);
  }
  return out;
}
