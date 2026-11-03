/**
 * components/budget/LineRow.tsx: one budget line or bill on the BUDGET tab
 * (PLAN §4, F3–F7, F13).
 *
 *   FOOD                                     R1 200        ← a budget: what's left
 *   [▓▓▓▓▓▓░░░ R600 / R1 800]  R61/DAY  [+]  [≡]          ← spent of allocated; Food's per day
 *
 *   [ ] RENT                                 R4 000  [≡]  ← an open bill
 *   [x] ELECTRICITY                     PAID R500  [≡]    ← paid: dim, struck through
 *
 *   [ ] RENT                                R10 000  [≡]  ← a bill with COMING IN (F15)
 *       [ ↓ PARTNER R5 000 DUE ]                          ← tap: receive it (F16)
 *       PARTNER R5 000 RECEIVED                           ← once it's in
 *
 * Layer: UI. Gestures (each with a button or a screen-reader action too):
 *   tap the row      edit the line (F5)
 *   [ ] / swipe →    tick an open bill off (F3)
 *   swipe ←          cancel the line (F4), with UNDO; not Food, not a paid bill
 *   [+] on Food      top Food up from spare credit (F7, D23)
 *   [≡] / hold       the line's menu (top up, pay, receive, edit, cancel)
 *   [ ↓ … DUE ]      receive the payer's money (F16)
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { SwipeableRow, useSwipeTapGuard } from '@/components/list/SwipeableRow';
import { Meter } from '@/components/list/Meter';
import { describeDue, type LineState, payerKey } from '@/lib/ledger';
import { formatRand } from '@/lib/money';
import { perDay } from '@/lib/payday';
import { haptics } from '@/services/haptics';
import { useActions } from '@/store/react';
import { colors, glowTextSoft, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, timing, type } from '@/theme';

interface Props {
  state: LineState;
  /** The cycle's pay date (Food's per day, F13). */
  payDate: number;
  /** The current minute. */
  now: number;
  /** Opens the line's menu. */
  onMenu: (state: LineState) => void;
}

/** Opens the tick-off page for a bill (F3). */
export const openTick = (lineId: string) => router.push({ pathname: '/tick', params: { line: lineId } });
/** Opens the top-up page for a budget line (F7). */
export const openTopUp = (lineId: string) => router.push({ pathname: '/topup', params: { line: lineId } });
/** Opens the edit page for a line (F5). */
export const openEdit = (lineId: string) => router.push({ pathname: '/line', params: { id: lineId } });

/** Opens RECEIVE for a payer's bill shares (F16). */
export const openReceive = (payer: string) => router.push({ pathname: '/receive', params: { key: `bills:${payerKey(payer)}` } });

/** Whether a line can be cancelled (F4): never Food, never a paid bill. */
export const cancellable = (s: LineState) => !s.line.isFood && !s.paid;

