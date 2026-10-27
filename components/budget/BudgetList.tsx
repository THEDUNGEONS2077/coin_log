/**
 * components/budget/BudgetList.tsx: the BUDGET tab (PLAN D22, §4).
 *
 *   CREDIT ━━━━━━━━━━━━──────────── [ + ]
 *   FOOD … (Food first)
 *   TOILETRIES …
 *   DEBIT ━━━━━━━━━━━━━──────────── [ + ]
 *   [ ] RENT …
 *
 * Layer: UI. The current cycle's lines grouped by side, in the cycle's
 * order (lib/ledger.ts keeps Food first). Each side's [ + ] adds a line to
 * it (F6). A line's menu (its [≡], or holding the row) is one action sheet
 * for the whole list: TOP UP, PAY, EDIT, CANCEL, as the line allows.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { ActionSheet, type SheetAction } from '@/components/overlays/ActionSheet';
import { type LineState, sideLabel, SIDES } from '@/lib/ledger';
import type { Side } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions, useBudget } from '@/store/react';
import { colors, glowShadow, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { cancellable, LineRow, openEdit, openTick, openTopUp } from './LineRow';

/** Opens the add-a-line page for a side (F6). */
const openAdd = (side: Side) => router.push({ pathname: '/line', params: { side } });

export function BudgetList({ bottomInset }: { bottomInset: number }) {
  const { cycle, state } = useBudget();
  const actions = useActions();
  const now = useMinute();
  const [menuFor, setMenuFor] = useState<LineState | null>(null);
  if (!cycle || !state) return null;

  /** The held line's menu: what it allows. */
  const menu = (s: LineState): SheetAction[] => [
    ...(s.line.kind === 'budget' ? [{ glyph: glyphs.topUp.glyph, label: 'Top up from spare', onPress: () => openTopUp(s.line.id) }] : []),
    ...(s.line.kind === 'bill' && !s.paid
      ? [{ glyph: glyphs.paid.glyph, label: 'Tick off: paid', onPress: () => openTick(s.line.id) }]
      : []),
    { glyph: glyphs.edit.glyph, label: 'Edit', onPress: () => openEdit(s.line.id) },
    ...(cancellable(s)
      ? [
          {
            glyph: glyphs.cancel.glyph,
            label: 'Cancel this line',
            onPress: () => {
              const outcome = actions.cancelLine(s.line.id);
              if (outcome) actions.showToast(outcome);
              else haptics.delete();
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }}>
        {SIDES.map((side) => {
          const lines = state.lines.filter((l) => l.line.side === side);
          return (
            <View key={side}>
              <View style={styles.head}>
                <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {sideLabel(side)}
                </Text>
                <Rule lit />
                <Pressable
                  onPress={() => openAdd(side)}
                  style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
                  hitSlop={ADD_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a ${sideLabel(side).toLowerCase()} line`}
                >
                  <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {glyphs.add.glyph}
                  </Text>
                </Pressable>
              </View>
              {lines.length === 0 ? (
                <EmptyState message={`NO ${sideLabel(side)} LINES`} />
              ) : (
                lines.map((l) => <LineRow key={l.line.id} state={l} payDate={cycle.payDate} now={now} onMenu={setMenuFor} />)
              )}
            </View>
          );
        })}
      </ScrollView>
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.line.name.toUpperCase() ?? ''}
        actions={menuFor ? menu(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
    </>
  );
}

/** The drawn size of a side's [ + ]; hitSlop brings it to 44 pt. */
const ADD = 32;
const ADD_SLOP = (size.hitTarget - ADD) / 2;

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  add: {
    width: ADD,
    height: ADD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  addPressed: { backgroundColor: colors.surface, borderColor: colors.lineLit, boxShadow: glowShadow.faint },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
});
