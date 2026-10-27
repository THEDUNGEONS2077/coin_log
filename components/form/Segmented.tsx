/**
 * components/form/Segmented.tsx: a choice of a few options, one selected.
 *
 *   [ CREDIT ][ DEBIT ]
 *
 * Layer: UI. Drawn like the main screen's tabs (quest_log's quest tabs):
 * equal widths, a lit frame for the selected option, a lit frame the moment
 * a finger lands. For the screen reader it's a radio group.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/services/haptics';
import { colors, glowShadow, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  /** Spoken instead of the label. */
  a11y?: string;
}

interface Props<K extends string> {
  options: readonly SegmentOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  /** Spoken for the whole group ("Side"). */
  accessibilityLabel: string;
  /** Greyed out and inert (a choice that can't change any more). */
  disabled?: boolean;
}

/** One selected option out of a few. */
export function Segmented<K extends string>({ options, value, onChange, accessibilityLabel, disabled }: Props<K>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              haptics.check();
              onChange(o.key);
            }}
            style={({ pressed }) => [styles.option, selected ? styles.on : pressed && styles.pressed]}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: !!disabled }}
            aria-checked={selected}
            accessibilityLabel={o.a11y ?? o.label}
          >
            <Text
              style={[type.tab, styles.label, selected ? (disabled ? styles.text : styles.bright) : styles.dim]}
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs + 2 },
  option: {
    flex: 1,
    minHeight: size.hitTarget,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  on: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: glowShadow.faint },
  pressed: { borderColor: colors.lineLit, backgroundColor: colors.surface },
  label: { fontSize: 12, lineHeight: 16 },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
