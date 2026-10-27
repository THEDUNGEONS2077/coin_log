/**
 * components/form/FormButton.tsx: a form's buttons.
 *
 *   [ START ]          primary: an accent frame with the faint glow
 *   [ ← BACK ]         secondary: a hairline frame
 *
 * Layer: UI. quest_log's call-to-action look (What's new's CONTINUE). A
 * disabled button stays visible but dim, and inert: the form's error line
 * says what's missing.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, glowShadow, glowTextSoft, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

interface Props {
  /** Without brackets: "START". */
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** Spoken instead of the label. */
  accessibilityLabel?: string;
  /** Share a row with other buttons (equal widths). */
  grow?: boolean;
}

/** `[ LABEL ]`, framed; primary is lit. */
export function FormButton({ label, onPress, primary, disabled, accessibilityLabel, grow }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, grow && styles.grow, primary && !disabled && styles.primary, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label.toLowerCase()}
    >
      <Text
        style={[type.tab, disabled ? styles.dim : primary ? styles.lit : styles.accent]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {`[ ${label} ]`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  grow: { flex: 1 },
  primary: { borderColor: colors.accent, boxShadow: glowShadow.faint },
  pressed: { backgroundColor: colors.surface },
  lit: { color: colors.accent, ...glowTextSoft, ...platformText },
  accent: { color: colors.accent, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
