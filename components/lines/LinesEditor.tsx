/**
 * components/lines/LinesEditor.tsx: the list of budget lines being set up
 * (F0 step 2) or edited for a new cycle (F1 step 3, EDIT).
 *
 *   CREDIT LINES ━━━━━━━──────
 *   ┌ FOOD ─────────────────────────────┐
 *   │ MONTHLY R[1800]   LEFT NOW R[900] │
 *   └───────────────────────────────────┘
 *   ┌ NAME [Toiletries]            [✕] ┐
 *   │ [BUDGET][BILL]  [CREDIT][DEBIT]   │
 *   │ MONTHLY R[250]    LEFT NOW R[ ]   │
 *   └───────────────────────────────────┘
 *   [ + ADD CREDIT LINE ]
 *   DEBIT LINES ━━━━━━━───────
 *   …
 *
 * Layer: UI. Grouped by side, the way the BUDGET tab shows them. Food is
 * always there, on credit, as a budget, and can't be removed (PLAN D23); its
 * card only takes amounts. Fields with problems are marked once the user
 * has tried to go on (`showProblems`).
 *
 * In setup ('start') a line has its MONTHLY amount (next cycle's default)
 * and, for a budget, what's LEFT NOW (empty = all of it), or, for a bill,
 * whether it's ALREADY PAID this cycle. In the salary load ('salary') a line
 * has one AMOUNT: this cycle's, which also becomes its default (D27).
 *
 * A debit bill also has COMING IN (F15): money someone else pays in towards
 * it. In setup it can be marked ALREADY RECEIVED; a bill already paid has
 * nothing left to come in, so it isn't offered there. Or it PAYS THE CARD
 * (F19), the one bill that settles the credit card's deductions; in setup,
 * with what's ALREADY DEDUCTED and not yet settled.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Rule } from '@/components/common/Rule';
import { Checkbox } from '@/components/form/Checkbox';
import { ExpectedFields } from '@/components/form/ExpectedFields';
import { AmountField, TextField } from '@/components/form/Field';
import { Segmented } from '@/components/form/Segmented';
import { payerKey, sideLabel, SIDES } from '@/lib/ledger';
import { parseRand } from '@/lib/money';
import type { LineKind } from '@/lib/types';
import { haptics } from '@/services/haptics';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

import { type DraftMode, draftProblems, type LineDraft, newDraft, takesExpected } from './drafts';

interface Props {
  mode: DraftMode;
  drafts: LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
  /** Mark the fields that can't be used (after a first attempt to go on). */
  showProblems: boolean;
}

/** The payers typed on these cards, each once (FROM's chips on another card, D33). */
function draftPayers(drafts: readonly LineDraft[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of drafts) {
    const p = d.expected.on ? d.expected.payer.trim() : '';
    if (p !== '' && !seen.has(payerKey(p))) {
      seen.add(payerKey(p));
      out.push(p);
    }
  }
  return out;
}

