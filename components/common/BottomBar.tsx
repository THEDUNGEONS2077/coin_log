/**
 * components/common/BottomBar.tsx: the main screen's actions, within thumb
 * reach (PLAN §4 bottom bar).
 *
 *   [ + LOG ]  [ ↔ MOVE ]  [ + IN ]
 *
 * Layer: UI. + LOG logs a transaction (F2), ↔ MOVE moves money between
 * debit, credit and savings (F8), + IN logs extra cash into debit (F9). Each
 * opens its own page. + LOG is the one lit as the call to action: it's what
 * the app is used for most. The list fades out just above the bar instead of
 * being cut off (quest_log's quick-add bar).
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  backgroundStyle,
  colors,
  effects,
  glowShadow,
  glowTextSoft,
  glyphs,
  maxFontSizeMultiplier,
  platformText,
  shape,
  size,
  space,
  type,
} from '@/theme';

/** How far the list fades out above the bar (quest_log's). */
const FADE = space.lg;

interface Props {
  /** Reports the bar's height, so the list and the toast can leave room for it. */
  onHeight?: (height: number) => void;
}

export const BottomBar = memo(function BottomBar({ onHeight }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}
      onLayout={(e: LayoutChangeEvent) => onHeight?.(e.nativeEvent.layout.height)}
      accessibilityRole="toolbar"
    >
      <View pointerEvents="none" style={[styles.fade, backgroundStyle(effects.fadeToBg)]} />
      <BarButton glyph={glyphs.add.glyph} label="LOG" a11y="Log a transaction" primary onPress={() => router.push('/spend')} />
      <BarButton glyph={glyphs.move.glyph} label="MOVE" a11y="Move money" onPress={() => router.push('/move')} />
      <BarButton glyph={glyphs.income.glyph} label="IN" a11y="Log extra cash in" onPress={() => router.push('/income')} />
    </View>
  );
});

interface ButtonProps {
  glyph: string;
  label: string;
  a11y: string;
  /** Lit as the call to action. */
  primary?: boolean;
  onPress: () => void;
}

/** One framed `[ + LOG ]` button. */
function BarButton({ glyph, label, a11y, primary, onPress }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={[type.tab, primary ? styles.lit : styles.accent]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyph} ${label}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
  },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE, height: FADE },
  button: {
    flex: 1,
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    backgroundColor: colors.bg,
  },
  // The call to action: an accent frame with the faint glow (quest_log's CONTINUE).
  primary: { borderColor: colors.accent, boxShadow: glowShadow.faint },
  pressed: { backgroundColor: colors.surface, borderColor: colors.lineLit },
  lit: { color: colors.accent, ...glowTextSoft, ...platformText },
  accent: { color: colors.accent, ...platformText },
});
