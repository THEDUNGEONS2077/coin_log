/**
 * services/datePicker.web.ts: the date picker for the web build, the local
 * test harness (native version: datePicker.ts).
 *
 * Layer: services (browser boundary). Uses the browser's own picker, via a
 * hidden <input type="date"> added to the page only while it's open
 * (quest_log's approach). It must be opened during the user's tap, which is
 * why callers open it straight from a button's press handler.
 */
import type { DayLimits } from './datePicker';

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-27": the local day, as date inputs use it. */
export function toDayValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "2026-10-27" as that local day at `base`'s time of day; null if malformed. */
export function fromDayValue(value: string, base: Date): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(base);
  d.setFullYear(+m[1]!, +m[2]! - 1, +m[3]!);
  return d;
}

/** Asks for a day. Resolves the chosen day (at `initial`'s time of day), or null if cancelled. */
export function pickDate(initial: Date, limits: DayLimits = {}): Promise<Date | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = toDayValue(initial);
    if (limits.min) input.min = toDayValue(limits.min);
    if (limits.max) input.max = toDayValue(limits.max);
    // Present (so it can be focused) but invisible; 16px so phones don't zoom the page.
    Object.assign(input.style, { position: 'fixed', bottom: '0', left: '0', opacity: '0', fontSize: '16px', width: '1px', height: '1px' });
    document.body.appendChild(input);

    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(value ? fromDayValue(value, initial) : null);
    };
    input.addEventListener('change', () => finish(input.value || null));
    input.addEventListener('blur', () => finish(input.value && input.value !== toDayValue(initial) ? input.value : null));

    input.focus();
    try {
      input.showPicker();
    } catch {
      input.click(); // older browsers: clicking opens the picker
    }
  });
}
