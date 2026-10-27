/**
 * components/common/NotYet.tsx: a page for a flow that isn't built yet.
 *
 * Layer: UI. The first builds release the app's shell first (PLAN §6), so
 * every button already leads somewhere: here, a page that names the flow
 * and the build it arrives in. Each is replaced by the real page in its
 * phase.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, maxFontSizeMultiplier, platformText, space, type } from '@/theme';

import { PageHeader } from './PageHeader';
import { Prompted } from './Prompted';

interface Props {
  /** The page's name, lowercase as styled ("log transaction"). */
  title: string;
  /** What it will do, one sentence. */
  what: string;
}

/** `> title`, then "COMING IN A LATER BUILD" and what the flow will do. */
export function NotYet({ title, what }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PageHeader title={title} closeLabel={`Close ${title}`} />
      <View style={styles.body}>
        <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          <Prompted>COMING IN A LATER BUILD</Prompted>
        </Text>
        <Text style={[type.notes, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {what}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, gap: space.md },
  accent: { color: colors.accent, ...platformText },
  text: { color: colors.text, ...platformText },
});
