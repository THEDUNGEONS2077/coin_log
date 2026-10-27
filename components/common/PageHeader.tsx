/**
 * components/common/PageHeader.tsx: the header every page shares
 * (Settings, Help, What's new, every form; quest_log's).
 *
 *   > settings                                  [✕]
 *   ────────────━━━━━━━━━━━━━━━━━━━────────────
 *
 * Layer: UI. The page's name as a terminal prompt, glowing softly like the
 * main screen's title, and a framed close button (router.back). Behind it
 * the main screen's top-panel light (Phosphor), and its divider is lit in
 * the middle (LitEdge), so every page opens on the same lit "screen".
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, glowShadow, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { Phosphor } from './Phosphor';
import { LitEdge } from './Rule';

interface Props {
  /** The page's name, lowercase as styled ("settings"). */
  title: string;
  /** The close button's screen-reader label ("Close settings"). Without it, there's no close button (the first-run setup). */
  closeLabel?: string;
  /** What closing does (default: back to the previous screen). */
  onClose?: () => void;
}

/** `> title` and a close button, over the phosphor light, with a lit divider under it. */
export function PageHeader({ title, closeLabel, onClose }: Props) {
  return (
    <View style={styles.header}>
      <Phosphor />
      <Text style={[type.display, styles.title]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.prompt.glyph} ${title}`}
      </Text>
      {closeLabel !== undefined && (
        <Pressable
          onPress={onClose ?? (() => router.back())}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Text style={[type.glyph, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {glyphs.delete.glyph}
          </Text>
        </Pressable>
      )}
      <LitEdge at="bottom" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    // As tall as with the close button, when there isn't one.
    minHeight: size.hitTarget + space.md + space.sm,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
  },
  // The page's name glows softly, as the app's name does on the main screen.
  title: { color: colors.accent, ...glowTextSoft, ...platformText },
  close: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  // Pressed: the frame lights up (as the main screen's / ? ⊛ buttons do).
  pressed: { backgroundColor: colors.surface, borderColor: colors.lineLit, boxShadow: glowShadow.faint },
  glyph: { color: colors.accent, ...platformText },
});
