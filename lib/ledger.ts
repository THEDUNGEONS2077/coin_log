/**
 * lib/ledger.ts: the budget's rules (PLAN §2, §3).
 *
 * Layer: pure lib. Two halves:
 *   1. Derived state: `computeCycle` replays a cycle's entries into the
 *      numbers on screen (each side's balance and spare, what's left on
 *      every line) and `savingsTotal` sums savings across all cycles.
 *      Nothing derived is ever stored.
 *   2. Builders, one per flow (F0–F14): each takes the ledger and the user's
 *      input and returns either the next ledger or a message saying why not.
 *      They never change their input.
 *
 * The one rule every builder enforces (PLAN D3): nothing may go below zero.
 * A builder makes its change on a copy, then checks the whole result: each
 * side's spare, each budget line's remaining amount, and savings. If any is
 * negative the change is refused with the source that would be short. Sums
 * don't depend on order, so checking the final state is enough.
 *
 * How each entry moves money (PLAN §2):
 *   start/salary  sets each side's opening balance (the actual balances)
 *   spend         side −total; each part draws on its line (or on spare)
 *   tick          side −paid; the bill stops holding back its amount
 *   cancel        the line is removed, so what it held back returns to spare
 *   topup         the line holds back more; that side's spare holds less
 *   income        debit +amount
 *   move          debit/credit/savings ± amount
 *   adjust        savings ± delta
 * spare[side] = balance[side] − what that side's lines hold back.
 */
import { dayDiff, startOfDay } from './dates';
import { formatRand, isRand, sum } from './money';
import {
  type CancelEntry,
  type Cycle,
  type Entry,
  type ID,
  type Ledger,
  type Line,
  type LineKind,
  type MoveRoute,
  type Part,
  type Rand,
  SCHEMA_VERSION,
  type Side,
  SPARE,
  type SpendEntry,
  type TickEntry,
} from './types';

/** Both sides, in display order. */
export const SIDES: readonly Side[] = ['credit', 'debit'];

/** "CREDIT" / "DEBIT". */
export function sideLabel(side: Side): string {
  return side === 'credit' ? 'CREDIT' : 'DEBIT';
}

/** Longest label or line name accepted (characters). */
export const LABEL_MAX = 40;

/** The Food line's name when coin_log creates it (F0). */
export const FOOD_NAME = 'Food';

/** A ledger with no cycles: the app before its first-run setup (F0). */
export function emptyLedger(): Ledger {
  return { schemaVersion: SCHEMA_VERSION, cycles: [], chips: { spend: [], income: [] } };
}

