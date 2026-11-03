/**
 * lib/entries.ts: what each log entry says on the LOG and SAVINGS tabs
 * (PLAN D21, F10).
 *
 * Layer: pure lib. One description per entry type (lib/types.ts Entry):
 *
 *   ▸ START                 DEBIT R5 000 · CREDIT R3 000 · SAVINGS R8 000
 *   ⊕ SALARY      +R20 000  SAVINGS R3 000 · CREDIT R3 000 · DEBIT R14 000
 *   − RESTAURANT  −R200 CR  FOOD R100 · SPARE R100
 *   ✓ PAID RENT  −R3 800 DB BILL R4 000
 *   ✕ CANCELLED WATER       R200 BACK TO SPARE CREDIT
 *   ↑ TOP UP FOOD     R200  FROM SPARE CREDIT
 *   + REFUND       +R500 DB
 *   ↔ DEBIT → CREDIT  R400
 *   ± SAVINGS SET TO R8 300  +R300
 *   ↓ FROM PARTNER  +R5 400 DB  RENT R5 000 · INTERNET R400
 *   ⋯ PARTNER STILL DUE R5 400 DB  CARRIED FROM LAST CYCLE
 *   ⊖ INTEREST     −R380 CR  CARD DEDUCTION · TO SETTLE
 *   ✓ SETTLED CARD SETTLEMENT −R1 180 DB  TO CREDIT · DEDUCTED R1 180
 *
 * Signs are from the point of view of the money it touches: spending is
 * minus, money in is plus; moves within the budget (top-ups, moves) carry no
 * sign, since nothing leaves or arrives.
 */
import { debitShare, expectedOf, lineName, routeLabel, savingsDelta, sideLabel } from './ledger';
import { formatDelta, formatRand, sum } from './money';
import { type Cycle, type Entry, type Ledger, type Side, SPARE } from './types';

/** How an entry is shown in a list. */
export interface EntryView {
  /** The entry type's glyph name (theme/glyphs.ts). */
  glyph: 'start' | 'salary' | 'spend' | 'paid' | 'cancel' | 'topUp' | 'income' | 'move' | 'adjust' | 'receive' | 'carry' | 'deduct';
  /** "RESTAURANT", "PAID RENT", … (uppercase). */
  title: string;
  /** The amount, signed where money leaves or arrives ("−R200", "+R500", "R400"); null when there's no single amount. */
  amount: string | null;
  /** "CR" / "DB" when one side is touched. */
  side: 'CR' | 'DB' | null;
  /** The second line (parts, the bill amount, what a salary went to); null when there's none. */
  detail: string | null;
}

/** "CR" or "DB". */
const short = (side: Side) => (side === 'credit' ? 'CR' : 'DB');

