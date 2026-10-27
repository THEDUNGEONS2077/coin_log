/**
 * components/list/Meter.tsx: how much of a budget line is spent (PLAN §4:
 * quest_log's quest meter, showing spent).
 *
 *   [▓▓▓▓▓▓░░░░░░ R600 / R1 800]
 *
 * Layer: UI. A small framed meter whose background fills (a faint accent
 * wash) with the share spent; the amounts sit on top. The fill eases to each
 * new value (instant with Reduce Motion, and when the list reuses the row
 * for another line).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSameItem } from '@/components/common/motion';
import { colors, duration, easing, maxFontSizeMultiplier, platformText, shape, space, type } from '@/theme';

interface Props {
  /** The line shown (so a reused row jumps instead of animating). */
  id: string;
  /** 0–1: the share spent. */
  fraction: number;
  /** The text on the meter: "R600 / R1 800". */
  label: string;
}

/** A framed meter with its text on top. */
export function Meter({ id, fraction, label }: Props) {
  const share = Math.min(1, Math.max(0, fraction));
  const fill = useSharedValue(share);
  // The same line: ease to the new value. A row reused for another line: jump.
  const sameItem = useSameItem(id);
  useEffect(() => {
    fill.set(sameItem() ? withTiming(share, { duration: duration.slow, easing }) : share);
  }, [share, fill, sameItem]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));

  return (
    <View style={styles.meter}>
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text style={[type.meta, styles.text]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    flex: 1,
    paddingHorizontal: space.sm,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.xpWash },
  text: { color: colors.text, ...platformText },
});
