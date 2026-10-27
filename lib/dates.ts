/**
 * lib/dates.ts: local-calendar date math and the terminal-style date labels.
 *
 * Layer: pure lib. No date library. Every function takes its times
 * explicitly instead of reading the clock, so results are deterministic and
 * testable. (From quest_log, trimmed to what coin_log uses.)
 *
 * DST safety: day and month arithmetic goes through the local calendar
 * (Date#setDate / setMonth), never by adding 24 h in milliseconds, so day
 * counts stay whole across daylight-saving changes.
 *
 * Labels are English and uppercase by design (terminal UI). Fixed arrays
 * instead of Intl keep output identical on every device and engine.
 */

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

const HOUR = 3_600_000;

/** Local midnight at the start of `ts`'s day. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Same local wall-clock time, `n` calendar days later (or earlier, if n < 0). */
export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * Same local wall-clock time, `n` calendar months later, clamped to the
 * month's last day: Jan 31 + 1 month = Feb 28/29. Used to suggest the next
 * pay date a month after the last one.
 */
export function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  // Go to day 1 first so setMonth can't overflow into the following month.
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return d.getTime();
}

/** Number of days in a month (month is 0-based, like Date). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Whole calendar days from `from` to `to` (local dates; times ignored).
 * Rounding absorbs the 23/25-hour days around DST changes.
 */
export function dayDiff(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / (24 * HOUR));
}

/** True when both timestamps fall on the same local calendar day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** 24-hour local time: "09:00", "17:30". */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "MAR 14", plus the year when it differs from `now`'s year: "MAR 14 2027". */
export function formatDate(ts: number, now: number): string {
  const d = new Date(ts);
  const base = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "TUE OCT 27" (with the year when it differs from `now`'s): pay dates and the date pickers. */
export function formatDay(ts: number, now: number): string {
  return `${DAY_NAMES[new Date(ts).getDay()]} ${formatDate(ts, now)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