/** How to show `entry`, a log entry of `cycle`. */
export function describeEntry(entry: Entry, cycle: Cycle): EntryView {
  switch (entry.type) {
    case 'start':
      return {
        glyph: 'start',
        title: 'START',
        amount: null,
        side: null,
        detail: `DEBIT ${formatRand(entry.actualDebit)} · CREDIT ${formatRand(entry.actualCredit)} · SAVINGS ${formatRand(entry.savingsOnHand)}`,
      };
    case 'salary':
      return {
        glyph: 'salary',
        title: 'SALARY',
        amount: formatDelta(entry.salary),
        side: null,
        detail: `SAVINGS ${formatRand(entry.savings)} · CREDIT ${formatRand(entry.credit)} · DEBIT ${formatRand(debitShare(entry.salary, entry.savings, entry.credit))}`,
      };
    case 'spend':
      return {
        glyph: 'spend',
        title: entry.label.toUpperCase(),
        amount: formatDelta(-entry.total),
        side: short(entry.side),
        detail: entry.parts
          .map((p) => `${p.source === SPARE ? 'SPARE' : lineName(cycle, p.source).toUpperCase()} ${formatRand(p.amount)}`)
          .join(' · '),
      };
    case 'tick': {
      const line = cycle.lines.find((l) => l.id === entry.lineId);
      if (line?.paysCard) {
        // A card settlement: debit paid into credit, against what was deducted (D41).
        const deducted = sum(cycle.entries.map((e) => (e.type === 'deduct' && e.lineId === line.id ? e.amount : 0)));
        return {
          glyph: 'paid',
          title: `SETTLED ${line.name.toUpperCase()}`,
          amount: formatDelta(-entry.paid),
          side: 'DB',
          detail: `TO CREDIT · DEDUCTED ${formatRand(deducted)}`,
        };
      }
      return {
        glyph: 'paid',
        title: `PAID ${lineName(cycle, entry.lineId).toUpperCase()}`,
        amount: entry.beforeStart ? null : formatDelta(-entry.paid),
        side: line ? short(line.side) : null,
        detail: entry.beforeStart ? 'PAID BEFORE SETUP' : line ? `BILL ${formatRand(line.amount)}` : null,
      };
    }
    case 'cancel':
      return {
        glyph: 'cancel',
        title: `CANCELLED ${entry.line.name.toUpperCase()}`,
        amount: null,
        side: short(entry.line.side),
        detail: `${formatRand(entry.released)} BACK TO SPARE ${sideLabel(entry.line.side)}`,
      };
    case 'topup': {
      const line = cycle.lines.find((l) => l.id === entry.lineId);
      return {
        glyph: 'topUp',
        title: `TOP UP ${lineName(cycle, entry.lineId).toUpperCase()}`,
        amount: formatRand(entry.amount),
        side: line ? short(line.side) : null,
        detail: line ? `FROM SPARE ${sideLabel(line.side)}` : null,
      };
    }
    case 'income':
      return { glyph: 'income', title: entry.label.toUpperCase(), amount: formatDelta(entry.amount), side: 'DB', detail: null };
    case 'move':
      return { glyph: 'move', title: routeLabel(entry.route), amount: formatRand(entry.amount), side: null, detail: null };
    case 'adjust':
      return {
        glyph: 'adjust',
        title: `SAVINGS SET TO ${formatRand(entry.setTo)}`,
        amount: formatDelta(entry.delta),
        side: null,
        detail: null,
      };
    case 'receive': {
      if (entry.beforeStart) {
        return { glyph: 'receive', title: `FROM ${entry.payer.toUpperCase()}`, amount: null, side: 'DB', detail: 'RECEIVED BEFORE SETUP' };
      }
      // What it covered, and what was expected when a different amount arrived (D34).
      const expected = expectedOf(entry, cycle);
      const covered = entry.carryId
        ? 'FROM LAST CYCLE'
        : entry.shares.map((sh) => `${lineName(cycle, sh.lineId).toUpperCase()} ${formatRand(sh.amount)}`).join(' · ');
      return {
        glyph: 'receive',
        title: `FROM ${entry.payer.toUpperCase()}`,
        amount: formatDelta(entry.amount),
        side: 'DB',
        detail: entry.amount === expected ? covered : `${covered} · EXPECTED ${formatRand(expected)}`,
      };
    }
    case 'deduct':
      return {
        glyph: 'deduct',
        title: entry.label.toUpperCase(),
        // Deducted before setup, or carried over: already in the balances, so no amount moved now.
        amount: entry.origin ? formatRand(entry.amount) : formatDelta(-entry.amount),
        side: 'CR',
        detail:
          entry.origin === 'setup'
            ? 'DEDUCTED BEFORE SETUP · TO SETTLE'
            : entry.origin === 'carried'
              ? 'OWED FROM LAST CYCLE · TO SETTLE'
              : `CARD DEDUCTION · ${lineName(cycle, entry.lineId).toUpperCase()}`,
      };
    case 'carry':
      return {
        glyph: 'carry',
        title: `${entry.payer.toUpperCase()} STILL DUE`,
        amount: formatRand(entry.amount),
        side: 'DB',
        detail: 'CARRIED FROM LAST CYCLE',
      };
  }
}

/** One savings movement, for the SAVINGS tab's history. */
export interface SavingsItem {
  cycle: Cycle;
  entry: Entry;
  /** How much it changed savings by. */
  delta: number;
}

/** Every entry that changed savings, in every cycle, newest first (PLAN §4 SAVINGS). */
export function savingsHistory(ledger: Ledger): SavingsItem[] {
  const out: SavingsItem[] = [];
  for (const cycle of ledger.cycles) {
    for (const entry of cycle.entries) {
      const delta = savingsDelta(entry);
      if (delta !== 0) out.push({ cycle, entry, delta });
    }
  }
  return out.reverse();
}
