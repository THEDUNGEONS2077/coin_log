/**
 * app/spend.tsx: log a transaction, split or bulk (PLAN F2), or change an
 * earlier one (F10).
 *
 *   > log transaction
 *   [ CREDIT ][ DEBIT ]
 *   AMOUNT  R [200]
 *   LABEL   [GROCERIES] [FUEL] …  or type one
 *   FROM ━━━━━━━──────
 *   SPARE CREDIT · R500 AVAILABLE            R100   ← whatever the lines don't take
 *   [x] FOOD · R1 700 LEFT     TAKE R [100]
 *   [ ] TOILETRIES · R250 LEFT
 *   AFTER THIS: FOOD R1 600 LEFT · SPARE CREDIT R400
 *   [ LOG ]
 *
 * Layer: UI (Expo Router screen). Route param `entry`: change that
 * transaction. One side only (D9); the sources are that side's budget lines
 * and its spare (D25). Ticking a line adds it with as much as it can take of
 * what's still on spare; SPARE always takes the rest [P], so the parts add
 * up to the amount exactly (D10) unless the lines take more than it. The
 * side starts as the one last used.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Rule } from '@/components/common/Rule';
import { useMinute } from '@/components/common/useMinute';
import { AmountField, FormButton, FormPage, LabelPicker, Missing, Preview, Segmented } from '@/components/form';
import { deleteEntry, type LineState, logSpend, sideLabel, SIDES, type SpendInput } from '@/lib/ledger';
import { formatRand, parseRand, sum } from '@/lib/money';
import { type Cycle, type Side, SPARE, type SpendEntry } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { budgetOf, useActions, useAppStore, useBudget } from '@/store/react';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

const SIDE_OPTIONS = SIDES.map((s) => ({ key: s, label: sideLabel(s) }));

export default function SpendScreen() {
  const params = useLocalSearchParams<{ entry?: string }>();
  const { cycle } = useBudget();
  if (!cycle) return <Missing title="log transaction" what="Set coin_log up first." />;
  const entry = params.entry ? cycle.entries.find((e): e is SpendEntry => e.id === params.entry && e.type === 'spend') : undefined;
  if (params.entry && !entry) return <Missing title="edit transaction" what="That transaction isn't in this cycle any more." />;
  return <SpendForm entry={entry} />;
}

/**
 * The line parts of a transaction being edited, as typed text by line ID.
 * Parts on lines cancelled since are left out: spare takes them [P].
 */
function partsOf(entry: SpendEntry | undefined, cycle: Cycle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of entry?.parts ?? []) {
    if (p.source !== SPARE && cycle.lines.some((l) => l.id === p.source)) out[p.source] = String(p.amount);
  }
  return out;
}

