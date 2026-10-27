/**
 * theme/glyphs.ts: the typographic "icon set".
 *
 * Layer: theme. coin_log has no icon font (quest_log's design): every icon is
 * a text glyph drawn in JetBrains Mono. Components use `glyphs.move` and never
 * inline the character, so a glyph can be swapped app-wide in one place.
 *
 * Every glyph here is in the bundled font (checked against its character map
 * when this file was written, 2026-10-27): a missing one would be drawn by a
 * system fallback font, not monospace and possibly as a color emoji. For
 * example ⇄ isn't in the font, so MOVE uses ↔.
 */

/** One glyph: what we render, and whether the font has it. */
export interface Glyph {
  /** The character(s) rendered in the UI. */
  readonly glyph: string;
  /** False when `glyph` isn't in JetBrains Mono (rendered by a system fallback font). */
  readonly inFont: boolean;
}

/** Shorthand for an entry that's in the font. */
const g = (glyph: string): Glyph => ({ glyph, inFont: true });

export const glyphs = {
  // --- Bills ---
  /** An open bill: tap to tick it off (F3). */
  checkboxOff: g('[ ]'),
  /** A paid bill. */
  checkboxOn: g('[x]'),

  // --- Folding (past cycles in LOG, help sections) ---
  collapsed: g('▸'),
  expanded: g('▾'),

  // --- Log entries (one per entry type, PLAN §2) ---
  /** A salary load (F1). */
  salary: g('⊕'),
  /** The first-run start (F0). */
  start: g('▸'),
  /** A transaction (F2): money out. */
  spend: g('−'),
  /** A bill ticked off (F3). */
  paid: g('✓'),
  /** A line cancelled (F4). */
  cancel: g('✕'),
  /** A budget line topped up (F7). */
  topUp: g('↑'),
  /** Money moved between debit, credit and savings (F8). */
  move: g('↔'),
  /** Extra cash in (F9). */
  income: g('+'),
  /** A savings SET BALANCE correction (F14). */
  adjust: g('±'),

  // --- Header and actions ---
  add: g('+'),
  /** U+229B CIRCLED ASTERISK: gear-like, in-font. */
  settings: g('⊛'),
  delete: g('✕'),
  undo: g('↩'),
  edit: g('≡'),
  done: g('✓'),
  help: g('?'),
  back: g('←'),
  next: g('→'),

  // --- Data (Settings) ---
  /** Save a backup: down into storage. */
  save: g('↧'),
  /** Import a backup: up out of a file. */
  load: g('↥'),
  share: g('⇧'),

  // --- Terminal chrome ---
  cursor: g('█'),
  prompt: g('>'),
} as const satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphs;
