/**
 * components/common/EmptyState.tsx: what a list says when it has nothing
 * to show (quest_log's empty state).
 *
 *   > NOTHING LOGGED YET█
 *
 * Layer: UI. A lit prompt, the message in textDim, and optionally the
 * blinking block cursor.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

import { BlockCursor } from './BlockCursor';
import { Prompted } from './Prompted';

/** `> MESSAGE`, with the blinking cursor when `cursor` is set. */
export function EmptyState({ message, cursor = false }: { message: string; cursor?: boolean }) {
  return (
    <View style={styles.empty}>
      <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        <Prompted>{message}</Prompted>
        {cursor && <BlockCursor />}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.lg, paddingTop: space.xl },
  text: { color: colors.textDim, ...platformText },
});