/** The current cycle (the last one), or null before setup. */
export function currentCycle(ledger: Ledger): Cycle | null {
  return ledger.cycles[ledger.cycles.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** One line as it stands, derived from the cycle's entries. */
export interface LineState {
  line: Line;
  /** A budget's amount plus its top-ups; a bill's amount. */
  allocated: Rand;
  /** A budget: what transactions took from it. A bill: what was paid (0 while open). */
  spent: Rand;
  /** A budget: allocated − spent. A bill: its amount while open, 0 once paid. */
  left: number;
  /** A bill that's been ticked off (or was paid before setup). Always false for budgets. */
  paid: boolean;
  /** The bill's tick entry, once paid. */
  tick: TickEntry | null;
}

/** A cycle's numbers, as shown on screen. */
export interface CycleState {
  /** The real money on each side: the actual opening balance plus every movement since. */
  balance: Record<Side, number>;
  /** Each side's balance minus what its lines hold back (PLAN D4). */
  spare: Record<Side, number>;
  /** Every line, in the cycle's order. */
  lines: LineState[];
}

/** How an entry changes `side`'s balance. Start and salary entries set it (they open the cycle). */
function balanceDelta(entry: Entry, side: Side, lineSide: (id: ID) => Side | undefined): number {
  switch (entry.type) {
    case 'start':
    case 'salary':
      return side === 'credit' ? entry.actualCredit : entry.actualDebit;
    case 'spend':
      return entry.side === side ? -entry.total : 0;
    case 'tick':
      return lineSide(entry.lineId) === side ? -entry.paid : 0;
    case 'income':
      return side === 'debit' ? entry.amount : 0;
    case 'move': {
      const [from, to] = routeEnds(entry.route);
      return (to === side ? entry.amount : 0) - (from === side ? entry.amount : 0);
    }
    default:
      // topup and cancel move money within a side; adjust is savings only.
      return 0;
  }
}

/** How an entry changes savings. */
export function savingsDelta(entry: Entry): number {
  switch (entry.type) {
    case 'start':
      return entry.savingsOnHand;
    case 'salary':
      return entry.savings;
    case 'move': {
      const [from, to] = routeEnds(entry.route);
      return (to === 'savings' ? entry.amount : 0) - (from === 'savings' ? entry.amount : 0);
    }
    case 'adjust':
      return entry.delta;
    default:
      return 0;
  }
}

/** A move route's two ends: 'debit-credit' → ['debit', 'credit']. */
export function routeEnds(route: MoveRoute): [Side | 'savings', Side | 'savings'] {
  return route.split('-') as [Side | 'savings', Side | 'savings'];
}

/** Replays a cycle's entries into its numbers (see the file header for how each entry counts). */
export function computeCycle(cycle: Cycle): CycleState {
  const sideOf = new Map(cycle.lines.map((l) => [l.id, l.side]));
  const lineSide = (id: ID) => sideOf.get(id);

  // What each line has had: top-ups and transaction parts (budgets), and the tick (bills).
  const topUps = new Map<ID, number>();
  const drawn = new Map<ID, number>();
  const ticks = new Map<ID, TickEntry>();
  const balance: Record<Side, number> = { credit: 0, debit: 0 };
  for (const e of cycle.entries) {
    for (const side of SIDES) balance[side] += balanceDelta(e, side, lineSide);
    if (e.type === 'topup') topUps.set(e.lineId, (topUps.get(e.lineId) ?? 0) + e.amount);
    if (e.type === 'tick') ticks.set(e.lineId, e);
    if (e.type === 'spend') {
      for (const p of e.parts) if (p.source !== SPARE) drawn.set(p.source, (drawn.get(p.source) ?? 0) + p.amount);
    }
  }

  const held: Record<Side, number> = { credit: 0, debit: 0 };
  const lines = cycle.lines.map((line): LineState => {
    if (line.kind === 'bill') {
      const tick = ticks.get(line.id) ?? null;
      const left = tick ? 0 : line.amount;
      held[line.side] += left;
      return { line, allocated: line.amount, spent: tick?.paid ?? 0, left, paid: tick !== null, tick };
    }
    const allocated = line.amount + (topUps.get(line.id) ?? 0);
    const spent = drawn.get(line.id) ?? 0;
    const left = allocated - spent;
    held[line.side] += left;
    return { line, allocated, spent, left, paid: false, tick: null };
  });

  return { balance, spare: { credit: balance.credit - held.credit, debit: balance.debit - held.debit }, lines };
}

/** Total savings: every savings movement in every cycle (PLAN D17, F14). */
export function savingsTotal(ledger: Ledger): number {
  let total = 0;
  for (const c of ledger.cycles) for (const e of c.entries) total += savingsDelta(e);
  return total;
}

/** The current cycle's numbers, or null before setup. */
export function currentState(ledger: Ledger): CycleState | null {
  const cycle = currentCycle(ledger);
  return cycle ? computeCycle(cycle) : null;
}

/** A line's name in a cycle, including lines cancelled since (from their cancel entries). */
export function lineName(cycle: Cycle, id: ID): string {
  const line =
    cycle.lines.find((l) => l.id === id) ?? cycle.entries.find((e): e is CancelEntry => e.type === 'cancel' && e.line.id === id)?.line;
  return line?.name ?? '?';
}

// ---------------------------------------------------------------------------
// The never-below-zero check (PLAN D3)
// ---------------------------------------------------------------------------

/** Something that would be negative. */
export type Shortfall =
  { kind: 'spare'; side: Side; short: number } | { kind: 'line'; id: ID; name: string; short: number } | { kind: 'savings'; short: number };

/** Everything negative in the ledger's current cycle and savings, in display order. */
export function shortfalls(ledger: Ledger): Shortfall[] {
  const out: Shortfall[] = [];
  const state = currentState(ledger);
  if (state) {
    for (const side of SIDES) if (state.spare[side] < 0) out.push({ kind: 'spare', side, short: -state.spare[side] });
    for (const l of state.lines) if (l.left < 0) out.push({ kind: 'line', id: l.line.id, name: l.line.name, short: -l.left });
  }
  const savings = savingsTotal(ledger);
  if (savings < 0) out.push({ kind: 'savings', short: -savings });
  return out;
}

/** "SPARE DEBIT WOULD BE SHORT BY R120" (the message shown when a change is refused). */
export function describeShortfall(s: Shortfall): string {
  const what = s.kind === 'spare' ? `SPARE ${sideLabel(s.side)}` : s.kind === 'line' ? s.name.toUpperCase() : 'SAVINGS';
  return `${what} WOULD BE SHORT BY ${formatRand(s.short)}`;
}

/** A builder's answer: the next ledger, or why the change can't be made. */
export type Result = { ok: true; ledger: Ledger } | { ok: false; error: string };

/** A refusal. */
const fail = (error: string): Result => ({ ok: false, error });

/**
 * Puts `cycle` in place of the current cycle (and `chips`, if given), then
 * runs the never-below-zero check on the result.
 */
function commit(ledger: Ledger, cycle: Cycle, chips: Ledger['chips'] = ledger.chips): Result {
  const next: Ledger = { ...ledger, cycles: [...ledger.cycles.slice(0, -1), cycle], chips };
  const first = shortfalls(next)[0];
  return first ? fail(describeShortfall(first)) : { ok: true, ledger: next };
}

// ---------------------------------------------------------------------------
// Input checks shared by the builders
// ---------------------------------------------------------------------------

/** Where IDs and the time come from (injected, so the builders stay pure). */
export interface Ids {
  newId: () => ID;
  /** The current time (epoch ms). */
  now: number;
}

/** A trimmed label or name, or null when it's empty or too long. */
function cleanText(text: string): string | null {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 0 && t.length <= LABEL_MAX ? t : null;
}

/** Message for an amount that must be a whole rand above zero. */
const MORE_THAN_ZERO = 'ENTER AN AMOUNT ABOVE R0';
/** Message for an amount field that isn't a valid whole-rand amount. */
const NOT_AN_AMOUNT = 'ENTER A WHOLE RAND AMOUNT';

/** True for a valid amount above zero. */
const positive = (n: number) => isRand(n) && n > 0;

/** The current cycle, or a refusal when there isn't one yet. */
function needCycle(ledger: Ledger): Cycle | Result {
  return currentCycle(ledger) ?? fail('SET UP COIN_LOG FIRST');
}

/** Narrows needCycle's answer. */
function isResult(x: Cycle | Result): x is Result {
  return 'ok' in x;
}

/** A line of the current cycle, by ID. */
function findLine(cycle: Cycle, id: ID): Line | undefined {
  return cycle.lines.find((l) => l.id === id);
}

/** Puts `entry` at the end of the cycle's log, or in place of entry `replacing` (an edit, F10). */
function withEntry(cycle: Cycle, entry: Entry, replacing?: ID): Cycle {
  if (replacing === undefined) return { ...cycle, entries: [...cycle.entries, entry] };
  return { ...cycle, entries: cycle.entries.map((e) => (e.id === replacing ? entry : e)) };
}

/**
 * The entry being edited (F10), if any: it must be in the current cycle and
 * of the expected type. Returns its ID and time (an edit keeps both), or a refusal.
 */
function editing<T extends Entry['type']>(cycle: Cycle, replacing: ID | undefined, type: T): { id: ID; at: number } | null | Result {
  if (replacing === undefined) return null;
  const old = cycle.entries.find((e) => e.id === replacing);
  if (!old || old.type !== type) return fail('THAT ENTRY CAN’T BE EDITED');
  return { id: old.id, at: old.at };
}

/** Adds a custom label to a chip list when it isn't there yet (D29: a label becomes a chip after its first use). */
export function withChip(chips: readonly string[], label: string): string[] {
  return chips.some((c) => c.toLowerCase() === label.toLowerCase()) ? [...chips] : [...chips, label];
}

/** Lines must hold exactly one Food line, on credit, as a budget (PLAN D23), and every name must be set. */
function checkLines(lines: readonly { name: string; isFood: boolean; side: Side; kind: LineKind }[]): string | null {
  const food = lines.filter((l) => l.isFood);
  if (food.length !== 1 || food[0]!.side !== 'credit' || food[0]!.kind !== 'budget') return 'FOOD MUST BE ONE CREDIT BUDGET LINE';
  for (const l of lines) if (cleanText(l.name) === null) return 'EVERY LINE NEEDS A NAME (UP TO 40 CHARACTERS)';
  return null;
}

/** Food first, then credit lines, then debit lines, each in the order given (the display order). */
function ordered<T extends { isFood: boolean; side: Side }>(lines: readonly T[]): T[] {
  const rank = (l: T) => (l.isFood ? 0 : l.side === 'credit' ? 1 : 2);
  return [...lines].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// F0: first run, mid-cycle
// ---------------------------------------------------------------------------

/** One line on the setup screen (F0). */
export interface StartLineInput {
  name: string;
  kind: LineKind;
  side: Side;
  isFood: boolean;
  /** The full-cycle default (the template amount RESET uses on the first real payday). */
  monthly: Rand;
  /** Budgets: what's left of it right now (≤ monthly). Ignored for bills. */
  leftNow: Rand;
  /** Bills: already paid this cycle (it then holds nothing back). Ignored for budgets. */
  paid: boolean;
}

/** The setup screen's answers (F0). */
export interface StartInput {
  savingsOnHand: Rand;
  actualDebit: Rand;
  actualCredit: Rand;
  /** Any time on the next pay date. */
  payDate: number;
  lines: StartLineInput[];
}

/** F0: starts coin_log mid-cycle from the balances as they are now. */
export function start(ledger: Ledger, input: StartInput, ids: Ids): Result {
  if (ledger.cycles.length > 0) return fail('COIN_LOG IS ALREADY SET UP');
  if (![input.savingsOnHand, input.actualDebit, input.actualCredit].every(isRand)) return fail(NOT_AN_AMOUNT);
  if (dayDiff(ids.now, input.payDate) < 1) return fail('THE NEXT PAY DATE MUST BE AFTER TODAY');
  const problem = checkLines(input.lines);
  if (problem) return fail(problem);
  for (const l of input.lines) {
    if (!isRand(l.monthly) || (l.kind === 'budget' && !isRand(l.leftNow))) return fail(NOT_AN_AMOUNT);
    if (l.kind === 'budget' && l.leftNow > l.monthly)
      return fail(`${cleanText(l.name)!.toUpperCase()}: LEFT NOW CAN’T BE MORE THAN MONTHLY`);
  }

  const lines: Line[] = [];
  const paidBills: ID[] = [];
  for (const l of ordered(input.lines)) {
    const id = ids.newId();
    const amount = l.kind === 'budget' ? l.leftNow : l.monthly;
    lines.push({ id, side: l.side, kind: l.kind, name: cleanText(l.name)!, isFood: l.isFood, amount, base: l.monthly });
    if (l.kind === 'bill' && l.paid) paidBills.push(id);
  }
  const entries: Entry[] = [
    {
      id: ids.newId(),
      at: ids.now,
      type: 'start',
      actualDebit: input.actualDebit,
      actualCredit: input.actualCredit,
      savingsOnHand: input.savingsOnHand,
    },
    // Bills already paid this cycle: ticked with nothing deducted (the actual balances already reflect them).
    ...paidBills.map((lineId): Entry => ({ id: ids.newId(), at: ids.now, type: 'tick', lineId, paid: 0, beforeStart: true })),
  ];
  const cycle: Cycle = {
    id: ids.newId(),
    startAt: startOfDay(ids.now),
    payDate: startOfDay(input.payDate),
    closedAt: null,
    lines,
    entries,
  };
  return commit({ ...ledger, cycles: [cycle] }, cycle);
}

// ---------------------------------------------------------------------------
// F1: load salary
// ---------------------------------------------------------------------------

/** One line on the salary load's lines step (F1 step 3). */
export interface SalaryLineInput {
  /** An existing line keeps its ID; a line added in EDIT has none yet. */
  id?: ID;
  name: string;
  kind: LineKind;
  side: Side;
  isFood: boolean;
  amount: Rand;
}

/** The salary load's answers (F1). */
export interface SalaryInput {
  /** DATE RECEIVED (any time on that day). */
  receivedAt: number;
  salary: Rand;
  savings: Rand;
  credit: Rand;
  /** NEXT PAY DATE (any time on that day). */
  payDate: number;
  actualDebit: Rand;
  actualCredit: Rand;
  lines: SalaryLineInput[];
}

/** The debit share: what's left of the salary after savings and credit (D1). Negative when they add up to more. */
export function debitShare(salary: Rand, savings: Rand, credit: Rand): number {
  return salary - savings - credit;
}

/** RESET (F1 step 3): every line of the current cycle back at its template default. */
export function templateLines(cycle: Cycle): SalaryLineInput[] {
  return cycle.lines.map((l) => ({ id: l.id, name: l.name, kind: l.kind, side: l.side, isFood: l.isFood, amount: l.base }));
}

/** What each side's spare would be after a salary load (F1's live preview; D16, D18). */
export function salarySpare(input: Pick<SalaryInput, 'actualDebit' | 'actualCredit' | 'lines'>): Record<Side, number> {
  const held = (side: Side) => sum(input.lines.filter((l) => l.side === side).map((l) => l.amount));
  return { credit: input.actualCredit - held('credit'), debit: input.actualDebit - held('debit') };
}

/** F1: closes the current cycle and opens the next one from the salary and the actual balances. */
export function loadSalary(ledger: Ledger, input: SalaryInput, ids: Ids): Result {
  const current = needCycle(ledger);
  if (isResult(current)) return current;
  const amounts = [input.salary, input.savings, input.credit, input.actualDebit, input.actualCredit, ...input.lines.map((l) => l.amount)];
  if (!amounts.every(isRand)) return fail(NOT_AN_AMOUNT);
  if (input.salary <= 0) return fail('ENTER THE SALARY RECEIVED');
  if (input.savings > input.salary) return fail('SAVINGS ARE MORE THAN THE SALARY');
  if (debitShare(input.salary, input.savings, input.credit) < 0) return fail('SAVINGS AND CREDIT ADD UP TO MORE THAN THE SALARY');
  if (dayDiff(input.receivedAt, ids.now) < 0) return fail('THE DATE RECEIVED CAN’T BE IN THE FUTURE');
  if (dayDiff(input.receivedAt, input.payDate) < 1) return fail('THE NEXT PAY DATE MUST BE AFTER THE DATE RECEIVED');
  const problem = checkLines(input.lines);
  if (problem) return fail(problem);
  // An existing line may appear once (EDIT keeps IDs; a copy would share one).
  const seen = new Set<ID>();
  for (const l of input.lines) {
    if (l.id === undefined) continue;
    if (seen.has(l.id)) return fail('A LINE IS LISTED TWICE');
    seen.add(l.id);
  }

  // Every line starts the cycle at its amount, which is also its new template default (D27).
  const lines: Line[] = ordered(input.lines).map((l) => ({
    id: l.id ?? ids.newId(),
    side: l.side,
    kind: l.kind,
    name: cleanText(l.name)!,
    isFood: l.isFood,
    amount: l.amount,
    base: l.amount,
  }));
  const salary: Entry = {
    id: ids.newId(),
    at: ids.now,
    type: 'salary',
    salary: input.salary,
    savings: input.savings,
    credit: input.credit,
    actualDebit: input.actualDebit,
    actualCredit: input.actualCredit,
  };
  const closed: Cycle = { ...current, closedAt: ids.now };
  const next: Cycle = {
    id: ids.newId(),
    startAt: startOfDay(input.receivedAt),
    payDate: startOfDay(input.payDate),
    closedAt: null,
    lines,
    entries: [salary],
  };
  return commit({ ...ledger, cycles: [...ledger.cycles.slice(0, -1), closed, next] }, next);
}

// ---------------------------------------------------------------------------
// F2: log a transaction (split / bulk)
// ---------------------------------------------------------------------------

/** A transaction as entered (F2). */
export interface SpendInput {
  side: Side;
  total: Rand;
  label: string;
  parts: Part[];
}

/** What's still to assign: total − the parts (negative when too much is assigned). */
export function unassigned(total: number, parts: readonly Part[]): number {
  return total - sum(parts.map((p) => p.amount));
}

/**
 * F2: logs a transaction, or (with `replacing`) changes an earlier one (F10).
 * The parts must add up to the total exactly (D10), on one side (D9), from
 * that side's budget lines and spare only (D25).
 */
export function logSpend(ledger: Ledger, input: SpendInput, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'spend');
  if (edit && 'ok' in edit) return edit;
  if (!positive(input.total)) return fail(MORE_THAN_ZERO);
  const label = cleanText(input.label);
  if (label === null) return fail('ADD A LABEL');

  // Zero parts are dropped; each source may appear once.
  const parts = input.parts.filter((p) => p.amount !== 0);
  const seen = new Set<string>();
  for (const p of parts) {
    if (!isRand(p.amount)) return fail(NOT_AN_AMOUNT);
    if (seen.has(p.source)) return fail('A SOURCE IS LISTED TWICE');
    seen.add(p.source);
    if (p.source === SPARE) continue;
    const line = findLine(cycle, p.source);
    if (!line || line.kind !== 'budget' || line.side !== input.side) return fail('A SOURCE ISN’T A BUDGET LINE ON THIS SIDE');
  }
  const left = unassigned(input.total, parts);
  if (left > 0) return fail(`ASSIGN ${formatRand(left)} MORE`);
  if (left < 0) return fail(`${formatRand(-left)} TOO MUCH ASSIGNED`);

  const entry: SpendEntry = {
    id: edit?.id ?? ids.newId(),
    at: edit?.at ?? ids.now,
    type: 'spend',
    side: input.side,
    total: input.total,
    label,
    parts,
  };
  const chips = { ...ledger.chips, spend: withChip(ledger.chips.spend, label) };
  return commit(ledger, withEntry(cycle, entry, replacing), chips);
}

// ---------------------------------------------------------------------------
// F3: tick off a bill
// ---------------------------------------------------------------------------

/**
 * F3: ticks a bill off at what was actually paid (D7), or (with `replacing`)
 * changes the amount on an earlier tick (F10).
 */
export function tickBill(ledger: Ledger, lineId: ID, paid: Rand, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'tick');
  if (edit && 'ok' in edit) return edit;
  if (!isRand(paid)) return fail(NOT_AN_AMOUNT);
  const line = findLine(cycle, lineId);
  if (!line || line.kind !== 'bill') return fail('THAT BILL ISN’T IN THIS CYCLE');
  const ticked = cycle.entries.find((e) => e.type === 'tick' && e.lineId === lineId);
  if (edit === null && ticked) return fail(`${line.name.toUpperCase()} IS ALREADY PAID`);
  if (edit !== null && ticked?.id !== replacing) return fail('THAT ENTRY CAN’T BE EDITED');
  if (ticked?.type === 'tick' && ticked.beforeStart) return fail('PAID BEFORE SETUP: DELETE IT TO REOPEN THE BILL');
  const entry: TickEntry = { id: edit?.id ?? ids.newId(), at: edit?.at ?? ids.now, type: 'tick', lineId, paid };
  return commit(ledger, withEntry(cycle, entry, replacing));
}

// ---------------------------------------------------------------------------
// F4: cancel a line
// ---------------------------------------------------------------------------

/** F4: removes a line from the cycle and the template; what it held back returns to spare. */
export function cancelLine(ledger: Ledger, lineId: ID, ids: Ids): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const index = cycle.lines.findIndex((l) => l.id === lineId);
  const line = cycle.lines[index];
  if (!line) return fail('THAT LINE ISN’T IN THIS CYCLE');
  if (line.isFood) return fail('FOOD CAN’T BE CANCELLED');
  const state = computeCycle(cycle).lines[index]!;
  if (state.paid) return fail(`${line.name.toUpperCase()} IS ALREADY PAID`);
  const entry: CancelEntry = { id: ids.newId(), at: ids.now, type: 'cancel', line, index, released: Math.max(0, state.left) };
  const next: Cycle = { ...withEntry(cycle, entry), lines: cycle.lines.filter((l) => l.id !== lineId) };
  return commit(ledger, next);
}

