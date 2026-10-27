/**
 * components/log/EntryRow.tsx: one log entry, on the LOG and SAVINGS tabs
 * (PLAN D21, F10).
 *
 *   OCT 27   − RESTAURANT                  −R200 CR
 *   14:05      FOOD R100 · SPARE R100
 *
 * Layer: UI. The words come from lib/entries.ts. In the current cycle, an
 * entry other than a salary or start can be changed (F10):
 *   tap         opens its own form, filled in (a cancel can only be deleted)
 *   swipe ←     deletes it; its money goes back where it came from, with
 *               UNDO (refused, with the reason, if that would leave
 *               anything short)
 * Entries of past cycles, and salary and start entries, only show.
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { SwipeableRow, useSwipeTapGuard } from '@/components/list/SwipeableRow';
import { formatDate, formatTime } from '@/lib/dates';
import { describeEntry } from '@/lib/entries';
import { isChangeable } from '@/lib/ledger';
import type { Cycle, Entry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { useActions } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** The form that changes an entry of this type (F10), if it has one. */
function editPath(entry: Entry): string | null {
  switch (entry.type) {
    case 'spend':
      return '/spend';
    case 'tick':
      // A bill paid before setup has nothing to change: delete it to reopen the bill.
      return entry.beforeStart ? null : '/tick';
    case 'topup':
      return '/topup';
    case 'income':
      return '/income';
    case 'move':
      return '/move';
    case 'adjust':
      return '/savings-set';
    default:
      return null;
  }
}

interface Props {
  cycle: Cycle;
  entry: Entry;
  /** In the current cycle: it can be changed and deleted (if its type allows). */
  current: boolean;
  /** The current minute (for the date's year). */
  now: number;
  /** Shown instead of the entry's own amount (the SAVINGS tab shows what it did to savings). */
  amount?: string;
}

export const EntryRow = memo(function EntryRow({ cycle, entry, current, now, amount }: Props) {
  const actions = useActions();
  // A swipe's release isn't a tap (SwipeableRow).
  const { noteSwipe, justSwiped } = useSwipeTapGuard();
  const view = describeEntry(entry, cycle);
  const changeable = current && isChangeable(entry);
  const path = changeable ? editPath(entry) : null;
  const shownAmount = amount ?? view.amount;

  const edit = () => {
    if (path && !justSwiped()) router.push({ pathname: path as '/spend', params: { entry: entry.id } });
  };
  /** F10: delete, with UNDO (or the reason it can't be). */
  const remove = () => {
    const outcome = actions.deleteEntry(entry.id);
    if (outcome) actions.showToast(outcome);
    else haptics.delete();
  };

  const when = `${formatDate(entry.at, now)} ${formatTime(entry.at)}`;
  const spoken = [
    when,
    view.title.toLowerCase(),
    shownAmount,
    view.side === 'CR' ? 'credit' : view.side === 'DB' ? 'debit' : null,
    view.detail,
  ]
    .filter(Boolean)
    .join(', ');
  const a11yActions = [
    ...(path ? [{ name: 'activate', label: 'Change' }] : []),
    ...(changeable ? [{ name: 'delete', label: 'Delete' }] : []),
  ];
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate') edit();
    else if (e.nativeEvent.actionName === 'delete') remove();
  };

  return (
    <SwipeableRow
      id={entry.id}
      enabled={changeable}
      pressable={path !== null}
      left={changeable ? { label: `${glyphs.delete.glyph} DELETE`, onCommit: remove } : undefined}
      onSwipe={noteSwipe}
    >
      <Pressable
        onPress={edit}
        disabled={path === null}
        style={styles.row}
        accessible
        accessibilityRole={path ? 'button' : 'text'}
        accessibilityLabel={spoken}
        accessibilityHint={path ? 'Opens it to change it' : undefined}
        accessibilityActions={a11yActions}
        onAccessibilityAction={onA11yAction}
      >
        <View style={styles.when}>
          <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {formatDate(entry.at, now)}
          </Text>
          <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {formatTime(entry.at)}
          </Text>
        </View>
        <Text style={[type.glyph, styles.accent, styles.glyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {glyphs[view.glyph].glyph}
        </Text>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[type.body, styles.bright, styles.title]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {view.title}
            </Text>
            {shownAmount !== null && (
              <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {shownAmount}
                {view.side && <Text style={[type.meta, styles.dim]}>{` ${view.side}`}</Text>}
              </Text>
            )}
          </View>
          {view.detail && (
            <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {view.detail}
            </Text>
          )}
        </View>
      </Pressable>
    </SwipeableRow>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    minHeight: size.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  // The date column: wide enough for "MAR 14" (the year shows only when it differs, and wraps under).
  when: { width: size.hitTarget + space.lg + space.xs },
  glyph: { width: size.indent - space.xs, textAlign: 'center' },
  body: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1 },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
