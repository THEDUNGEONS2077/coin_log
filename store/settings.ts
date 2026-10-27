/**
 * store/settings.ts: user settings and their defaults (PLAN §4 Settings).
 *
 * Layer: store. Persisted as `settings.v1`. loadJSON fills in defaults for
 * missing fields, so adding a setting needs no migration. The chips live in
 * the ledger instead (they're part of the budget, and of its backups).
 */

export interface Settings {
  /** The terminal boot screen on a cold start. */
  bootSequence: boolean;
  /** Small vibrations on actions (services/haptics.ts). */
  haptics: boolean;
  /** 'system' follows the OS Reduce Motion setting. */
  reduceMotion: 'system' | 'on' | 'off';
}

export const DEFAULT_SETTINGS: Settings = {
  bootSequence: true,
  haptics: true,
  reduceMotion: 'system',
};
