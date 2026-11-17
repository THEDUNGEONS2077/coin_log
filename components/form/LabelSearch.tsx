/**
 * components/form/LabelSearch.tsx: the + LOG label, typed, with the labels
 * used before found as you type (PLAN D43).
 *
 *   LABEL
 *   ┌──────────────────────────┐
 *   │ res                      │
 *   └──────────────────────────┘
 *   [ RESTAURANT ] [ RESIDENCE FEE ]          ← up to 6, most recent first; tap to use
 *   NOT ONE OF THESE? LOG IT AS A NEW LABEL    ← unless one matches exactly
 *
 *   (field empty)
 *   ▸ ALL LABELS (12)                          ← collapsed; tap to show every chip
 *
 * Layer: UI. The label is one piece of text. Typing filters the spend chips
 * (lib/labels.ts: any word starting with what's typed); tapping one fills
 * in its saved spelling. A label typed in full lights its chip, so the
 * existing one is used (labels match ignoring case); anything else becomes
 * a new chip once it's logged (lib/ledger.ts withChip). The full list
 * starts collapsed every time the page opens [P], and folds away again
 * once a chip is picked from it [P].
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { labelsByRecency, matchLabels, sameLabel } from '@/lib/labels';
import type { Ledger } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { colors, glowShadow, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { TextField } from './Field';

interface Props {
  /** The ledger whose spend chips (and their last use) are searched. */
  ledger: Ledger;
  value: string;
  onChange: (label: string) => void;
  problem?: string | null;
  /** The field's placeholder ("e.g. Restaurant"). */
  placeholder: string;
}

/** A label field that finds the labels used before. */
export function LabelSearch({ ledger, value, onChange, problem, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  // Every chip, most recently used first (the order of the matches and of the full list).
  const labels = useMemo(() => labelsByRecency(ledger), [ledger]);
  const typed = value.trim() !== '';
  const matches = matchLabels(labels, value);
  const isNew = typed && !labels.some((l) => sameLabel(l, value));

  /** Uses a saved label as it's spelled, and folds the full list away. */
  const pick = (label: string) => {
    haptics.check();
    onChange(label);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <TextField label="LABEL" value={value} onChange={onChange} placeholder={placeholder} problem={problem} accessibilityLabel="Label" />
      {typed ? (
        <>
          {matches.length > 0 && <Chips labels={matches} value={value} onPick={pick} spoken="Labels used before" />}
          {/* Under the matches, so they sit right below the field. */}
          {isNew && (
            <Text style={[type.meta, styles.dim]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {matches.length > 0 ? 'NOT ONE OF THESE? LOG IT AS A NEW LABEL' : 'NEW LABEL · SAVED ONCE IT’S LOGGED'}
            </Text>
          )}
        </>
      ) : (
        labels.length > 0 && (
          <>
            <Pressable
              onPress={() => setOpen((o) => !o)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`All labels, ${labels.length}`}
              accessibilityHint={open ? 'Hides them' : 'Shows them'}
            >
              <Text style={[type.meta, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {`${open ? glyphs.expanded.glyph : glyphs.collapsed.glyph} ALL LABELS (${labels.length})`}
              </Text>
            </Pressable>
            {open && <Chips labels={labels} value={value} onPick={pick} spoken="All labels" />}
          </>
        )
      )}
    </View>
  );
}

/** Labels to tap: the one matching the field exactly is lit. */
function Chips({
  labels,
  value,
  onPick,
  spoken,
}: {
  labels: readonly string[];
  value: string;
  onPick: (l: string) => void;
  spoken: string;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={spoken}>
      {labels.map((c) => {
        const on = sameLabel(c, value);
        return (
          <Pressable
            key={c}
            onPress={() => onPick(c)}
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
  );
}

/** A chip's drawn height; hitSlop brings it to 44 pt. */
const CHIP_HEIGHT = 32;
const CHIP_SLOP = Math.ceil((size.hitTarget - CHIP_HEIGHT) / 2);

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  toggle: { minHeight: size.hitTarget, justifyContent: 'center', alignSelf: 'flex-start' },
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
  dim: { color: colors.textDim, ...platformText },
});
