/**
 * __tests__/lib/payday.test.ts: days to payday and Food per day
 * (lib/payday.ts, PLAN F12, F13).
 *
 * Runs in Europe/London (jest.global-setup.js), whose clocks go back on
 * Sun Oct 25 2026: the counts must stay whole days across it.
 */
import { daysToPayday, isPaydayDue, paydayLabel, perDay } from '@/lib/payday';

/** Local time → epoch ms (month is 1-based here, for readability). */
const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();

describe('days to payday', () => {
  it('counts today up to (not including) the pay date', () => {
    // Oct 27 → Nov 1: Oct 27, 28, 29, 30, 31.
    expect(daysToPayday(at(2026, 11, 1), at(2026, 10, 27, 23))).toBe(5);
    expect(daysToPayday(at(2026, 11, 1), at(2026, 10, 31, 8))).toBe(1);
    expect(daysToPayday(at(2026, 11, 1), at(2026, 11, 1, 8))).toBe(0);
    expect(daysToPayday(at(2026, 11, 1), at(2026, 11, 3))).toBe(-2);
  });

  it('stays whole across the DST change', () => {
    expect(daysToPayday(at(2026, 10, 26), at(2026, 10, 24, 12))).toBe(2);
  });

  it('labels the top panel', () => {
    const pay = at(2026, 11, 25);
    expect(paydayLabel(pay, at(2026, 11, 13))).toBe('12 DAYS TO PAYDAY');
    expect(paydayLabel(pay, at(2026, 11, 24, 18))).toBe('1 DAY TO PAYDAY');
    expect(paydayLabel(pay, at(2026, 11, 25, 7))).toBe('PAYDAY TODAY');
    expect(paydayLabel(pay, at(2026, 11, 26))).toBe('PAYDAY PASSED');
  });

  it('shows the payday line from the pay date on (F12)', () => {
    const pay = at(2026, 11, 25);
    expect(isPaydayDue(pay, at(2026, 11, 24, 23))).toBe(false);
    expect(isPaydayDue(pay, at(2026, 11, 25, 0))).toBe(true);
    expect(isPaydayDue(pay, at(2026, 12, 2))).toBe(true);
  });
});

describe('Food per day (F13)', () => {
  it('divides what is left over the days left, rounding down', () => {
    const pay = at(2026, 11, 1);
    expect(perDay(1000, pay, at(2026, 10, 27))).toBe(200); // 5 days
    expect(perDay(1001, pay, at(2026, 10, 27))).toBe(200);
    expect(perDay(999, pay, at(2026, 10, 27))).toBe(199);
  });

  it('shows nothing per day from payday on', () => {
    expect(perDay(500, at(2026, 11, 1), at(2026, 11, 1, 9))).toBeNull();
  });
});