// ---------------------------------------------------------------------------
// F5 / F6: edit and add lines
// ---------------------------------------------------------------------------

/** Whether any entry in the cycle refers to the line (its kind and side are then fixed, F5). */
export function lineHasEntries(cycle: Cycle, lineId: ID): boolean {
  return cycle.entries.some(
    (e) =>
      ((e.type === 'tick' || e.type === 'topup') && e.lineId === lineId) ||
      (e.type === 'spend' && e.parts.some((p) => p.source === lineId)),
  );
}

/** What can change on a line (F5). `amount` is what the row shows: a budget's allocation including top-ups. */
export interface LinePatch {
  name?: string;
  amount?: Rand;
  kind?: LineKind;
  side?: Side;
}

/**
 * F5: edits a line. The new amount is also its template default (D27).
 * Not a log entry, but undoable. Kind and side only change on a line with
 * no entries yet; Food changes its amount only (D23).
 */
export function editLine(ledger: Ledger, lineId: ID, patch: LinePatch): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const line = findLine(cycle, lineId);
  if (!line) return fail('THAT LINE ISN’T IN THIS CYCLE');
  if (line.isFood && (patch.name !== undefined || patch.kind !== undefined || patch.side !== undefined))
    return fail('FOOD CHANGES ITS AMOUNT ONLY');
  const kind = patch.kind ?? line.kind;
  const side = patch.side ?? line.side;
  if ((kind !== line.kind || side !== line.side) && lineHasEntries(cycle, lineId))
    return fail('IT HAS ENTRIES: ITS KIND AND SIDE ARE FIXED');
  let name = line.name;
  if (patch.name !== undefined) {
    const clean = cleanText(patch.name);
    if (clean === null) return fail('EVERY LINE NEEDS A NAME (UP TO 40 CHARACTERS)');
    name = clean;
  }
  let { amount, base } = line;
  if (patch.amount !== undefined) {
    if (!isRand(patch.amount)) return fail(NOT_AN_AMOUNT);
    // The shown amount includes top-ups; the line stores the part before them.
    const topUps = kind === 'budget' ? sum(cycle.entries.map((e) => (e.type === 'topup' && e.lineId === lineId ? e.amount : 0))) : 0;
    amount = patch.amount - topUps;
    base = patch.amount;
  }
  const edited: Line = { ...line, name, kind, side, amount, base };
  // A line moved to the other side goes to the end of that side's lines.
  const others = cycle.lines.filter((l) => l.id !== lineId);
  const lines = side === line.side ? cycle.lines.map((l) => (l.id === lineId ? edited : l)) : ordered([...others, edited]);
  return commit(ledger, { ...cycle, lines });
}

