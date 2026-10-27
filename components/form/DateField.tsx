/**
 * components/form/DateField.tsx: a day, picked with the system calendar.
 *
 *   NEXT PAY DATE
 *   ┌──────────────────────────┐
 *   │ WED NOV 25               │   ← tap: the calendar opens
 *   └──────────────────────────┘
 *
 * Layer: UI. Shows the chosen day the terminal way (lib/dates.ts formatDay),
 * or PICK A DAY. The calendar (services/datePicker) only offers days within
 * `min` and `max`; the value is the chosen day at local midnight.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { useMinute } from '@/components/common/useMinute';
import { formatDay, startOfDay } from '@/lib/dates';
import { pickDate } from '@/services/datePicker';
import { colors, glowShadow, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { Labelled } from './Field';

interface Props {
  label: string;
  /** Local midnight of the chosen day, or null before one is chosen. */
  value: number | null;
  onChange: (day: number) => void;
  /** Earliest and latest allowed days (any time on them). */
  min?: number;
  max?: number;
  hint?: string;
  problem?: string | null;
}

/** A framed button showing the day; tapping it opens the calendar. */
export function DateField({ label, value, onChange, min, max, hint, problem }: Props) {
  const now = useMinute();
  const open = () => {
    // Start the calendar on the chosen day, else the earliest allowed one, else today.
    const initial = new Date(value ?? min ?? now);
    void pickDate(initial, { min: min !== undefined ? new Date(min) : undefined, max: max !== undefined ? new Date(max) : undefined }).then(
      (picked) => {
        if (picked) onChange(startOfDay(picked.getTime()));
      },
    );
  };
  const shown = value === null ? 'PICK A DAY' : formatDay(value, now);
  return (
    <Labelled label={label} hint={hint} problem={problem}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [styles.field, !!problem && styles.invalid, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value === null ? 'not chosen' : shown}`}
        accessibilityHint="Opens the calendar"
      >
        <Text style={[type.body, value === null ? styles.dim : styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {shown}
        </Text>
      </Pressable>
    </Labelled>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: size.hitTarget,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  invalid: { borderColor: colors.accent },
  pressed: { borderColor: colors.accent, boxShadow: glowShadow.faint },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
