/**
 * store/backup.ts: reads backup files and daily snapshots back in.
 *
 * Layer: store. Uses the same pipeline as startup (store/persist.ts):
 * migrate an older schema, then validate. Anything that fails gets a
 * plain-language message for the screen, and nothing in the app changes.
 *
 * Accepted inputs: a coin_log backup file (lib/backup.ts), or a bare
 * ledger (the format daily snapshots use).
 */
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/lib/backup';
import type { Ledger } from '@/lib/types';

import { FutureSchemaError, migrate } from './migrations';

/** A backup that read cleanly, ready to preview and import. */
export interface ParsedBackup {
  ledger: Ledger;
  /** When the backup was made, if the file says (bare ledgers don't). */
  exportedAt: number | null;
}

/** A backup that can't be used; `message` is shown to the user as is. */
export class BackupError extends Error {}

/** Largest file accepted (years of a budget are well under 1 MB). */
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;

/** Migrates and validates a ledger. Throws BackupError. */
export function readLedger(data: unknown): Ledger {
  try {
    return migrate(data).ledger;
  } catch (e) {
    if (e instanceof FutureSchemaError) throw new BackupError('This backup is from a newer coin_log. Update the app, then try again.');
    throw new BackupError('This backup is damaged or incomplete, so it can’t be used.');
  }
}

/** Reads a backup file's text. Throws BackupError with a message for the user. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('That file isn’t a coin_log backup (it isn’t valid JSON).');
  }
  if (!data || typeof data !== 'object') throw new BackupError('That file isn’t a coin_log backup.');
  const file = data as Record<string, unknown>;

  // A coin_log backup file.
  if (file.format === BACKUP_FORMAT) {
    if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
      throw new BackupError('This backup is from a newer coin_log. Update the app, then try again.');
    }
    return { ledger: readLedger(file.ledger), exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : null };
  }
  // A bare ledger (for example, a daily snapshot copied out).
  if ('cycles' in file && 'chips' in file && 'schemaVersion' in file) return { ledger: readLedger(file), exportedAt: null };
  throw new BackupError('That file isn’t a coin_log backup.');
}