/** A new line (F6). */
export interface NewLineInput {
  name: string;
  kind: LineKind;
  side: Side;
  amount: Rand;
}

/** F6: adds a line at the end of its side; its amount is held back from that side's spare. */
export function addLine(ledger: Ledger, input: NewLineInput, ids: Ids): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const name = cleanText(input.name);
  if (name === null) return fail('EVERY LINE NEEDS A NAME (UP TO 40 CHARACTERS)');
  if (!isRand(input.amount)) return fail(NOT_AN_AMOUNT);
  const line: Line = { id: ids.newId(), side: input.side, kind: input.kind, name, isFood: false, amount: input.amount, base: input.amount };
  return commit(ledger, { ...cycle, lines: ordered([...cycle.lines, line]) });
}

// ---------------------------------------------------------------------------
// F7: top up a budget line
// ---------------------------------------------------------------------------

/** F7: moves money from a side's spare onto one of its budget lines (this cycle only), or (with `replacing`) changes a top-up (F10). */
export function topUp(ledger: Ledger, lineId: ID, amount: Rand, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'topup');
  if (edit && 'ok' in edit) return edit;
  if (!positive(amount)) return fail(MORE_THAN_ZERO);
  const line = findLine(cycle, lineId);
  if (!line || line.kind !== 'budget') return fail('THAT BUDGET LINE ISN’T IN THIS CYCLE');
  return commit(
    ledger,
    withEntry(cycle, { id: edit?.id ?? ids.newId(), at: edit?.at ?? ids.now, type: 'topup', lineId, amount }, replacing),
  );
}