/** The lines, grouped CREDIT then DEBIT, each side with its ADD button. */
export function LinesEditor({ mode, drafts, onChange, showProblems }: Props) {
  /** Replaces one draft (by key) with `patch` applied. */
  const update = (key: string, patch: Partial<LineDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => {
    haptics.delete();
    onChange(drafts.filter((d) => d.key !== key));
  };

  return (
    <View style={styles.wrap}>
      {SIDES.map((side) => (
        <View key={side} style={styles.side}>
          <View style={styles.sideHead}>
            <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`${sideLabel(side)} LINES`}
            </Text>
            <Rule lit />
          </View>
          {/* Food first on credit, then the side's lines in order. */}
          {drafts
            .filter((d) => d.side === side)
            .sort((a, b) => Number(b.isFood) - Number(a.isFood))
            .map((d) => (
              <LineCard
                key={d.key}
                draft={d}
                mode={mode}
                payers={draftPayers(drafts.filter((x) => x.key !== d.key))}
                cardTaken={drafts.some((x) => x.key !== d.key && x.paysCard && takesExpected(x.kind, x.side))}
                showProblems={showProblems}
                onChange={(patch) => update(d.key, patch)}
                onRemove={() => remove(d.key)}
              />
            ))}
          <Pressable
            onPress={() => onChange([...drafts, newDraft(side)])}
            style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Add a ${sideLabel(side).toLowerCase()} line`}
          >
            <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {`[ ${glyphs.add.glyph} ADD ${sideLabel(side)} LINE ]`}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const KIND_OPTIONS = [
  { key: 'budget', label: 'BUDGET', a11y: 'Budget line: drawn down by transactions' },
  { key: 'bill', label: 'BILL', a11y: 'Bill: a fixed amount, ticked off when paid' },
] as const satisfies readonly { key: LineKind; label: string; a11y: string }[];

const SIDE_OPTIONS = SIDES.map((s) => ({ key: s, label: sideLabel(s) }));

interface CardProps {
  draft: LineDraft;
  mode: DraftMode;
  /** Payers named on the other cards, for FROM's chips. */
  payers: readonly string[];
  /** Another card already PAYS THE CARD (only one may, F19). */
  cardTaken: boolean;
  showProblems: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}

/** One line's fields, in a hairline frame. */
function LineCard({ draft: d, mode, payers, cardTaken, showProblems, onChange, onRemove }: CardProps) {
  const problems = draftProblems(d, mode);
  const show = (p: string | null) => (showProblems ? p : null);
  const named = d.isFood ? 'Food' : d.name.trim() || 'New line';

  return (
    <View style={styles.card}>
      {d.isFood ? (
        <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          FOOD · CREDIT BUDGET
        </Text>
      ) : (
        <View style={styles.nameRow}>
          <View style={styles.grow}>
            <TextField
              label="NAME"
              value={d.name}
              onChange={(name) => onChange({ name })}
              placeholder="e.g. Toiletries"
              problem={show(problems.name)}
            />
          </View>
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${named}`}
          >
            <Text style={[type.glyph, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
              {glyphs.delete.glyph}
            </Text>
          </Pressable>
        </View>
      )}

      {!d.isFood && (
        <>
          <Segmented options={KIND_OPTIONS} value={d.kind} onChange={(kind) => onChange({ kind })} accessibilityLabel={`${named}: kind`} />
          <Segmented options={SIDE_OPTIONS} value={d.side} onChange={(side) => onChange({ side })} accessibilityLabel={`${named}: side`} />
        </>
      )}

      {mode === 'start' ? (
        <View style={styles.amounts}>
          <View style={styles.grow}>
            <AmountField
              label="MONTHLY"
              value={d.amount}
              onChange={(amount) => onChange({ amount })}
              problem={show(problems.amount)}
              accessibilityLabel={`${named}, monthly amount`}
            />
          </View>
          {d.kind === 'budget' ? (
            <View style={styles.grow}>
              <AmountField
                label="LEFT NOW"
                value={d.leftNow}
                onChange={(leftNow) => onChange({ leftNow })}
                hint={d.leftNow === '' ? 'ALL OF IT' : undefined}
                problem={show(problems.leftNow)}
                accessibilityLabel={`${named}, left now`}
              />
            </View>
          ) : (
            <PaidToggle paid={d.paid} onChange={(paid) => onChange({ paid })} name={named} />
          )}
        </View>
      ) : (
        <AmountField
          label={d.kind === 'bill' ? 'BILL AMOUNT' : 'AMOUNT THIS CYCLE'}
          value={d.amount}
          onChange={(amount) => onChange({ amount })}
          problem={show(problems.amount)}
          accessibilityLabel={`${named}, amount`}
        />
      )}

      {/* One bill pays the card (F19); it can't also have COMING IN. */}
      {takesExpected(d.kind, d.side) && !d.expected.on && (d.paysCard || !cardTaken) && (
        <View style={styles.card2}>
          <Checkbox
            checked={d.paysCard}
            onChange={(paysCard) => onChange({ paysCard })}
            label="PAYS THE CARD"
            spoken={`${named}: settles the credit card's deductions`}
          />
          {d.paysCard && mode === 'start' && !d.paid && (
            <AmountField
              label="ALREADY DEDUCTED"
              value={d.deductedBefore}
              onChange={(deductedBefore) => onChange({ deductedBefore })}
              hint={d.deductedBefore === '' ? 'Deducted on the card, not settled yet' : undefined}
              problem={show(problems.deductedBefore)}
              accessibilityLabel={`${named}, already deducted`}
            />
          )}
        </View>
      )}

      {takesExpected(d.kind, d.side) && !(mode === 'start' && d.paid) && !d.paysCard && (
        <ExpectedFields
          value={d.expected}
          onChange={(expected) => onChange({ expected })}
          bill={parseRand(d.amount)}
          payers={payers}
          showReceived={mode === 'start'}
          showProblems={showProblems}
          name={named}
        />
      )}
    </View>
  );
}

/** `[x] ALREADY PAID`: a bill that went off before setup holds nothing back (F0). */
function PaidToggle({ paid, onChange, name }: { paid: boolean; onChange: (paid: boolean) => void; name: string }) {
  return (
    <Pressable
      onPress={() => {
        haptics.check();
        onChange(!paid);
      }}
      style={styles.paid}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: paid }}
      aria-checked={paid}
      accessibilityLabel={`${name}: already paid this cycle`}
    >
      <Text style={[type.glyph, paid ? styles.accent : styles.text, styles.box]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {paid ? glyphs.checkboxOn.glyph : glyphs.checkboxOff.glyph}
      </Text>
      <Text style={[type.meta, paid ? styles.bright : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {'ALREADY PAID\nTHIS CYCLE'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  side: { gap: space.md },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: {
    gap: space.md,
    padding: space.md,
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  grow: { flex: 1 },
  card2: { gap: space.md },
  amounts: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  remove: {
    width: size.hitTarget,
    height: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
  removePressed: { backgroundColor: colors.surface, borderColor: colors.lineLit },
  paid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.hitTarget, marginTop: space.lg },
  box: { letterSpacing: shape.checkboxTracking },
  add: {
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
    borderStyle: 'dashed',
  },
  addPressed: { backgroundColor: colors.surface, borderColor: colors.lineLit },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
