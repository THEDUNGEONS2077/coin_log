/**
 * lib/money.ts: whole-rand amounts, typed and shown (PLAN D28).
 *
 * Layer: pure lib. Amounts are integers. What the user types is digits
 * only (the keypad has no decimal point); anything else is rejected rather
 * than rounded, so R1 234 never silently becomes something else.
 *
 * Display follows the South African convention: "R1 234", with a space
 * between thousands. The space is non-breaking, so an amount never wraps
 * across two lines.
 */
import type { Rand } from './types';

/** Largest amount accepted: R999 999 999 (nine digits). */
export const MAX_RAND = 999_999_999;

/** Non-breaking space, between groups of thousands. */
const NBSP = ' ';
/** A real minus sign (U+2212), the same width as the digits in the monospace font. */
const MINUS = '−';

/**
 * Parses typed digits into whole rand. Returns null for an empty field,
 * anything that isn't plain digits (spaces between thousands are allowed),
 * or more than MAX_RAND.
 */
export function parseRand(text: string): Rand | null {
  const digits = text.replace(/[\s ]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value <= MAX_RAND ? value : null;
}

/** Groups digits in threes from the right: 1234567 → "1 234 567". */
function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** "R1 234"; negative amounts as "−R1 234". */
export function formatRand(amount: number): string {
  const whole = Math.trunc(amount);
  return whole < 0 ? `${MINUS}R${group(-whole)}` : `R${group(whole)}`;
}

/** A change, always signed: "+R300" or "−R300" (R0 has no sign). */
export function formatDelta(amount: number): string {
  return amount > 0 ? `+${formatRand(amount)}` : formatRand(amount);
}

/** True for a valid stored amount: a whole number from 0 to MAX_RAND. */
export function isRand(value: unknown): value is Rand {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RAND;
}

/** Sums amounts (helper for readability at call sites). */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