// ---------------------------------------------------------------------------
// F8: move money, F9: extra cash in
// ---------------------------------------------------------------------------

/** Every move route, in the order MOVE offers them (F8). */
export const MOVE_ROUTES: readonly MoveRoute[] = ['debit-credit', 'debit-savings', 'savings-debit', 'savings-credit'];

/** "DEBIT → CREDIT". */
export function routeLabel(route: MoveRoute): string {
  return route
    .split('-')
    .map((end) => end.toUpperCase())
    .join(' → ');
}

/** F8: moves money between debit, credit and savings, or (with `replacing`) changes a move (F10). */
export function move(ledger: Ledger, route: MoveRoute, amount: Rand, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'move');
  if (edit && 'ok' in edit) return edit;
  if (!MOVE_ROUTES.includes(route)) return fail('PICK WHERE THE MONEY GOES');
  if (!positive(amount)) return fail(MORE_THAN_ZERO);
  return commit(ledger, withEntry(cycle, { id: edit?.id ?? ids.newId(), at: edit?.at ?? ids.now, type: 'move', route, amount }, replacing));
}

/** F9: extra cash into debit, with a label, or (with `replacing`) changes one (F10). */
export function income(ledger: Ledger, amount: Rand, label: string, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'income');
  if (edit && 'ok' in edit) return edit;
  if (!positive(amount)) return fail(MORE_THAN_ZERO);
  const clean = cleanText(label);
  if (clean === null) return fail('ADD A LABEL');
  const chips = { ...ledger.chips, income: withChip(ledger.chips.income, clean) };
  return commit(
    ledger,
    withEntry(cycle, { id: edit?.id ?? ids.newId(), at: edit?.at ?? ids.now, type: 'income', amount, label: clean }, replacing),
    chips,
  );
}