export const LineRow = memo(function LineRow({ state, payDate, now, onMenu }: Props) {
  const actions = useActions();
  // A swipe's release isn't a tap (SwipeableRow).
  const { noteSwipe, justSwiped } = useSwipeTapGuard();
  const { line, paid } = state;
  const isBill = line.kind === 'bill';
  const name = line.name.toUpperCase();

  /** F4: cancel, with UNDO on the toast (or the reason it can't be). */
  const cancel = () => {
    const outcome = actions.cancelLine(line.id);
    if (outcome) actions.showToast(outcome);
    else haptics.delete();
  };

  // What the screen reader says, and the actions it offers in place of the gestures.
  const daily = line.isFood ? perDay(state.left, payDate, now) : null;
  const expected = line.expected;
  const coming = expected
    ? state.due > 0
      ? `, ${expected.payer} ${formatRand(state.due)} still due`
      : `, ${expected.payer}'s share received`
    : '';
  const spoken = isBill
    ? `${line.name}, bill, ${paid ? (state.tick?.beforeStart ? 'paid before setup' : `paid ${formatRand(state.spent)}`) : `${formatRand(line.amount)}, not paid yet`}${coming}`
    : `${line.name}, ${formatRand(state.left)} left of ${formatRand(state.allocated)}${daily !== null ? `, ${formatRand(daily)} a day` : ''}`;
  const a11yActions = [
    { name: 'activate', label: 'Edit' },
    ...(expected && state.due > 0 ? [{ name: 'receive', label: `Receive from ${expected.payer}` }] : []),
    ...(isBill && !paid ? [{ name: 'tick', label: 'Tick off: paid' }] : []),
    ...(!isBill ? [{ name: 'topup', label: 'Top up' }] : []),
    ...(cancellable(state) ? [{ name: 'cancel', label: 'Cancel this line' }] : []),
  ];
  const onA11yAction = (e: AccessibilityActionEvent) => {
    const act = e.nativeEvent.actionName;
    if (act === 'activate') openEdit(line.id);
    else if (act === 'tick') openTick(line.id);
    else if (act === 'receive' && expected) openReceive(expected.payer);
    else if (act === 'topup') openTopUp(line.id);
    else if (act === 'cancel') cancel();
  };

  return (
    <SwipeableRow
      id={line.id}
      enabled
      pressable
      right={isBill && !paid ? { label: `${glyphs.checkboxOn.glyph} PAID`, onCommit: () => openTick(line.id) } : undefined}
      left={cancellable(state) ? { label: `${glyphs.cancel.glyph} CANCEL`, onCommit: cancel } : undefined}
      onSwipe={noteSwipe}
    >
      <Pressable
        onPress={() => !justSwiped() && openEdit(line.id)}
        onLongPress={() => onMenu(state)}
        delayLongPress={timing.pressDelay * 4}
        style={styles.row}
        accessible
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the line to edit it"
        accessibilityActions={a11yActions}
        onAccessibilityAction={onA11yAction}
      >
        {isBill ? (
          <>
            <View style={styles.line}>
              <Pressable
                onPress={() => (paid ? openEdit(line.id) : openTick(line.id))}
                hitSlop={space.sm}
                style={styles.box}
                accessible={false}
                importantForAccessibility="no"
              >
                <Text style={[type.glyph, paid ? styles.dim : styles.accent, styles.boxText]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {paid ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
                </Text>
              </Pressable>
              <Text
                style={[type.group, styles.name, paid ? styles.paidName : styles.bright]}
                numberOfLines={1}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              >
                {name}
              </Text>
              <Text style={[type.body, paid ? styles.dim : styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {paid ? (state.tick?.beforeStart ? 'PAID BEFORE SETUP' : `PAID ${formatRand(state.spent)}`) : formatRand(line.amount)}
              </Text>
              <MenuButton onPress={() => onMenu(state)} />
            </View>
            {expected && <ExpectedTag payer={expected.payer} amount={expected.amount} due={state.due > 0} />}
          </>
        ) : (
          <>
            <View style={styles.line}>
              <Text style={[type.group, styles.name, styles.bright]} numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {name}
              </Text>
              <Text style={[type.body, styles.left]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                {formatRand(state.left)}
              </Text>
            </View>
            <View style={styles.line}>
              <Meter
                id={line.id}
                fraction={state.allocated > 0 ? state.spent / state.allocated : 0}
                label={`${formatRand(state.spent)} / ${formatRand(state.allocated)}`}
              />
              {daily !== null && (
                <Text style={[type.meta, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {`${formatRand(daily)}/DAY`}
                </Text>
              )}
              {line.isFood && (
                <Pressable
                  onPress={() => openTopUp(line.id)}
                  style={({ pressed }) => [styles.small, pressed && styles.smallPressed]}
                  hitSlop={SMALL_SLOP}
                  accessible={false}
                  importantForAccessibility="no"
                >
                  <Text style={[type.glyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {glyphs.add.glyph}
                  </Text>
                </Pressable>
              )}
              <MenuButton onPress={() => onMenu(state)} />
            </View>
          </>
        )}
      </Pressable>
    </SwipeableRow>
  );
});

/** Under a bill with COMING IN: a lit button while it's due (opens RECEIVE), a dim note once it's in. */
function ExpectedTag({ payer, amount, due }: { payer: string; amount: number; due: boolean }) {
  if (!due) {
    return (
      <Text style={[type.meta, styles.dim, styles.tagIndent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {`${payer.toUpperCase()} ${formatRand(amount)} RECEIVED`}
      </Text>
    );
  }
  return (
    <View style={styles.tagIndent}>
      <Pressable
        onPress={() => openReceive(payer)}
        style={({ pressed }) => [styles.tag, pressed && styles.smallPressed]}
        hitSlop={SMALL_SLOP}
        accessible={false}
        importantForAccessibility="no"
      >
        <Text style={[type.meta, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${glyphs.receive.glyph} ${describeDue(payer, amount)}`}
        </Text>
      </Pressable>
    </View>
  );
}

/** The `≡` that opens a line's menu (the hold gesture's visible alternative). */
function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && styles.smallPressed]}
      hitSlop={SMALL_SLOP}
      accessible={false}
      importantForAccessibility="no"
    >
      <Text style={[type.glyph, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {glyphs.edit.glyph}
      </Text>
    </Pressable>
  );
}

/** The drawn size of the small [+] and [≡] boxes; hitSlop brings them to 44 pt. */
const SMALL = 32;
const SMALL_SLOP = (size.hitTarget - SMALL) / 2;

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowMinHeight,
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: shape.hairline,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1 },
  box: { minWidth: size.indent + space.sm, justifyContent: 'center' },
  boxText: { letterSpacing: shape.checkboxTracking },
  // What's left on a budget line: the number that matters, lit.
  left: { color: colors.accent, ...glowTextSoft, ...platformText },
  paidName: { color: colors.textDim, textDecorationLine: 'line-through', ...platformText },
  small: {
    width: SMALL,
    height: SMALL,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  smallPressed: { backgroundColor: colors.surface, borderColor: colors.lineLit },
  // The COMING IN tag sits under the bill's name, past the [ ] box.
  tagIndent: { marginLeft: size.indent + space.sm + space.md, alignItems: 'flex-start' },
  tag: {
    minHeight: SMALL,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.lineLit,
    borderRadius: shape.radius,
  },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
