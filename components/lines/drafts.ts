/**
 * components/lines/drafts.ts: budget lines while they're being typed, on the
 * setup screen (F0) and the salary load's EDIT step (F1).
 *
 * Layer: UI glue. A draft holds what the fields show (amounts as typed
 * text); converting drafts into the builders' input (lib/ledger.ts) parses
 * every amount, and reports per field what can't be used, so the form can
 * mark those fields. The rules themselves (Food, names, spare) are checked
 * again by the builder, which has the last word.
 */
import { FOOD_NAME } from '@/lib/ledger';
import type { SalaryLineInput, StartLineInput } from '@/lib/ledger';
import { parseRand } from '@/lib/money';
import type { ID, LineKind, Side } from '@/lib/types';

/** One line as the editor shows it. */
export interface LineDraft {
  /** Stable React key for the card. */
  key: string;
  /** An existing line (F1 EDIT) keeps its ID. */
  id?: ID;
  name: string;
  kind: LineKind;
  side: Side;
  isFood: boolean;
  /** F0: MONTHLY. F1: the cycle's AMOUNT. As typed. */
  amount: string;
  /** F0 budgets: LEFT NOW, as typed; empty means the same as MONTHLY (PLAN F0). */
  leftNow: string;
  /** F0 bills: ALREADY PAID THIS CYCLE. */
  paid: boolean;
}

/** Which form the editor is in: setup (monthly, left now, paid) or the salary load (one amount). */
export type DraftMode = 'start' | 'salary';

/** Why a draft's fields can't be used yet (null: fine). */
export interface DraftProblems {
  name: string | null;
  amount: string | null;
  leftNow: string | null;
}

let nextKey = 0;
/** A fresh key for a new card. */
export function draftKey(): string {
  return `draft-${++nextKey}`;
}

/** A new, empty line on one side (a budget until switched to a bill). */
export function newDraft(side: Side): LineDraft {
  return { key: draftKey(), name: '', kind: 'budget', side, isFood: false, amount: '', leftNow: '', paid: false };
}

/** The Food line every budget starts with (PLAN D23). */
export function foodDraft(): LineDraft {
  return { key: draftKey(), name: FOOD_NAME, kind: 'budget', side: 'credit', isFood: true, amount: '', leftNow: '', paid: false };
}

/** Drafts from the salary load's template (RESET's lines, F1). */
export function draftsFrom(lines: readonly SalaryLineInput[]): LineDraft[] {
  return lines.map((l) => ({
    key: draftKey(),
    id: l.id,
    name: l.name,
    kind: l.kind,
    side: l.side,
    isFood: l.isFood,
    amount: String(l.amount),
    leftNow: '',
    paid: false,
  }));
}

/** What can't be used in a draft's fields, for the given form. */
export function draftProblems(d: LineDraft, mode: DraftMode): DraftProblems {
  const amount = parseRand(d.amount);
  const leftNow = d.leftNow === '' ? amount : parseRand(d.leftNow);
  return {
    name: d.name.trim() === '' ? 'NEEDS A NAME' : null,
    amount: amount === null ? 'ENTER A WHOLE RAND AMOUNT' : null,
    leftNow:
      mode !== 'start' || d.kind !== 'budget' || amount === null
        ? null
        : leftNow === null
          ? 'ENTER A WHOLE RAND AMOUNT'
          : leftNow > amount
            ? 'CAN’T BE MORE THAN MONTHLY'
            : null,
  };
}

/** True when any field of any draft can't be used. */
export function anyProblem(drafts: readonly LineDraft[], mode: DraftMode): boolean {
  return drafts.some((d) => Object.values(draftProblems(d, mode)).some((p) => p !== null));
}

/** Setup lines (F0) from drafts; amounts that can't be read count as 0 (only for the live preview). */
export function toStartLines(drafts: readonly LineDraft[]): StartLineInput[] {
  return drafts.map((d) => {
    const monthly = parseRand(d.amount) ?? 0;
    return {
      name: d.name,
      kind: d.kind,
      side: d.side,
      isFood: d.isFood,
      monthly,
      leftNow: d.leftNow === '' ? monthly : (parseRand(d.leftNow) ?? 0),
      paid: d.kind === 'bill' && d.paid,
    };
  });
}

/** Salary-load lines (F1) from drafts; amounts that can't be read count as 0 (only for the live preview). */
export function toSalaryLines(drafts: readonly LineDraft[]): SalaryLineInput[] {
  return drafts.map((d) => ({ id: d.id, name: d.name, kind: d.kind, side: d.side, isFood: d.isFood, amount: parseRand(d.amount) ?? 0 }));
}
