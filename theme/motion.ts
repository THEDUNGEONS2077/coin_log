/**
 * theme/motion.ts: animation tokens: durations, the easing curves,
 * specific timings and distances.
 *
 * Layer: theme. Every animation takes its numbers from here, so similar
 * moves match across the app (quest_log's motion system, trimmed to what
 * coin_log animates). When Reduce Motion is on, animations end at once
 * (components/common/motion.tsx).
 */
import { Easing } from 'react-native-reanimated';

/** Standard durations in milliseconds. */
export const duration = {
  /** Small state changes: a pressed light, a swipe springing back. */
  fast: 120,
  /** Default: the toast, a sheet rising. */
  base: 200,
  /** Larger transitions: a meter filling. */
  slow: 320,
} as const;

/** Specific timings. */
export const timing = {
  /** Block cursor `█` on/off interval. */
  cursorBlink: 530,
  /** Boot sequence fade-out. */
  bootFade: 160,
  /** The boot screen's refresh band passing down the screen, once, while the lines type. */
  bootSweep: 900,
  /** The top panel's scanlines drifting down one line-pitch (3 pt), over and over. */
  scanDrift: 1800,
  /** The top panel's refresh band passing down, then resting out of sight: every 7 s. */
  scanBandPass: 2800,
  scanBandRest: 4200,
  /** Undo toast visible time. */
  toastHold: 5000,
  /**
   * A finger resting on a list row this long lights the row (Android's tap
   * timeout): quicker, and every scroll would flash the row it starts on.
   */
  pressDelay: 100,
  /** After a swipe starts or ends, a tap on the same row is ignored this long (it's the swipe's own release). */
  swipeTapGuard: 400,
  /** How long a floating label stays fully visible (between a fast fade-in and a slow fade-out). */
  floatHold: 450,
} as const;

/** How far things travel (pt). */
export const distance = {
  /** A small arrival: the toast rising into place, a floating label. */
  nudge: 16,
  /** A bottom sheet rising into place. */
  sheet: 72,
} as const;

/** The easing curve for everything that arrives, changes or settles. */
export const easing = Easing.out(Easing.cubic);

/** The curve for things leaving (the toast going): slow to start, then away, the mirror of `easing`. */
export const easingExit = Easing.in(Easing.cubic);

/**
 * Constant speed, for the scan effects only (the boot screen's refresh
 * band): a CRT's beam doesn't ease.
 */
export const easingScan = Easing.linear;

/**
 * The top panel's scanline drift, in `steps` even jumps per line-pitch (about
 * one pixel each, made by Phosphor from the screen's density). The panel is
 * then redrawn a few times a second rather than every frame (battery), and
 * jumps that small, that slowly, read as a smooth crawl.
 */
export const easingScanSteps = (steps: number) => Easing.steps(steps, false);
