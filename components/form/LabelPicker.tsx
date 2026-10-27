/**
 * components/form/LabelPicker.tsx: a label from the quick-select chips, or
 * typed (PLAN D11, D29).
 *
 *   LABEL
 *   [ GROCERIES ] [ FUEL ] [ RESTAURANT ]      ← the chips; one tap picks one
 *   ┌──────────────────────────┐
 *   │ Restaurant               │                ← or type your own
 *   └──────────────────────────┘
 *   A NEW LABEL BECOMES A CHIP AFTER IT'S USED
 *
 * Layer: UI. The label is one piece of text: tapping a chip fills it in (and
 * lights that chip), typing changes it (a chip stays lit only while the text
 * matches it, ignoring case). Chips are managed in Settings; a typed label
 * the chips don't have yet becomes one when the entry is logged
 * (lib/ledger.ts withChip).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/services/haptics';
import { colors, glowShadow, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { Labelled, TextField } from './Field';

interface Props {
  /** The chips to offer, in their order. */
  chips: readonly string[];
  value: string;
  onChange: (label: string) => void;
  problem?: string | null;
  /** The custom field's placeholder ("e.g. Restaurant"). */
  placeholder: string;
}

/** Chips to tap, and a field to type a label of one's own. */
export function LabelPicker({ chips, value, onChange, problem, placeholder }: Props) {
  const chosen = value.trim().toLowerCase();
  const isNew = chosen !== '' && !chips.some((c) => c.toLowerCase() === chosen);
  return (
    <View style={styles.wrap}>
      {chips.length > 0 && (
        <Labelled label="LABEL">
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Labels">
            {chips.map((c) => {
              const on = c.toLowerCase() === chosen;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    haptics.check();
                    onChange(c);
                  }}
                  style={({ pressed }) => [styles.chip, on ? styles.chipOn : pressed && styles.chipPressed]}
                  hitSlop={CHIP_SLOP}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  aria-checked={on}
                  accessibilityLabel={c}
                >
                  <Text style={[type.meta, on ? styles.bright : styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {c.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Labelled>
      )}
      <TextField
        label={chips.length > 0 ? 'OR TYPE ONE' : 'LABEL'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        problem={problem}
        hint={isNew ? 'A NEW LABEL BECOMES A CHIP ONCE IT’S LOGGED' : undefined}
        accessibilityLabel="Label"
      />
    </View>
  );
}

/** A chip's drawn height; hitSlop brings it to 44 pt. */
const CHIP_HEIGHT = 32;
const CHIP_SLOP = Math.ceil((size.hitTarget - CHIP_HEIGHT) / 2);

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: glowShadow.faint },
  chipPressed: { borderColor: colors.lineLit, backgroundColor: colors.surface },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
});
