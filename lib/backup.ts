/**
 * lib/backup.ts: backup files (PLAN §4 Settings, "backup save/share/import").
 *
 * Layer: pure lib. A backup is a JSON file the user saves wherever they
 * like (the app never sends it anywhere). Reading one back (migrate,
 * validate) lives in store/backup.ts, next to the same pipeline used at
 * startup. Bringing a backup back replaces the whole ledger, as one undo
 * step (a budget can't be merged with another one meaningfully).
 */
import type { Ledger } from './types';

/** Identifies a coin_log backup file. */
export const BACKUP_FORMAT = 'coin_log-backup';
/** Version of the file layout (the ledger inside has its own schemaVersion). */
export const BACKUP_VERSION = 1;

/** The file's contents. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** When it was made (epoch ms). */
  exportedAt: number;
  /** Which app build made it, for support questions. */
  app: { version: string; build: number };
  /** The whole ledger: every cycle, line, entry and chip. */
  ledger: Ledger;
}

/** Builds a backup of `ledger`. */
export function makeBackup(ledger: Ledger, now: number, app: { version: string; build: number }): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, app, ledger };
}

/** "coin_log-backup-2026-10-27-1430.json" (local time; sorts by date). */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `coin_log-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** What a ledger holds, for the import and restore previews. */
export interface LedgerCounts {
  /** Pay cycles, the current one included. */
  cycles: number;
  /** Log entries across every cycle. */
  entries: number;
}

/** Counts a ledger's cycles and entries. */
export function countLedger(ledger: Ledger): LedgerCounts {
  return { cycles: ledger.cycles.length, entries: ledger.cycles.reduce((n, c) => n + c.entries.length, 0) };
}

/** "3 CYCLES · 124 ENTRIES". */
export function countsLabel(c: LedgerCounts): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 'S'}`;
  return `${plural(c.cycles, 'CYCLE')} · ${plural(c.entries, 'ENTRY').replace('ENTRYS', 'ENTRIES')}`;
}