// ---------------------------------------------------------------------------
// F14: savings SET BALANCE
// ---------------------------------------------------------------------------

/**
 * F14: sets savings to the real total, logging the difference. With
 * `replacing` (F10), the earlier adjustment is changed so that savings end
 * up at `total` with everything else as it is.
 */
export function setSavings(ledger: Ledger, total: Rand, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'adjust');
  if (edit && 'ok' in edit) return edit;
  if (!isRand(total)) return fail(NOT_AN_AMOUNT);
  // Savings without the entry being edited (all of them for a new adjustment).
  const old = cycle.entries.find((e) => e.id === replacing);
  const without = savingsTotal(ledger) - (old ? savingsDelta(old) : 0);
  const delta = total - without;
  if (delta === 0) return fail(`SAVINGS ARE ALREADY ${formatRand(total)}`);
  return commit(
    ledger,
    withEntry(cycle, { id: edit?.id ?? ids.newId(), at: edit?.at ?? ids.now, type: 'adjust', delta, setTo: total }, replacing),
  );
}

// ---------------------------------------------------------------------------
// F10: delete an entry
// ---------------------------------------------------------------------------

/** Whether an entry of the current cycle can be deleted or edited (F10). Start and salary entries can't. */
export function isChangeable(entry: Entry): boolean {
  return entry.type !== 'start' && entry.type !== 'salary';
}

