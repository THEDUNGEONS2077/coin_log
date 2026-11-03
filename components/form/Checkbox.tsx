/**
 * components/form/Checkbox.tsx: a box that toggles, with its label.
 *
 *   [x] PAYS THE CARD
 *
 * Layer: UI. The bill box's glyphs (`[ ]` / `[x]`), lit when checked. Used
 * for a bill's COMING IN and PAYS THE CARD and their setup-only extras.
 * For the screen reader it's a checkbox with its own spoken label.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '@/services/haptics';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown next to the box ("PAYS THE CARD"). */
  label: string;
  /** What the screen reader says ("Card settlement: pays the credit card"). */
  spoken: string;
}

/** `[x] LABEL`: tap to toggle. */
export function Checkbox({ checked, onChange, label, spoken }: Props) {
  return (
    <Pressable
      onPress={() => {
        haptics.check();
        onChange(!checked);
      }}
      style={styles.box}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={spoken}
    >
      <Text style={[type.glyph, checked ? styles.accent : styles.text, styles.mark]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {checked ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
      </Text>
      <Text style={[type.meta, checked ? styles.bright : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.hitTarget },
  mark: { letterSpacing: shape.checkboxTracking },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
