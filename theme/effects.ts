/**
 * theme/effects.ts: the phosphor effects, as CSS gradients (aesthetic pass
 * 2026-10-17): the soft light behind the header, its scanlines, and the lit
 * and fading rules that divide the chrome.
 *
 * Layer: theme. They extend the one effect (the soft yellow glow, theme/colors.ts)
 * to the terminal's screen itself: a faint phosphor wash where the title
 * sits, fine static scanlines over the top panel and the boot screen, and
 * dividers that are lit in the middle or fade out like a terminal's rules.
 * Same as quest_log's, in yellow. The gradients are static (the top panel's
 * drift moves the layer, not the gradient) and quiet: lines stay `line` at
 * their ends, and nothing here goes inside list rows (which stay calm).
 *
 * Components apply them with `backgroundStyle(effects.x)` (theme/platform.ts),
 * which maps to React Native's `experimental_backgroundImage` (Android) or
 * CSS `background-image` (the web build). Every token must parse: a test runs
 * each through React Native's own parser (__tests__/theme.test.ts), since a
 * gradient it rejects is silently not drawn.
 */
import { colors } from './colors';

/** The accent (#FFD60A) as RGB, for stops at fixed strengths. */
const ACCENT = '255, 214, 10';
/** textBright (#FFF0B0) as RGB. */
const BRIGHT = '255, 240, 176';

export const effects = {
  /** A soft phosphor light from the top-left corner, behind the title (the desktop masthead's wash). */
  phosphor: `radial-gradient(circle at 0% 0%, rgba(${ACCENT}, 0.1), transparent 70%)`,
  /**
   * Scanlines: one faint line every 3 pt (the tile is `scanlineTile`, repeated).
   * Static: a moving pattern would cost battery for no information.
   */
  scanlines: `linear-gradient(to bottom, rgba(${ACCENT}, 0.05) 0px, rgba(${ACCENT}, 0.05) 1px, transparent 1px, transparent 3px)`,
  /** A hairline lit in the middle and fading at both ends: under the header, above active chrome. */
  litRule: `linear-gradient(to right, transparent, ${colors.line} 15%, rgba(${ACCENT}, 0.35) 50%, ${colors.line} 85%, transparent)`,
  /** A heading's rule: runs on from the heading in `line` and fades out. */
  fadeRule: `linear-gradient(to right, ${colors.line}, transparent)`,
  /** The same, lit: for a heading in accent (the newest version in What's new). */
  fadeRuleLit: `linear-gradient(to right, rgba(${ACCENT}, 0.35), transparent)`,
  /** A gauge's lit cells: deeper yellow at the start, full accent at the leading edge. */
  gauge: `linear-gradient(to right, ${colors.textDim}, ${colors.accent})`,
  /** The list fading out into the background, just above the bottom bar (instead of being cut off). */
  fadeToBg: `linear-gradient(to bottom, transparent, ${colors.bg})`,
  /** A soft bright band, for the boot screen's refresh line. */
  band: `linear-gradient(to bottom, transparent, rgba(${ACCENT}, 0.05) 60%, rgba(${BRIGHT}, 0.07) 70%, transparent)`,
} as const;

/** The scanlines' pitch (pt): one line every this many points. */
export const SCAN_PITCH = 3;

/** The scanline tile: full width, one pitch tall. */
export const scanlineTile = { size: `100% ${SCAN_PITCH}px`, repeat: 'repeat' } as const;
