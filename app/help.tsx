/**
 * app/help.tsx: the user guide, opened from Settings → HELP.
 *
 * Layer: UI (Expo Router screen). quest_log's guide layout: collapsible
 * sections in the app's terminal style. Each section opens with one plain
 * sentence saying what the feature is for, then short "do this → this
 * happens" lines. START HERE is open by default; the rest open with a tap.
 * The version and build number are at the bottom, so bug reports are
 * precise.
 *
 * Keep this in step with features: each phase that adds a flow, gesture or
 * button adds its line here (PLAN §3 is the source for every rule stated).
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/common/PageHeader';
import { colors, glyphs, maxFontSizeMultiplier, platformText, shape, size, space, type } from '@/theme';

/** One guide line: what you do → what happens. */
interface Line {
  key: string;
  what: string;
}

interface Section {
  title: string;
  /** One plain sentence: what this is for. */
  intro: string;
  lines: Line[];
}

const g = glyphs;

/** The guide, in the order people need it. */
const SECTIONS: Section[] = [
  {
    title: 'START HERE',
    intro:
      'coin_log keeps track of the money you have, split into credit and debit, with lines for what it is set aside for. It lives only on your phone: no account, no internet.',
    lines: [
      {
        key: '1. Set up',
        what: 'The first time, enter your savings, your debit balance and credit available right now, your next pay date, and your budget lines and bills.',
      },
      {
        key: '2. Log',
        what: `After a card tap, ${g.add.glyph} LOG: pick credit or debit, type the amount and a label, and choose what it came out of.`,
      },
      { key: '3. Payday', what: 'When the red line says "You Got Paid, Load Salary Now", tap it and load your salary.' },
      { key: 'Oops?', what: 'Every change shows UNDO for 5 seconds. Entries in LOG can be changed or deleted later.' },
    ],
  },
  {
    title: 'THE NUMBERS',
    intro: 'Spare is the money nothing is set aside for: what you can still spend freely.',
    lines: [
      { key: 'SPARE CR · SPARE DB', what: 'Each side’s money, minus what its budget lines and open bills hold back.' },
      {
        key: 'Budget line',
        what: 'Money set aside for something you buy through the month, like Food or toiletries. Transactions draw it down.',
      },
      { key: 'Bill', what: 'A fixed amount, like a debit order. Tick it off once it is paid.' },
      {
        key: 'Never below R0',
        what: 'coin_log refuses anything that would take spare, a line or savings below zero, and says what would be short.',
      },
      { key: 'FOOD', what: 'Always on credit. Shows how much you can spend each day until the day before payday.' },
      { key: 'Days to payday', what: 'Counts today up to the day before your next pay date.' },
    ],
  },
  {
    title: 'BUDGET TAB',
    intro: 'Your lines for this cycle: credit first, then debit.',
    lines: [
      {
        key: `${g.checkboxOff.glyph} on a bill`,
        what: 'Ticks it off: confirm what was paid. Paid less, the rest goes back to spare; paid more, the extra comes out of spare.',
      },
      { key: 'Swipe right', what: 'On a bill: the same as ticking it off.' },
      { key: 'Swipe left', what: 'Cancels the line: what it held goes back to spare, and it is gone from next cycle too.' },
      { key: 'Tap a name', what: 'Edits the line: its name and amount. The new amount is next cycle’s default too.' },
      { key: `${g.edit.glyph} on a line`, what: 'More: top up, edit, cancel.' },
      { key: `${g.add.glyph} next to CREDIT / DEBIT`, what: 'Adds a line to that side. Its amount is set aside from spare.' },
      { key: `${g.add.glyph} on FOOD`, what: 'Tops Food up from spare credit.' },
    ],
  },
  {
    title: 'LOGGING MONEY',
    intro: 'Log things after they happen: coin_log keeps the record, your bank moves the money.',
    lines: [
      {
        key: `${g.add.glyph} LOG`,
        what: 'A card tap. Choose a label (or type one), then split the amount over that side’s budget lines and spare. LOG works once the split adds up.',
      },
      { key: 'One tap, many lines', what: 'A grocery run can cover Food, toiletries and toilet paper at once: give each its part.' },
      { key: `${g.move.glyph} MOVE`, what: 'Debit to credit, debit to savings, or savings to debit or credit.' },
      { key: `${g.income.glyph} IN`, what: 'Extra cash into debit, with a label.' },
      { key: 'Chips', what: 'Quick labels. A label you type becomes a chip after its first use; manage them in Settings.' },
    ],
  },
  {
    title: 'LOG TAB',
    intro: 'Every entry, newest first: this cycle on top, older cycles folded below.',
    lines: [
      { key: 'Tap an entry', what: 'Changes it (this cycle only).' },
      { key: 'Swipe left', what: 'Deletes it: its money goes back where it came from. Deleting a paid bill reopens it.' },
      { key: 'Salary · start', what: 'Can only be undone right after, from their UNDO.' },
    ],
  },
  {
    title: 'SAVINGS TAB',
    intro: 'Your savings total, and everything that changed it.',
    lines: [
      { key: '→ DEBIT · → CREDIT', what: 'Moves savings onto a side.' },
      { key: '← FROM DEBIT', what: 'Puts spare debit into savings.' },
      { key: 'SET BALANCE', what: 'Corrects the total (interest, a mistake). The difference is logged.' },
    ],
  },
  {
    title: 'PAYDAY',
    intro: 'Loading the salary closes this cycle and starts the next.',
    lines: [
      { key: `${g.salary.glyph} SALARY`, what: 'Loads the salary any time, also before the pay date.' },
      { key: 'Amounts', what: 'The salary, what went to savings (off the top) and what went to credit. Debit gets the rest.' },
      {
        key: 'Balances',
        what: 'Your actual debit balance and credit available. Whatever is left from last cycle is in there, so it becomes spare.',
      },
      { key: 'RESET · EDIT', what: 'RESET puts every line back at its default amount. EDIT lets you change, remove or add lines first.' },
    ],
  },
];

