/**
 * theme/colors.ts: the coin_log color tokens.
 *
 * Layer: theme. Every color in the app comes from here; components never
 * use hex literals. The palette is quest_log's, moved from green to yellow
 * (PLAN Context): one hue on pure black, each token in the same role and at
 * about the same brightness as its green original.
 *
 * One deliberate exception (PLAN D24): `alert`, a red used only for the
 * "You Got Paid, Load Salary Now" line, at the user's request.
 *
 * Contrast: every *text* token is ≥ 4.5:1 (WCAG AA) on every background
 * token (bg, surface, surfaceRaised). This is enforced by
 * __tests__/theme.test.ts.
 */

/** Background tokens: surfaces that text is drawn on. */
const backgrounds = {
  /** App background. */
  bg: '#000000',
  /** Pressed rows, inputs, selected tab. */
  surface: '#0D0B05',
  /** Sheets, toast, bottom bar, the swipe track. */
  surfaceRaised: '#16130A',
} as const;

/** Non-text decoration: dividers, idle borders, meter fills. */
const decoration = {
  line: '#2E2712',
  /** A meter's fill behind its text: accent at 16% over black, as a solid color. */
  xpWash: '#292202',
  /** A lit frame: accent at about 35% over black, as a solid color (frames that light while pressed). */
  lineLit: '#594B04',
} as const;

/** Text and icon tokens, dimmest to brightest. */
const text = {
  /** Done bills, metadata, placeholders, hints. 5.4:1 on black (green's was 5.2). */
  textDim: '#97801E',
  /** Body text, icons. 7.8:1 on black (green's was 7.6). */
  text: '#B89B26',
  /** Focus, caret, active controls, the spare totals, primary buttons. */
  accent: '#FFD60A',
  /** Headings, line names, active tab, toast text. */
  textBright: '#FFF0B0',
  /**
   * The payday line only (PLAN D24: "a subtle line on top that is red").
   * The one color outside the yellow hue; never used for anything else.
   */
  alert: '#FF4D4D',
} as const;

/** All color tokens, flat, for `colors.text`-style access. */
export const colors = { ...backgrounds, ...decoration, ...text } as const;

/** Names of tokens that render text; used by the contrast test. */
export const textTokens = Object.keys(text) as (keyof typeof text)[];
/** Names of tokens that text renders on; used by the contrast test. */
export const backgroundTokens = Object.keys(backgrounds) as (keyof typeof backgrounds)[];

export type ColorToken = keyof typeof colors;

/**
 * The only allowed effect: a soft yellow focus glow, used on the focused
 * field and lit frames. Values are spread into a style object.
 */
export const focusGlow = {
  shadowColor: colors.accent,
  shadowOpacity: 0.35,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 0 },
} as const;

/**
 * The same glow as CSS box-shadows, which Android draws too (the shadow*
 * props above are iOS-only). `inset` glows inside a list row, where the
 * neighboring rows can't cover it; `outset` is for floating views.
 * rgba(255, 214, 10) is `accent`.
 */
export const glowShadow = {
  inset: 'inset 0 0 6px 0 rgba(255, 214, 10, 0.35)',
  outset: '0 0 6px 0 rgba(255, 214, 10, 0.35)',
  /** Fainter and wider, for frames that stay lit: the selected tab, a focused field. */
  faint: '0 0 8px 0 rgba(255, 214, 10, 0.22)',
  /** Stronger, for marks too thin for the soft glow to show. */
  bright: '0 0 6px 0 rgba(255, 214, 10, 0.6)',
  /** A lit 2 pt left edge, drawn inside (no layout change): a pressed option in a sheet or settings. */
  edge: 'inset 2px 0 0 0 #FFD60A',
} as const;

/** The same glow on text, for floating labels. Spread into a text style. */
export const glowText = {
  textShadowColor: 'rgba(255, 214, 10, 0.6)',
  textShadowRadius: 6,
} as const;

/**
 * A softer text glow for accent text in the app's chrome (the title, the
 * prompt, UNDO, the spare totals): the accent reads as lit, like a
 * terminal's phosphor. Not used inside list rows, which stay calm.
 */
export const glowTextSoft = {
  textShadowColor: 'rgba(255, 214, 10, 0.35)',
  textShadowRadius: 6,
} as const;
