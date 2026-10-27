/**
 * components/log/LogList.tsx: the LOG tab (PLAN D21, F10).
 *
 *   THIS CYCLE · SINCE OCT 27 ━━━━━━━───────
 *   (every entry, newest on top)
 *   ▸ OCT 27 – NOV 25 · 34 ENTRIES            ← a past cycle, folded
 *   ▸ SEP 25 – OCT 27 · 41 ENTRIES
 *
 * Layer: UI. A purely chronological list, newest first: the current
 * cycle's entries, then each past cycle under its own heading, folded until
 * tapped [P]. Past cycles are read-only (D30). The list is virtualized
 * (FlatList), so years of entries stay quick.
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { formatDate } from '@/lib/dates';
import type { Cycle, Entry } from '@/lib/types';
import { useBudget } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, size, space, type } from '@/theme';

import { EntryRow } from './EntryRow';

/** One item in the list: a cycle's heading, or an entry. */
type Item =
  { kind: 'head'; cycle: Cycle; current: boolean; open: boolean } | { kind: 'entry'; cycle: Cycle; entry: Entry; current: boolean };

export function LogList({ bottomInset }: { bottomInset: number }) {
  const { ledger } = useBudget();
  const now = useMinute();
  // Past cycles the user unfolded (not remembered across launches).
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => {
    const out: Item[] = [];
    const cycles = [...ledger.cycles].reverse();
    cycles.forEach((cycle, i) => {
      const current = i === 0;
      const unfolded = current || open.has(cycle.id);
      out.push({ kind: 'head', cycle, current, open: unfolded });
      if (unfolded) for (const entry of [...cycle.entries].reverse()) out.push({ kind: 'entry', cycle, entry, current });
    });
    return out;
  }, [ledger, open]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => (item.kind === 'head' ? `head-${item.cycle.id}` : item.entry.id)}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      renderItem={({ item }) =>
        item.kind === 'entry' ? (
          <EntryRow cycle={item.cycle} entry={item.entry} current={item.current} now={now} />
        ) : item.current ? (
          <View style={styles.head}>
            <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`THIS CYCLE · SINCE ${formatDate(item.cycle.startAt, now)}`}
            </Text>
            <Rule lit />
          </View>
        ) : (
          <Pressable
            onPress={() => toggle(item.cycle.id)}
            style={({ pressed }) => [styles.head, styles.past, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: item.open }}
            accessibilityLabel={`Cycle from ${formatDate(item.cycle.startAt, now)}, ${item.cycle.entries.length} entries, ${item.open ? 'open' : 'folded'}`}
          >
            <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {item.open ? glyphs.expanded.glyph : glyphs.collapsed.glyph}
            </Text>
            <Text style={[type.group, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`${formatDate(item.cycle.startAt, now)} – ${formatDate(item.cycle.closedAt ?? now, now)} · ${item.cycle.entries.length} ${item.cycle.entries.length === 1 ? 'ENTRY' : 'ENTRIES'}`}
            </Text>
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  past: { minHeight: size.rowMinHeight, paddingTop: space.sm },
  pressed: { backgroundColor: colors.surface },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
});
