/**
 * components/form/Field.tsx: the text fields of coin_log's forms.
 *
 *   SALARY
 *   ┌──────────────────────────┐
 *   │ R  20000                 │   ← AmountField: whole rand, number pad
 *   └──────────────────────────┘
 *   expected at least R14 000    ← hint
 *
 * Layer: UI. quest_log's field look: a hairline frame on `surface` that
 * lights up (accent frame, faint glow) while it has focus; the label above
 * in the meta role, a hint below. An amount field takes digits only (the
 * keypad has no decimal point, PLAN D28) and is checked by lib/money.ts
 * parseRand: a field that can't be read gets an accent frame and its label
 * says so, rather than a value being guessed.
 */
import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { LABEL_MAX } from '@/lib/ledger';
import { colors, glowShadow, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** Digits only, at most nine (MAX_RAND): everything else typed or pasted is dropped. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '').slice(0, 9);
}

interface LabelProps {
  label: string;
  /** Shown in place of the hint, lit: the field can't be used as it is. */
  problem?: string | null;
  hint?: string;
  children: ReactNode;
}

/** A label above, the field, then a hint (or the problem) below. */
export function Labelled({ label, problem, hint, children }: LabelProps) {
  return (
    <View style={styles.wrap}>
      <Text style={[type.meta, styles.label]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
      {children}
      {(problem || hint) && (
        <Text style={[type.meta, problem ? styles.problem : styles.hint]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {problem ?? hint}
        </Text>
      )}
    </View>
  );
}

interface AmountProps {
  /** "SALARY", shown above the field. */
  label: string;
  /** The digits typed so far. */
  value: string;
  onChange: (digits: string) => void;
  hint?: string;
  /** Why the value can't be used, if it can't (lights the frame). */
  problem?: string | null;
  autoFocus?: boolean;
  /** For the screen reader, when the label alone isn't enough ("Food, left now"). */
  accessibilityLabel?: string;
}

/** A whole-rand amount: `R` and the digits, typed on the number pad. */
export function AmountField({ label, value, onChange, hint, problem, autoFocus, accessibilityLabel }: AmountProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Labelled label={label} hint={hint} problem={problem}>
      <View style={[styles.field, focused && styles.focused, !!problem && styles.invalid]}>
        <Text style={[type.body, styles.prefix]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          R
        </Text>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(digitsOnly(t))}
          keyboardType="number-pad"
          inputMode="numeric"
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="0"
          placeholderTextColor={colors.textDim}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[type.body, styles.input]}
          accessibilityLabel={accessibilityLabel ?? label}
        />
      </View>
    </Labelled>
  );
}

interface TextProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  hint?: string;
  problem?: string | null;
  autoFocus?: boolean;
  accessibilityLabel?: string;
}

/** A name or label: one line of text, up to LABEL_MAX characters. */
export function TextField({ label, value, onChange, placeholder, hint, problem, autoFocus, accessibilityLabel }: TextProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Labelled label={label} hint={hint} problem={problem}>
      <View style={[styles.field, focused && styles.focused, !!problem && styles.invalid]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          maxLength={LABEL_MAX}
          autoFocus={autoFocus}
          autoCapitalize="sentences"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[type.body, styles.input]}
          accessibilityLabel={accessibilityLabel ?? label}
        />
      </View>
    </Labelled>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: { color: colors.textDim, letterSpacing: 1, ...platformText },
  hint: { color: colors.textDim, ...platformText },
  problem: { color: colors.accent, ...platformText },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.hitTarget,
    paddingHorizontal: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.surface,
  },
  // Typing: the frame lights up (accent border and the faint glow), as quest_log's quick-add field.
  focused: { borderColor: colors.accent, boxShadow: glowShadow.faint },
  // Unusable as it is: a lit frame (the label below says why).
  invalid: { borderColor: colors.accent },
  prefix: { color: colors.textDim, marginRight: space.sm, ...platformText },
  // minWidth 0: the input shrinks to its frame (a browser input otherwise keeps a default width).
  input: { flex: 1, minWidth: 0, color: colors.textBright, padding: 0, minHeight: size.hitTarget, ...platformText },
});
