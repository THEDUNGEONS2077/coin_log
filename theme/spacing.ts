/**
 * theme/spacing.ts: spacing, sizing and shape tokens (quest_log's).
 *
 * Layer: theme. Everything sits on a 4 pt grid, except hairline borders.
 */

/** Spacing scale (4 pt grid). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Fixed layout sizes. */
export const size = {
  /** Horizontal indent per tree depth level (20 → 24 with the larger text). */
  indent: 24,
  /**
   * Width of the ▸ / ▾ caret column. Wider than the indent since the caret
   * grew to 31 pt (user request 2026-10-08), so it never crowds the checkbox.
   */
  caretColumn: 36,
  /** Gap between the caret column and the checkbox (user request 2026-10-08). */
  caretGap: 8,
  /** Indentation stops growing past this depth; deeper rows show a depth badge. */
  maxVisualDepth: 4,
  /** Minimum row height (52: easy to hit). */
  rowMinHeight: 52,
  /** Minimum tap target (width and height) for anything tappable. */
  hitTarget: 44,
  /** Height of a toolbar's buttons, excluding the safe-area inset. */
  toolbarHeight: 56,
  /** Max content width, so split-screen and large phones stay readable. */
  maxContentWidth: 640,
} as const;

/** Shape tokens: square-ish terminal look. */
export const shape = {
  radius: 2,
  /** 1 pt borders and dividers (deliberately off the 4 pt grid). */
  hairline: 1,
  /** Strikethrough line thickness (a paid bill). */
  strike: 1.5,
  /**
   * Letter spacing for the `[ ]` / `[x]` checkbox: pulls the brackets in,
   * so the box reads as one compact control (user request 2026-10-07).
   */
  checkboxTracking: -4,
  /** Android elevation (shadow depth) of the lifted row while dragging. */
  liftElevation: 6,
  /** A lit bar's thickness (the selected tab's underline). */
  dropIndicator: 2,
} as const;
