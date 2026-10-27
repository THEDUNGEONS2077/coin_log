/**
 * app/settings.tsx: Settings (PLAN §4 Pages), opened from ⊛ in the header.
 *
 *   > settings                              ✕
 *   FEEL   boot screen · haptics · reduce motion
 *   DATA   save backup · share backup · import · restore a snapshot · delete all data
 *   HELP   guide · what's new · report a problem · version
 *
 * Layer: UI (Expo Router screen). quest_log's Settings, trimmed to what
 * coin_log has. Settings save as soon as they change (store
 * `updateSettings`, persisted as `settings.v1`). Import, restore and delete
 * all are previewed or confirmed first, then applied as one undo step; the
 * screen then returns to the main screen, where the toast offers UNDO.
 */
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/common/PageHeader';
import { Rule } from '@/components/common/Rule';
import { ActionSheet, type SheetAction } from '@/components/overlays/ActionSheet';
import { backupFileName, countLedger, countsLabel, makeBackup } from '@/lib/backup';
import type { Ledger } from '@/lib/types';
import { appBuild, appVersion } from '@/services/appInfo';
import { backupUi, pickBackupText, saveBackupToFolder, shareBackup } from '@/services/backup';
import { BackupError, parseBackup } from '@/store/backup';
import { useActions, useAppStore } from '@/store/react';
import type { Settings } from '@/store/settings';
import { colors, glowShadow, glowTextSoft, glyphs as g, maxFontSizeMultiplier, platformText, size, space, type } from '@/theme';

/** Where problems are reported (opened in the browser, only when tapped). */
const ISSUES_URL = 'https://github.com/THEDUNGEONS2077/coin_log/issues/new';

/**
 * Opens a new GitHub issue with the version filled in. The app itself has no
 * network access: the browser opens the page, and the user decides what to send.
 */
function reportProblem(): void {
  const body = `**What happened?**\n\n\n**What did you expect?**\n\n\n---\ncoin_log v${appVersion()} (build ${appBuild()}), Android ${String(Platform.Version)}`;
  void Linking.openURL(`${ISSUES_URL}?body=${encodeURIComponent(body)}`);
}

/** A sheet the screen can show: its title and choices. */
interface Sheet {
  title: string;
  actions: SheetAction[];
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useAppStore((s) => s.settings);
  const hasBudget = useAppStore((s) => s.ledger.cycles.length > 0);
  const actions = useActions();
  const set = (patch: Partial<Settings>) => actions.updateSettings(patch);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // One status line for the Data section ("> BACKUP SAVED …", errors).
  const [status, setStatus] = useState<string | null>(null);

  const pickReduceMotion = () =>
    setSheet({
      title: 'REDUCE MOTION',
      actions: (['system', 'on', 'off'] as const).map((v) => ({
        glyph: settings.reduceMotion === v ? g.checkboxOn.glyph : g.checkboxOff.glyph,
        label: v === 'system' ? 'Follow the system setting' : v === 'on' ? 'Always' : 'Never',
        onPress: () => set({ reduceMotion: v }),
      })),
    });

  // --- Data ---
  const backupJson = () => {
    const now = Date.now();
    const file = makeBackup(actions.ledger, now, { version: appVersion(), build: appBuild() });
    return { json: JSON.stringify(file), name: backupFileName(now) };
  };
  const saveBackup = async () => {
    const { json, name } = backupJson();
    try {
      if (await saveBackupToFolder(json, name)) setStatus(`BACKUP SAVED: ${name}`);
    } catch {
      setStatus('COULDN’T SAVE THERE. TRY ANOTHER FOLDER, OR SHARE INSTEAD.');
    }
  };
  const share = async () => {
    const { json, name } = backupJson();
    try {
      await shareBackup(json, name);
    } catch {
      setStatus('COULDN’T OPEN SHARING.');
    }
  };

