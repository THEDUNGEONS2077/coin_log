/**
 * services/datePicker.ts: the system date picker, native version (the web
 * version is datePicker.web.ts).
 *
 * Layer: services (native boundary: @react-native-community/datetimepicker).
 * Android opens the system calendar dialog. coin_log only ever asks for days
 * (the pay date, the date a salary was received), never times.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

/** The earliest and latest days the picker allows. */
export interface DayLimits {
  min?: Date;
  max?: Date;
}

/** Asks for a day. Resolves the chosen day (at `initial`'s time of day), or null if cancelled. */
export function pickDate(initial: Date, limits: DayLimits = {}): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate: limits.min,
      maximumDate: limits.max,
      onChange: (e, date) => resolve(e.type === 'set' && date ? date : null),
    });
  });
}