/** "v0.1.0 (build 1)". */
function versionLabel(): string {
  const extra = Constants.expoConfig?.extra;
  return `v${String(extra?.versionName ?? '?')} (build ${String(extra?.versionCode ?? '?')})`;
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  // START HERE is open on arrival; the rest open on tap.
  const [open, setOpen] = useState<Set<string>>(() => new Set(['START HERE']));
  const toggle = (title: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PageHeader title="help" closeLabel="Close guide" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        {SECTIONS.map((section) => {
          const isOpen = open.has(section.title);
          return (
            <View key={section.title} style={styles.section}>
              {/* Section header: tap to open or close. */}
              <Pressable
                onPress={() => toggle(section.title)}
                style={styles.sectionHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${section.title}, ${isOpen ? 'expanded' : 'collapsed'}`}
              >
                <Text style={[type.caretGlyph, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {isOpen ? g.expanded.glyph : g.collapsed.glyph}
                </Text>
                <Text style={[type.group, styles.bright]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                  {section.title}
                </Text>
              </Pressable>
              {isOpen && (
                <View style={styles.body}>
                  <Text style={[type.subtask, styles.intro]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                    {section.intro}
                  </Text>
                  {section.lines.map((line) => (
                    <View key={line.key} style={styles.line}>
                      <Text style={[type.body, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                        {line.key}
                      </Text>
                      <Text style={[type.notes, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
                        {line.what}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {/* What's new: every bundled version's changes. */}
        <Pressable
          onPress={() => router.push('/whats-new')}
          style={({ pressed }) => [styles.whatsNew, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="What's new"
        >
          <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            [ WHAT&apos;S NEW ]
          </Text>
        </Pressable>
        <Text style={[type.meta, styles.version]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {`coin_log ${versionLabel()} · offline, no accounts, no tracking`}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pressed: { backgroundColor: colors.surface },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  section: { borderBottomWidth: shape.hairline, borderBottomColor: colors.line },
  // The whole header row is the tap target (≥ 52 pt tall).
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.rowMinHeight },
  body: { paddingBottom: space.md, paddingLeft: size.indent + space.md },
  intro: { color: colors.textBright, marginBottom: space.sm, ...platformText },
  line: { paddingVertical: space.sm },
  accent: { color: colors.accent, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, marginTop: space.xs, ...platformText },
  version: { color: colors.textDim, marginTop: space.xl, ...platformText },
  whatsNew: {
    marginTop: space.xl,
    minHeight: size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape.hairline,
    borderColor: colors.line,
    borderRadius: shape.radius,
  },
});
