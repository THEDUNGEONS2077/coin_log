/**
 * components/common/Header.tsx: the terminal header (PLAN §4 top panel).
 *
 *   <R>_coin_log                                  [⊛]
 *
 * Layer: UI. The app's name, glowing softly (quest_log's header, with the
 * level in brackets replaced by the app's mark), and ⊛ for Settings, where
 * Help and What's new live too.
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, glowShadow, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

export const Header = memo(function Header() {
  return (
    <View style={styles.header}>
      {/* The title gives way first at large text sizes, so the button always fits. */}
      <Text
        style={[type.title, styles.title]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        accessibilityRole="header"
        accessibilityLabel="coin_log"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        <Text style={styles.bracket}>{'<'}</Text>
        <Text style={styles.mark}>R</Text>
        <Text style={styles.bracket}>{'>'}</Text>
        _coin_log
      </Text>
      <Pressable
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        hitSlop={ICON_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Text style={[type.glyph, styles.icon]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {glyphs.settings.glyph}
        </Text>
      </Pressable>
    </View>
  );
});

/** The drawn size of the ⊛ box; hitSlop brings the touch area to 44 pt (quest_log's). */
const ICON_BOX = 34;
const ICON_SLOP = (size.hitTarget - ICON_BOX) / 2;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  // The name glows softly: the app's one effect, on its one name.
  title: { flexShrink: 1, marginRight: space.sm, color: colors.accent, ...glowTextSoft, ...platformText },
  bracket: { color: colors.textDim },
  mark: { color: colors.textBright },
  iconButton: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  // Pressed: the frame lights up (lineLit) with the faint glow.
  pressed: { backgroundColor: colors.surface, borderColor: colors.lineLit, boxShadow: glowShadow.faint },
  icon: { color: colors.accent, ...platformText },
});