/**
 * F10: deletes an entry of the current cycle; its money goes back where it
 * came from. Deleting a tick reopens the bill; deleting a cancel puts the
 * line back (in its old place, and in the template). Refused when that
 * would leave anything below zero.
 */
export function deleteEntry(ledger: Ledger, entryId: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const entry = cycle.entries.find((e) => e.id === entryId);
  if (!entry) return fail('THAT ENTRY ISN’T IN THIS CYCLE');
  if (!isChangeable(entry)) return fail('A SALARY OR START CAN ONLY BE UNDONE RIGHT AFTER IT');
  let lines = cycle.lines;
  if (entry.type === 'cancel') {
    if (lines.some((l) => l.id === entry.line.id)) return fail('THAT LINE IS ALREADY BACK');
    lines = [...lines];
    lines.splice(Math.min(entry.index, lines.length), 0, entry.line);
    lines = ordered(lines);
  }
  return commit(ledger, { ...cycle, lines, entries: cycle.entries.filter((e) => e.id !== entryId) });
}

// ---------------------------------------------------------------------------
// Chips (D29): the quick-select labels, managed in Settings
// ---------------------------------------------------------------------------

/** Which chip list: transaction labels, or extra-cash labels. */
export type ChipKind = 'spend' | 'income';

/** Adds a chip (Settings). Refused when it's empty, too long, or already there. */
export function addChip(ledger: Ledger, kind: ChipKind, label: string): Result {
  const clean = cleanText(label);
  if (clean === null) return fail('A CHIP NEEDS A LABEL (UP TO 40 CHARACTERS)');
  if (ledger.chips[kind].some((c) => c.toLowerCase() === clean.toLowerCase())) return fail('THAT CHIP IS ALREADY THERE');
  return { ok: true, ledger: { ...ledger, chips: { ...ledger.chips, [kind]: [...ledger.chips[kind], clean] } } };
}

/** Renames a chip (Settings). Logged entries keep the label they were given. */
export function renameChip(ledger: Ledger, kind: ChipKind, index: number, label: string): Result {
  const clean = cleanText(label);
  if (clean === null) return fail('A CHIP NEEDS A LABEL (UP TO 40 CHARACTERS)');
  const list = ledger.chips[kind];
  if (index < 0 || index >= list.length) return fail('THAT CHIP ISN’T THERE');
  if (list.some((c, i) => i !== index && c.toLowerCase() === clean.toLowerCase())) return fail('THAT CHIP IS ALREADY THERE');
  return { ok: true, ledger: { ...ledger, chips: { ...ledger.chips, [kind]: list.map((c, i) => (i === index ? clean : c)) } } };
}

/** Removes a chip (Settings). Logged entries keep their labels. */
export function removeChip(ledger: Ledger, kind: ChipKind, index: number): Result {
  const list = ledger.chips[kind];
  if (index < 0 || index >= list.length) return fail('THAT CHIP ISN’T THERE');
  return { ok: true, ledger: { ...ledger, chips: { ...ledger.chips, [kind]: list.filter((_, i) => i !== index) } } };
}
