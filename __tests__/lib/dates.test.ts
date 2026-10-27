/**
 * __tests__/lib/dates.test.ts: calendar math and labels (lib/dates.ts).
 *
 * Runs in Europe/London (jest.global-setup.js). 2026 DST changes: clocks go
 * forward on Sun Mar 29 and back on Sun Oct 25.
 */
import { addDays, addMonths, dayDiff, daysInMonth, formatDate, formatDay, formatTime, isSameDay, startOfDay } from '@/lib/dates';

/** Local time → epoch ms (month is 1-based here, for readability). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('environment', () => {
  it('runs in the pinned time zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/London');
  });
});

describe('calendar math', () => {
  it('keeps 09:00 at 09:00 across the spring DST change', () => {
    const before = at(2026, 3, 28, 9);
    const after = addDays(before, 1); // Mar 29 is a 23-hour day
    expect(formatTime(after)).toBe('09:00');
    expect(after - before).toBe(23 * 3600_000);
  });

  it('keeps 09:00 at 09:00 across the autumn DST change', () => {
    expect(formatTime(addDays(at(2026, 10, 24, 9), 1))).toBe('09:00');
  });

  it('counts calendar days, ignoring the time of day and DST', () => {
    expect(dayDiff(at(2026, 3, 28, 23), at(2026, 3, 30, 1))).toBe(2);
    expect(dayDiff(at(2026, 10, 7, 12), at(2026, 10, 7, 23))).toBe(0);
    expect(dayDiff(at(2026, 10, 8), at(2026, 10, 7))).toBe(-1);
    // Across the autumn change (a 25-hour day).
    expect(dayDiff(at(2026, 10, 24, 12), at(2026, 10, 26, 12))).toBe(2);
  });

  it('clamps month-end dates', () => {
    expect(new Date(addMonths(at(2026, 1, 31, 9), 1)).getDate()).toBe(28);
    expect(new Date(addMonths(at(2028, 1, 31, 9), 1)).getDate()).toBe(29); // leap year
    expect(new Date(addMonths(at(2026, 3, 31, 9), 1)).getDate()).toBe(30);
    expect(new Date(addMonths(at(2026, 12, 15, 9), 1)).getFullYear()).toBe(2027);
    expect(daysInMonth(2026, 1)).toBe(28); // Feb (0-based month)
  });

  it('finds local midnight and compares days', () => {
    expect(startOfDay(at(2026, 10, 7, 15, 30))).toBe(at(2026, 10, 7));
    expect(isSameDay(at(2026, 10, 7, 1), at(2026, 10, 7, 23))).toBe(true);
    expect(isSameDay(at(2026, 10, 7, 23), at(2026, 10, 8, 1))).toBe(false);
  });
});

describe('labels', () => {
  const now = at(2026, 10, 27, 12); // Tue Oct 27 2026

  it('shows dates, with the year only when it differs', () => {
    expect(formatDate(at(2026, 3, 14), now)).toBe('MAR 14');
    expect(formatDate(at(2027, 3, 14), now)).toBe('MAR 14 2027');
  });

  it('shows days with their weekday', () => {
    expect(formatDay(now, now)).toBe('TUE OCT 27');
    expect(formatDay(at(2026, 11, 25), now)).toBe('WED NOV 25');
    expect(formatDay(at(2027, 1, 1), now)).toBe('FRI JAN 1 2027');
  });

  it('shows 24-hour times', () => {
    expect(formatTime(at(2026, 10, 27, 7, 5))).toBe('07:05');
    expect(formatTime(at(2026, 10, 27, 17, 30))).toBe('17:30');
  });
});
