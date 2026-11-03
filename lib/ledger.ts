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
 *   receive       debit +amount; the bills it covers hold back their full amount
 *   carry         nothing (a reminder of money still due from last cycle)
 * spare[side] = balance[side] − what that side's lines hold back.
 *
 * Expected money (PLAN D32–D37): a debit bill can carry an amount someone
 * else pays in. Until it's received the bill holds back only its own share
 * (amount − expected), so receiving it leaves spare unchanged. A bill with
 * money still due can't be ticked off (D35): `commit` refuses any state
 * where it is.
 */
import { dayDiff, startOfDay } from './dates';
import { formatRand, isRand, sum } from './money';
import {
  type CancelEntry,
  type CarryEntry,
  type Cycle,
  type Entry,
  type Expected,
  type ID,
  type Ledger,
  type Line,
  type LineKind,
  type MoveRoute,
  type Part,
  type Rand,
  type ReceiveEntry,
  SCHEMA_VERSION,
  type Share,
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
  /** A bill's expected money (D32) has been received this cycle. False when it has none. */
  received: boolean;
  /** A bill's expected money still to arrive: its expected amount until received, else 0. */
  due: Rand;
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
    case 'receive':
      return side === 'debit' ? entry.amount : 0;
    case 'move': {
      const [from, to] = routeEnds(entry.route);
      return (to === side ? entry.amount : 0) - (from === side ? entry.amount : 0);
    }
    default:
      // topup and cancel move money within a side; adjust is savings only; carry moves nothing.
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
  const received = new Set<ID>();
  const balance: Record<Side, number> = { credit: 0, debit: 0 };
  for (const e of cycle.entries) {
    for (const side of SIDES) balance[side] += balanceDelta(e, side, lineSide);
    if (e.type === 'topup') topUps.set(e.lineId, (topUps.get(e.lineId) ?? 0) + e.amount);
    if (e.type === 'tick') ticks.set(e.lineId, e);
    if (e.type === 'receive') for (const sh of e.shares) received.add(sh.lineId);
    if (e.type === 'spend') {
      for (const p of e.parts) if (p.source !== SPARE) drawn.set(p.source, (drawn.get(p.source) ?? 0) + p.amount);
    }
  }

  const held: Record<Side, number> = { credit: 0, debit: 0 };
  const lines = cycle.lines.map((line): LineState => {
    if (line.kind === 'bill') {
      const tick = ticks.get(line.id) ?? null;
      const isIn = line.expected !== undefined && received.has(line.id);
      const due = line.expected && !isIn ? line.expected.amount : 0;
      // Until someone else's share arrives, the bill holds back only yours (D32).
      const left = tick ? 0 : line.amount - due;
      held[line.side] += left;
      return { line, allocated: line.amount, spent: tick?.paid ?? 0, left, paid: tick !== null, tick, received: isIn, due };
    }
    const allocated = line.amount + (topUps.get(line.id) ?? 0);
    const spent = drawn.get(line.id) ?? 0;
    const left = allocated - spent;
    held[line.side] += left;
    return { line, allocated, spent, left, paid: false, tick: null, received: false, due: 0 };
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
// Expected money still due (PLAN D32–D37)
// ---------------------------------------------------------------------------

/** Payers are matched without regard to case or spacing ("partner" and "Partner " are one payer, D33). */
export function payerKey(payer: string): string {
  return payer.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Money still to be received in a cycle: one payer's bill shares, or one carried amount. */
export interface Due {
  /** What RECEIVE is opened with: `bills:<payer key>` or `carry:<carry entry ID>`. */
  key: string;
  /** As first typed. */
  payer: string;
  /** The total expected. */
  amount: Rand;
  /** The bill shares (empty for a carried amount). */
  shares: Share[];
  /** The carry entry, for money carried over from last cycle. */
  carryId?: ID;
}

/**
 * Everything still due in a cycle (F16's list, + IN's list, the salary
 * load's CARRY / DROP step): each payer's shares on open bills not yet
 * received (in line order), then each carried amount not yet received.
 */
export function dues(cycle: Cycle): Due[] {
  const state = computeCycle(cycle);
  const byPayer = new Map<string, Due>();
  for (const l of state.lines) {
    if (!l.line.expected || l.due === 0 || l.paid) continue;
    const k = payerKey(l.line.expected.payer);
    const due = byPayer.get(k) ?? { key: `bills:${k}`, payer: l.line.expected.payer, amount: 0, shares: [] };
    due.amount += l.due;
    due.shares.push({ lineId: l.line.id, amount: l.due });
    byPayer.set(k, due);
  }
  const settled = new Set(cycle.entries.flatMap((e) => (e.type === 'receive' && e.carryId ? [e.carryId] : [])));
  const carried = cycle.entries
    .filter((e): e is CarryEntry => e.type === 'carry' && !settled.has(e.id))
    .map((e): Due => ({ key: `carry:${e.id}`, payer: e.payer, amount: e.amount, shares: [], carryId: e.id }));
  return [...byPayer.values(), ...carried];
}

/** What's still due per payer, everything together (the salary load's CARRY / DROP step, D37). */
export function payerDues(cycle: Cycle): { key: string; payer: string; amount: Rand }[] {
  const out = new Map<string, { key: string; payer: string; amount: Rand }>();
  for (const d of dues(cycle)) {
    const k = payerKey(d.payer);
    const row = out.get(k) ?? { key: k, payer: d.payer, amount: 0 };
    row.amount += d.amount;
    out.set(k, row);
  }
  return [...out.values()];
}

/** Every payer named on the current cycle's lines or carried amounts (the payer chips on a line form, F15). */
export function knownPayers(ledger: Ledger): string[] {
  const cycle = currentCycle(ledger);
  if (!cycle) return [];
  const names = [
    ...cycle.lines.flatMap((l) => (l.expected ? [l.expected.payer] : [])),
    ...cycle.entries.flatMap((e) => (e.type === 'carry' ? [e.payer] : [])),
  ];
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(payerKey(n)) && seen.add(payerKey(n)));
}

/** "PARTNER R5 400 DUE" (a bill row's tag, + IN's list). */
export function describeDue(payer: string, amount: Rand): string {
  return `${payer.toUpperCase()} ${formatRand(amount)} DUE`;
}

/**
 * The expected-money rules a state must keep (D35, F16), besides never
 * going below zero: a paid bill has nothing still due, and every receipt
 * of a carried amount still has its carry entry. Null when they hold.
 */
function dueProblem(cycle: Cycle): string | null {
  for (const l of computeCycle(cycle).lines) {
    if (l.paid && l.due > 0)
      return `${l.line.expected!.payer.toUpperCase()} ${formatRand(l.due)} STILL DUE ON ${l.line.name.toUpperCase()}: RECEIVE IT FIRST`;
  }
  const carries = new Set(cycle.entries.flatMap((e) => (e.type === 'carry' ? [e.id] : [])));
  for (const e of cycle.entries) {
    if (e.type === 'receive' && e.carryId && !carries.has(e.carryId)) return 'IT WAS RECEIVED: DELETE THE RECEIPT FIRST';
  }
  return null;
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
 * runs the expected-money rules and the never-below-zero check on the result.
 */
function commit(ledger: Ledger, cycle: Cycle, chips: Ledger['chips'] = ledger.chips): Result {
  const next: Ledger = { ...ledger, cycles: [...ledger.cycles.slice(0, -1), cycle], chips };
  const due = dueProblem(cycle);
  if (due) return fail(due);
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

/**
 * Checks a line's expected money (F15): debit bills only, a payer, and an
 * amount above zero and at most the bill. Returns the cleaned value
 * (undefined for none), or the refusal message.
 */
function cleanExpected(
  expected: Expected | null | undefined,
  line: { name: string; kind: LineKind; side: Side; amount: Rand },
): { value: Expected | undefined } | { error: string } {
  if (!expected) return { value: undefined };
  if (line.kind !== 'bill' || line.side !== 'debit') return { error: 'COMING IN IS FOR DEBIT BILLS ONLY' };
  const payer = cleanText(expected.payer);
  if (payer === null) return { error: 'SAY WHO PAYS IT IN (UP TO 40 CHARACTERS)' };
  if (!positive(expected.amount)) return { error: 'ENTER WHAT’S COMING IN (ABOVE R0)' };
  if (expected.amount > line.amount)
    return { error: `${cleanText(line.name)?.toUpperCase() ?? 'THE BILL'}: COMING IN CAN’T BE MORE THAN THE BILL` };
  return { value: { payer, amount: expected.amount } };
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
  /** Debit bills: money someone else pays in towards it (F15). Ignored on a paid bill. */
  expected?: Expected | null;
  /** That money has already arrived (F15 "ALREADY RECEIVED"): the actual debit balance includes it. */
  expectedIn?: boolean;
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

/**
 * What each side's spare would be after setup (F0's live preview): each
 * side's balance minus what its lines hold back now (a budget's LEFT NOW, an
 * unpaid bill's amount; a paid bill holds nothing).
 */
export function startSpare(input: Pick<StartInput, 'actualDebit' | 'actualCredit' | 'lines'>): Record<Side, number> {
  // An unpaid bill holds back its amount, less money still to come in from someone else (D32).
  const holds = (l: StartLineInput) =>
    l.kind === 'budget' ? l.leftNow : l.paid ? 0 : l.monthly - (l.expected && !l.expectedIn ? l.expected.amount : 0);
  const held = (side: Side) => sum(input.lines.filter((l) => l.side === side).map(holds));
  return { credit: input.actualCredit - held('credit'), debit: input.actualDebit - held('debit') };
}

/** F0: starts coin_log mid-cycle from the balances as they are now. */
export function start(ledger: Ledger, input: StartInput, ids: Ids): Result {
  if (ledger.cycles.length > 0) return fail('COIN_LOG IS ALREADY SET UP');
  if (![input.savingsOnHand, input.actualDebit, input.actualCredit].every(isRand)) return fail(NOT_AN_AMOUNT);
  if (dayDiff(ids.now, input.payDate) < 1) return fail('THE NEXT PAY DATE MUST BE AFTER TODAY');
  const problem = checkLines(input.lines);
  if (problem) return fail(problem);
  const expectations = new Map<StartLineInput, Expected | undefined>();
  for (const l of input.lines) {
    if (!isRand(l.monthly) || (l.kind === 'budget' && !isRand(l.leftNow))) return fail(NOT_AN_AMOUNT);
    if (l.kind === 'budget' && l.leftNow > l.monthly)
      return fail(`${cleanText(l.name)!.toUpperCase()}: LEFT NOW CAN’T BE MORE THAN MONTHLY`);
    // A bill already paid has nothing left to come in this cycle [P].
    const expected = cleanExpected(l.kind === 'bill' && l.paid ? null : l.expected, { ...l, amount: l.monthly });
    if ('error' in expected) return fail(expected.error);
    expectations.set(l, expected.value);
  }

  const lines: Line[] = [];
  const paidBills: ID[] = [];
  // Money that arrived before setup, per payer: received with nothing added (the balance has it).
  const inBefore = new Map<string, ReceiveEntry>();
  for (const l of ordered(input.lines)) {
    const id = ids.newId();
    const amount = l.kind === 'budget' ? l.leftNow : l.monthly;
    const expected = expectations.get(l);
    lines.push({
      id,
      side: l.side,
      kind: l.kind,
      name: cleanText(l.name)!,
      isFood: l.isFood,
      amount,
      base: l.monthly,
      ...(expected && { expected }),
    });
    if (l.kind === 'bill' && l.paid) paidBills.push(id);
    if (expected && l.expectedIn) {
      const k = payerKey(expected.payer);
      const r = inBefore.get(k) ?? {
        id: '',
        at: ids.now,
        type: 'receive',
        payer: expected.payer,
        shares: [],
        amount: 0,
        beforeStart: true,
      };
      r.shares.push({ lineId: id, amount: expected.amount });
      inBefore.set(k, r);
    }
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
    // Expected money that had already arrived (F15).
    ...[...inBefore.values()].map((r): Entry => ({ ...r, id: ids.newId() })),
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
  /** Debit bills: money someone else pays in towards it (F15); due again in the new cycle. */
  expected?: Expected | null;
}

/** What to do with money still due when the salary is loaded (D37). */
export type DueChoice = 'carry' | 'drop';

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
  /**
   * CARRY or DROP for each payer with money still due (D37), keyed by
   * payerKey; every payer in `payerDues` of the current cycle needs one.
   */
  stillDue?: Record<string, DueChoice>;
}

/** The debit share: what's left of the salary after savings and credit (D1). Negative when they add up to more. */
export function debitShare(salary: Rand, savings: Rand, credit: Rand): number {
  return salary - savings - credit;
}

/** RESET (F1 step 3): every line of the current cycle back at its template default. */
export function templateLines(cycle: Cycle): SalaryLineInput[] {
  return cycle.lines.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    side: l.side,
    isFood: l.isFood,
    amount: l.base,
    ...(l.expected && { expected: l.expected }),
  }));
}

/** What each side's spare would be after a salary load (F1's live preview; D16, D18). */
export function salarySpare(input: Pick<SalaryInput, 'actualDebit' | 'actualCredit' | 'lines'>): Record<Side, number> {
  // A bill holds back its amount less what someone else still pays in (D32).
  const held = (side: Side) => sum(input.lines.filter((l) => l.side === side).map((l) => l.amount - (l.expected?.amount ?? 0)));
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
  const expectations = new Map<SalaryLineInput, Expected | undefined>();
  for (const l of input.lines) {
    const expected = cleanExpected(l.expected, l);
    if ('error' in expected) return fail(expected.error);
    expectations.set(l, expected.value);
  }
  // Money still due in the closing cycle: each payer is carried or dropped (D37).
  const carries: CarryEntry[] = [];
  for (const due of payerDues(current)) {
    const choice = input.stillDue?.[due.key];
    if (choice !== 'carry' && choice !== 'drop') return fail(`CHOOSE CARRY OR DROP FOR ${due.payer.toUpperCase()}`);
    if (choice === 'carry') carries.push({ id: '', at: ids.now, type: 'carry', payer: due.payer, amount: due.amount });
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
    ...(expectations.get(l) && { expected: expectations.get(l) }),
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
    entries: [salary, ...carries.map((c): Entry => ({ ...c, id: ids.newId() }))],
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
      (e.type === 'spend' && e.parts.some((p) => p.source === lineId)) ||
      (e.type === 'receive' && e.shares.some((sh) => sh.lineId === lineId)),
  );
}

/** What can change on a line (F5). `amount` is what the row shows: a budget's allocation including top-ups. */
export interface LinePatch {
  name?: string;
  amount?: Rand;
  kind?: LineKind;
  side?: Side;
  /** Money someone else pays in (F15); null removes it. Locked once received this cycle. */
  expected?: Expected | null;
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
  if (patch.expected !== undefined && computeCycle(cycle).lines.find((l) => l.line.id === lineId)!.received)
    return fail('ALREADY RECEIVED: DELETE THE RECEIPT TO CHANGE WHAT’S COMING IN');
  const expected = cleanExpected(patch.expected === undefined ? line.expected : patch.expected, { name, kind, side, amount });
  if ('error' in expected) return fail(expected.error);
  const { expected: _old, ...rest } = line;
  const edited: Line = { ...rest, name, kind, side, amount, base, ...(expected.value && { expected: expected.value }) };
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
  /** Debit bills: money someone else pays in towards it (F15). */
  expected?: Expected | null;
}

/** F6: adds a line at the end of its side; its amount is held back from that side's spare. */
export function addLine(ledger: Ledger, input: NewLineInput, ids: Ids): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const name = cleanText(input.name);
  if (name === null) return fail('EVERY LINE NEEDS A NAME (UP TO 40 CHARACTERS)');
  if (!isRand(input.amount)) return fail(NOT_AN_AMOUNT);
  const expected = cleanExpected(input.expected, { ...input, name });
  if ('error' in expected) return fail(expected.error);
  const line: Line = {
    id: ids.newId(),
    side: input.side,
    kind: input.kind,
    name,
    isFood: false,
    amount: input.amount,
    base: input.amount,
    ...(expected.value && { expected: expected.value }),
  };
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
// F16: receive expected money
// ---------------------------------------------------------------------------

/**
 * F16: records one payer's payment arriving in debit, covering a `Due` (its
 * `key` from `dues`), or (with `replacing`) changes what arrived on an
 * earlier receipt (F10; what it covers stays). `amount` is what actually
 * arrived (D34): the difference from what was expected lands in spare debit,
 * or comes out of it (refused when spare can't cover it, D3).
 */
export function receive(ledger: Ledger, key: string, amount: Rand, ids: Ids, replacing?: ID): Result {
  const cycle = needCycle(ledger);
  if (isResult(cycle)) return cycle;
  const edit = editing(cycle, replacing, 'receive');
  if (edit && 'ok' in edit) return edit;
  if (!positive(amount)) return fail(MORE_THAN_ZERO);
  let entry: ReceiveEntry;
  if (edit) {
    const old = cycle.entries.find((e): e is ReceiveEntry => e.id === replacing)!;
    if (old.beforeStart) return fail('RECEIVED BEFORE SETUP: DELETE IT TO MAKE IT DUE AGAIN');
    entry = { ...old, amount };
  } else {
    const due = dues(cycle).find((d) => d.key === key);
    if (!due) return fail('NOTHING IS DUE FROM THEM NOW');
    entry = {
      id: ids.newId(),
      at: ids.now,
      type: 'receive',
      payer: due.payer,
      shares: due.shares,
      ...(due.carryId && { carryId: due.carryId }),
      amount,
    };
  }
  return commit(ledger, withEntry(cycle, entry, replacing));
}

/** What a receipt was expected to bring (its shares, or the carried amount). */
export function expectedOf(entry: ReceiveEntry, cycle: Cycle): Rand {
  if (entry.carryId) return cycle.entries.find((e): e is CarryEntry => e.id === entry.carryId && e.type === 'carry')?.amount ?? 0;
  return sum(entry.shares.map((sh) => sh.amount));
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