  /** Back to the main screen, where the UNDO toast for the change is shown. */
  const doneWithData = () => router.back();
  const importBackup = async () => {
    setStatus(null);
    let ledger: Ledger;
    let exportedAt: number | null;
    try {
      const text = await pickBackupText();
      if (text === null) return;
      ({ ledger, exportedAt } = parseBackup(text));
    } catch (e) {
      setStatus(e instanceof BackupError ? e.message.toUpperCase() : 'COULDN’T READ THAT FILE.');
      return;
    }
    const when = exportedAt ? new Date(exportedAt).toLocaleString() : 'unknown date';
    setSheet({
      title: `BACKUP FROM ${when.toUpperCase()}\n${countsLabel(countLedger(ledger))}`,
      actions: [
        {
          glyph: g.load.glyph,
          label: 'Replace: swap everything for the backup',
          onPress: () => {
            actions.importLedger(ledger);
            doneWithData();
          },
        },
      ],
    });
  };
  const restore = () => {
    const snapshots = actions.listSnapshots();
    setSheet({
      title: snapshots.length
        ? 'RESTORE A DAILY SNAPSHOT\nReplaces everything; UNDO brings it back.'
        : 'NO SNAPSHOTS YET (ONE IS TAKEN EACH DAY)',
      actions: snapshots.map((snap) => ({
        glyph: g.undo.glyph,
        label: `${snap.date} · ${countsLabel(snap.counts)}`,
        onPress: () => {
          if (actions.restoreSnapshot(snap.key)) doneWithData();
          else setStatus('THAT SNAPSHOT COULDN’T BE READ.');
        },
      })),
    });
  };
  const deleteAll = () =>
    setSheet({
      title: 'DELETE ALL DATA?\nEvery cycle, line, entry and chip. UNDO brings it back; save a backup first to be safe.',
      actions: [
        {
          glyph: g.delete.glyph,
          label: 'Delete everything',
          onPress: () => {
            actions.deleteAllData();
            doneWithData();
          },
        },
      ],
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PageHeader title="settings" closeLabel="Close settings" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        <Section title="FEEL">
          <Toggle
            label="Boot screen"
            hint="The start-up text when the app opens"
            value={settings.bootSequence}
            onChange={(v) => set({ bootSequence: v })}
          />
          <Toggle label="Haptics" hint="Small vibrations on actions" value={settings.haptics} onChange={(v) => set({ haptics: v })} />
          <Choice
            label="Reduce motion"
            hint="Skip animations"
            value={settings.reduceMotion === 'system' ? 'SYSTEM' : settings.reduceMotion === 'on' ? 'ALWAYS' : 'NEVER'}
            onPress={pickReduceMotion}
          />
        </Section>

        <Section title="DATA">
          <Text style={[type.notes, styles.dim, styles.intro]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            Everything stays on this phone. A backup is a file you keep; uninstalling the app deletes its data, so save one first.
          </Text>
          <Action glyph={g.save.glyph} label={backupUi.saveLabel} onPress={() => void saveBackup()} />
          {backupUi.separateShare && <Action glyph={g.share.glyph} label="Share backup…" onPress={() => void share()} />}
          <Action glyph={g.load.glyph} label="Import a backup…" onPress={() => void importBackup()} />
          <Action glyph={g.undo.glyph} label="Restore a daily snapshot…" onPress={restore} />
          {hasBudget && <Action glyph={g.delete.glyph} label="Delete all data…" onPress={deleteAll} />}
          {status !== null && (
            <Text
              style={[type.meta, styles.accent, styles.status]}
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {`${g.prompt.glyph} ${status}`}
            </Text>
          )}
        </Section>

        <Section title="HELP">
          <Action glyph={g.help.glyph} label="User guide" onPress={() => router.push('/help')} />
          <Action glyph={g.prompt.glyph} label="What's new" onPress={() => router.push('/whats-new')} />
          <Action glyph={g.share.glyph} label="Report a problem" onPress={reportProblem} />
          <Text style={[type.meta, styles.dim, styles.version]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
            {`coin_log v${appVersion()} (build ${appBuild()}) · offline, no accounts, no tracking`}
          </Text>
        </Section>
      </ScrollView>

      <ActionSheet visible={sheet !== null} title={sheet?.title ?? ''} actions={sheet?.actions ?? []} onClose={() => setSheet(null)} />
    </View>
  );
}

/** A titled group of rows: `FEEL ━━━━──────` (the rule after the heading divides the sections). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[type.group, styles.bright]} accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {title}
        </Text>
        <Rule lit />
      </View>
      {children}
    </View>
  );
}

/** Label and hint on the left, `[ON ]` / `[OFF]` on the right; the whole row toggles. */
function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <RowText label={label} hint={hint} />
      <Text style={[type.tab, value ? styles.lit : styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {value ? '[ON ]' : '[OFF]'}
      </Text>
    </Pressable>
  );
}

/** Label and hint on the left, the current value on the right; opens a chooser. */
function Choice({ label, hint, value, onPress }: { label: string; hint: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={hint}
    >
      <RowText label={label} hint={hint} />
      <Text style={[type.tab, styles.accent]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {value}
      </Text>
    </Pressable>
  );
}

/** A one-line action button. */
function Action({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.glyph, styles.accent, styles.actionGlyph]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {glyph}
      </Text>
      <Text style={[type.body, styles.text, styles.grow]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

function RowText({ label, hint }: { label: string; hint: string }) {
  return (
    <View style={styles.grow}>
      <Text style={[type.body, styles.text]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
      <Text style={[type.meta, styles.dim]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Pressed: the row lights up from its left edge (like a selected row's bar).
  pressed: { backgroundColor: colors.surface, boxShadow: glowShadow.edge },
  content: { paddingHorizontal: space.lg, maxWidth: size.maxContentWidth, width: '100%', alignSelf: 'center' },
  section: { paddingTop: space.xl, paddingBottom: space.xs },
  // The heading, then its rule to the right edge.
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  intro: { marginBottom: space.sm },
  // Out to the screen edges (the content's padding moved inside), so a press lights the whole row.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.rowMinHeight,
    paddingVertical: space.sm,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
  },
  grow: { flex: 1 },
  actionGlyph: { width: size.indent, textAlign: 'center' },
  status: { marginTop: space.sm },
  version: { marginTop: space.md },
  accent: { color: colors.accent, ...platformText },
  // A setting that's on: lit, with the soft text glow.
  lit: { color: colors.accent, ...glowTextSoft, ...platformText },
  bright: { color: colors.textBright, ...platformText },
  text: { color: colors.text, ...platformText },
  dim: { color: colors.textDim, ...platformText },
});
