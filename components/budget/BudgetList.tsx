/**
 * components/budget/BudgetList.tsx: the BUDGET tab (PLAN D22, §4).
 *
 *   CREDIT ━━━━━━━━━━━━──────────── [ + ]
 *   FOOD … (Food first)
 *   TOILETRIES …
 *   DEBIT ━━━━━━━━━━━━━──────────── [ + ]
 *   [ ] RENT …
 *   ⋯ PARTNER R5 400 · FROM LAST CYCLE   [ RECEIVE ]   ← carried over (D37)
 *
 * Layer: UI. The current cycle's lines grouped by side, in the cycle's
 * order (lib/ledger.ts keeps Food first). Each side's [ + ] adds a line to
 * it (F6). A line's menu (its [≡], or holding the row) is one action sheet
 * for the whole list: TOP UP, PAY, RECEIVE, DEDUCTED, EDIT, CANCEL, as the line allows.
 * Money carried over from last cycle (still due, not tied to a bill) is
 * listed under DEBIT, each with RECEIVE (F16).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { ActionSheet, type SheetAction } from '@/components/overlays/ActionSheet';
import { type Due, dues, type LineState, sideLabel, SIDES } from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import type { Side } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions, useBudget } from '@/store/react';
import { colors, glowShadow, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { cancellable, LineRow, openDeduct, openEdit, openReceive, openTick, openTopUp } from './LineRow';

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
    ...(s.line.expected && s.due > 0
      ? [
          {
            glyph: glyphs.receive.glyph,
            label: `Receive from ${s.line.expected.payer}`,
            onPress: () => openReceive(s.line.expected!.payer),
          },
        ]
      : []),
    ...(s.line.paysCard && !s.paid
      ? [{ glyph: glyphs.deduct.glyph, label: 'Log a card deduction', onPress: () => openDeduct(s.line.id) }]
      : []),
    ...(s.line.kind === 'bill' && !s.paid
      ? [{ glyph: glyphs.paid.glyph, label: s.line.paysCard ? 'Settle the card' : 'Tick off: paid', onPress: () => openTick(s.line.id) }]
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
          const carried = side === 'debit' ? dues(cycle).filter((d) => d.carryId) : [];
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
              {lines.length === 0 && carried.length === 0 ? (
                <EmptyState message={`NO ${sideLabel(side)} LINES`} />
              ) : (
                lines.map((l) => <LineRow key={l.line.id} state={l} payDate={cycle.payDate} now={now} onMenu={setMenuFor} />)
              )}
              {carried.map((d) => (
                <CarriedRow key={d.key} due={d} />
              ))}
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

/** Money carried over from last cycle (D37): tap to receive it. Deleting it (dropping it after all) is on LOG. */
function CarriedRow({ due }: { due: Due }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/receive', params: { key: due.key } })}
      style={({ pressed }) => [styles.carried, pressed && styles.carriedPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${due.payer}, ${formatRand(due.amount)} still due from last cycle`}
      accessibilityHint="Opens it to receive it"
    >
      <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {glyphs.carry.glyph}
      </Text>
      <View style={styles.grow}>
        <Text style={[type.group, styles.bright]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {due.payer.toUpperCase()}
        </Text>
        <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          STILL DUE FROM LAST CYCLE
        </Text>
      </View>
      <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${glyphs.receive.glyph} ${formatRand(due.amount)}`}
      </Text>
    </Pressable>
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
  carried: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
  },
  carriedPressed: { backgroundColor: colors.surface },
  grow: { flex: 1 },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
