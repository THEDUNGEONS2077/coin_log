/**
 * services/haptics.ts: the app's haptic vocabulary (quest_log's, PLAN D31).
 *
 * Layer: services (native side effects). Components call `haptics.check()`
 * and so on, and never expo-haptics directly, so the meaning of each
 * vibration lives in one place and the Settings toggle is respected
 * everywhere.
 *
 *   a bill ticked off, a choice made    light impact
 *   a swipe passes its threshold        selection tick
 *   money logged, a salary loaded       success notification
 *   a line cancelled, an entry deleted  medium impact
 *
 * Haptics are fire-and-forget: they never block the UI, and a failure
 * (an unsupported device, haptics off in system settings) is ignored.
 */
import * as Haptics from 'expo-haptics';

let enabled = true;

/** Follows the "Haptics" setting (wired up in app/_layout.tsx). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Runs a haptic if enabled, swallowing any error. */
function play(run: () => Promise<void>): void {
  if (!enabled) return;
  run().catch(() => {});
}

export const haptics = {
  /** A bill ticked off, a side or chip chosen. */
  check: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A swipe crossed its commit threshold (either way). */
  tick: () => play(() => Haptics.selectionAsync()),
  /** Money logged (a transaction, cash in, a move), a salary loaded. */
  success: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A line cancelled or an entry deleted. */
  delete: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
