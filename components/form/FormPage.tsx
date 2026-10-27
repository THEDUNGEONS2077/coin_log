/**
 * components/form/FormPage.tsx: the page every money form shares (PLAN §8:
 * forms are pages, not sheets).
 *
 *   > load salary                               [✕]
 *   STEP 2/3 · BALANCES ━━━━━━─────
 *   Check your banking app now.
 *   <fields>
 *   > SPARE DEBIT WOULD BE SHORT BY R200          ← the error line
 *   [ ← BACK ]  [ NEXT → ]
 *
 * Layer: UI. The header, an optional step heading with its rule, a short
 * intro, the fields, the error line (why the last attempt was refused, or
 * what's still missing) and the buttons. The body scrolls and keeps the
 * focused field above the keyboard (FormScroll).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/common/keyboard';
import { PageHeader } from '@/components/common/PageHeader';
import { Prompted } from '@/components/common/Prompted';
import { Rule } from '@/components/common/Rule';
import { colors, maxFontSizeMultiplier, platformText, size, space, type } from '@/theme';

interface Props {
  /** The page's name, lowercase as styled ("load salary"). */
  title: string;
  /** The close button's screen-reader label; none for a page that can't be left (first-run setup). */
  closeLabel?: string;
  onClose?: () => void;
  /** "STEP 2/3 · BALANCES", for a form in steps. */
  step?: string;
  /** One or two plain sentences under the step. */
  intro?: string;
  /** Why the last attempt was refused, or what's still missing. */
  error?: string | null;
  /** The buttons, after the fields. */
  actions: ReactNode;
  children: ReactNode;
}

/** A form page: header, step, intro, fields, error line, buttons. */
export function FormPage({ title, closeLabel, onClose, step, intro, error, actions, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PageHeader title={title} closeLabel={closeLabel} onClose={onClose} />
      <FormScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        {step && (
          <View style={styles.stepRow}>
            <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {step}
            </Text>
            <Rule lit />
          </View>
        )}
        {intro && (
          <Text style={[type.notes, styles.intro]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {intro}
          </Text>
        )}
        <View style={styles.fields}>{children}</View>
        {error ? (
          <Text style={[type.meta, styles.error]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={maxFontSizeMultiplier}>
            <Prompted>{error}</Prompted>
          </Text>
        ) : null}
        <View style={styles.actions}>{actions}</View>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  intro: { color: colors.text, marginBottom: space.lg, ...platformText },
  fields: { gap: space.lg },
  error: { color: colors.accent, marginTop: space.lg, ...platformText },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  bright: { color: colors.textBright, ...platformText },
});