function SpendForm({ entry }: { entry?: SpendEntry }) {
  const actions = useActions();
  const { ledger, cycle } = useBudget();
  const now = useMinute();
  const lastSide = useAppStore((s) => s.ui.lastSpendSide);
  const chips = useAppStore((s) => s.ledger.chips.spend);
  const [side, setSide] = useState<Side>(entry?.side ?? lastSide);
  const [totalText, setTotalText] = useState(entry ? String(entry.total) : '');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [parts, setParts] = useState<Record<string, string>>(() => partsOf(entry, cycle!));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What each source has before this transaction (an edit: without the transaction being edited).
  const before = useMemo(() => {
    const without = entry ? deleteEntry(ledger, entry.id) : null;
    return budgetOf(without?.ok ? without.ledger : ledger).state!;
  }, [ledger, entry]);
  const lines = before.lines.filter((l) => l.line.kind === 'budget' && l.line.side === side);

  const total = parseRand(totalText);
  const chosen = lines.filter((l) => parts[l.line.id] !== undefined);
  const lineAmounts = chosen.map((l) => ({ source: l.line.id, amount: parseRand(parts[l.line.id]!) }));
  const onLines = sum(lineAmounts.map((p) => p.amount ?? 0));
  // Spare takes whatever the lines don't (negative: the lines take more than the amount).
  const onSpare = (total ?? 0) - onLines;
  const input: SpendInput = {
    side,
    total: total ?? 0,
    label,
    parts: [
      ...lineAmounts.filter((p) => p.amount).map((p) => ({ source: p.source, amount: p.amount! })),
      ...(onSpare > 0 ? [{ source: SPARE, amount: onSpare }] : []),
    ],
  };

  // The same builder LOG runs, as a preview.
  const ready = total !== null && total > 0 && lineAmounts.every((p) => p.amount !== null);
  const trial = ready ? logSpend(ledger, { ...input, label: label.trim() || '?' }, { newId: () => 'preview', now }, entry?.id) : null;
  const after = trial?.ok ? budgetOf(trial.ledger).state : null;

  /** Ticks a line in or out; a line ticked in takes what it can of what's on spare. */
  const toggle = (l: LineState) => {
    haptics.check();
    setParts((prev) => {
      const next = { ...prev };
      if (next[l.line.id] !== undefined) delete next[l.line.id];
      else {
        const take = Math.min(Math.max(onSpare, 0), Math.max(l.left, 0));
        next[l.line.id] = take > 0 ? String(take) : '';
      }
      return next;
    });
  };

  const confirm = () => {
    setTried(true);
    if (total === null || total === 0) return setError('ENTER THE AMOUNT');
    if (label.trim() === '') return setError('ADD A LABEL');
    if (!lineAmounts.every((p) => p.amount !== null)) return setError('ENTER AN AMOUNT FOR EACH LINE TICKED');
    const outcome = actions.logSpend(input, entry?.id);
    if (outcome) return setError(outcome);
    actions.setLastSpendSide(side);
    haptics.success();
    router.back();
  };

  const sideName = sideLabel(side);
  return (
    <FormPage
      title={entry ? 'edit transaction' : 'log transaction'}
      closeLabel="Cancel"
      error={error}
      actions={<FormButton label={entry ? 'SAVE' : 'LOG'} onPress={confirm} primary grow accessibilityLabel={entry ? 'Save' : 'Log it'} />}
    >
      <Segmented
        options={SIDE_OPTIONS}
        value={side}
        onChange={(s) => {
          // The sources are per side: switching starts the split again.
          setSide(s);
          setParts({});
        }}
        accessibilityLabel="Paid with"
      />
      <AmountField
        label="AMOUNT"
        value={totalText}
        onChange={setTotalText}
        autoFocus={!entry}
        problem={tried && (total === null || total === 0) ? 'ENTER THE AMOUNT' : null}
      />
      <LabelPicker
        chips={chips}
        value={label}
        onChange={setLabel}
        placeholder="e.g. Restaurant"
        problem={tried && label.trim() === '' ? 'ADD A LABEL' : null}
      />

      <View style={styles.sources}>
        <View style={styles.head}>
          <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
            FROM
          </Text>
          <Rule lit />
        </View>
        <View
          style={styles.spare}
          accessible
          accessibilityLabel={`Spare ${sideName.toLowerCase()} takes ${formatRand(Math.max(onSpare, 0))}`}
        >
          <Text style={[type.body, styles.text, styles.grow]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`SPARE ${sideName}`}
            <Text style={[type.meta, styles.dim]}>{` · ${formatRand(before.spare[side])} AVAILABLE`}</Text>
          </Text>
          <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {formatRand(Math.max(onSpare, 0))}
          </Text>
        </View>
        {lines.map((l) => (
          <SourceRow
            key={l.line.id}
            state={l}
            chosen={parts[l.line.id] !== undefined}
            value={parts[l.line.id] ?? ''}
            onToggle={() => toggle(l)}
            onChange={(v) => setParts((prev) => ({ ...prev, [l.line.id]: v }))}
            showProblem={tried}
          />
        ))}
        {lines.length === 0 && (
          <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`NO ${sideName} BUDGET LINES: IT ALL COMES FROM SPARE`}
          </Text>
        )}
        {onSpare < 0 && (
          <Text style={[type.meta, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`THE LINES TAKE ${formatRand(-onSpare)} MORE THAN THE AMOUNT`}
          </Text>
        )}
      </View>

      <Preview
        problem={!ready ? 'ENTER THE AMOUNT' : trial && !trial.ok ? trial.error : null}
        lines={
          after
            ? [
                ...chosen.map(
                  (l) => `${l.line.name.toUpperCase()} ${formatRand(after.lines.find((x) => x.line.id === l.line.id)?.left ?? 0)} LEFT`,
                ),
                `SPARE ${sideName} ${formatRand(after.spare[side])}`,
              ]
            : []
        }
      />
    </FormPage>
  );
}

interface SourceProps {
  state: LineState;
  chosen: boolean;
  value: string;
  onToggle: () => void;
  onChange: (digits: string) => void;
  showProblem: boolean;
}

/** One budget line as a source: tick it in, then say how much it takes. */
function SourceRow({ state, chosen, value, onToggle, onChange, showProblem }: SourceProps) {
  const name = state.line.name.toUpperCase();
  return (
    <View style={[styles.source, chosen && styles.sourceOn]}>
      <Pressable
        onPress={onToggle}
        style={styles.sourceHead}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: chosen }}
        aria-checked={chosen}
        accessibilityLabel={`From ${state.line.name}, ${formatRand(state.left)} left`}
      >
        <Text style={[type.glyph, chosen ? styles.accent : styles.text, styles.box]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {chosen ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
        </Text>
        <Text
          style={[type.body, chosen ? styles.bright : styles.text, styles.grow]}
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {name}
        </Text>
        <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`${formatRand(state.left)} LEFT`}
        </Text>
      </Pressable>
      {chosen && (
        <AmountField
          label={`FROM ${name}`}
          value={value}
          onChange={onChange}
          problem={showProblem && parseRand(value) === null ? 'ENTER AN AMOUNT' : null}
          accessibilityLabel={`Amount from ${state.line.name}`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sources: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  spare: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.hitTarget },
  source: {
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  sourceOn: { borderColor: colors.lineLit, paddingBottom: space.md },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.rowMinHeight },
  box: { letterSpacing: shape.checkboxTracking, minWidth: size.indent + space.xs },
  grow: { flex: 1 },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
