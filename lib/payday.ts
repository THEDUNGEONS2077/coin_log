/**
 * lib/payday.ts: days until payday, and Food's per-day amount
 * (PLAN F12, F13).
 *
 * Layer: pure lib. Days are calendar days (lib/dates.ts dayDiff), never
 * 24-hour blocks, so the count is right across daylight-saving changes.
 * Every function takes `now` explicitly.
 *
 * "Days left" counts today and every day up to (not including) the pay
 * date: on Oct 27 with payday on Nov 1, that's Oct 27–31, 5 days. Food has
 * to last until the day before payday (the user's words), so its per-day
 * amount divides by exactly those days.
 */
import { dayDiff } from './dates';

/** Days from today (inclusive) to the pay date (exclusive). 0 on payday, negative after it. */
export function daysToPayday(payDate: number, now: number): number {
  return dayDiff(now, payDate);
}

/** True on or after the pay date: the red "You Got Paid" line shows (F12). */
export function isPaydayDue(payDate: number, now: number): boolean {
  return daysToPayday(payDate, now) <= 0;
}

/**
 * Food per day (F13): what's left, divided over the days left, rounded
 * down to whole rand (so spending exactly that each day never runs out
 * early). Null on or after the pay date, when only the total is shown.
 */
export function perDay(left: number, payDate: number, now: number): number | null {
  const days = daysToPayday(payDate, now);
  if (days <= 0) return null;
  return Math.floor(Math.max(0, left) / days);
}

/** The top panel's payday status: "12 DAYS TO PAYDAY", "1 DAY TO PAYDAY", "PAYDAY TODAY", "PAYDAY PASSED". */
export function paydayLabel(payDate: number, now: number): string {
  const days = daysToPayday(payDate, now);
  if (days > 1) return `${days} DAYS TO PAYDAY`;
  if (days === 1) return '1 DAY TO PAYDAY';
  return days === 0 ? 'PAYDAY TODAY' : 'PAYDAY PASSED';
}
