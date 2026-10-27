/**
 * store/onboarding.ts: the "What's new" marker.
 *
 * Layer: store. Persisted as `onboarding.v1`. loadJSON fills in defaults
 * for missing fields, so adding a field needs no migration. (quest_log also
 * kept first-run tips here; coin_log's first run is its setup screen, F0.)
 */

export interface Onboarding {
  /**
   * The app build whose "What's new" was last shown (or skipped as a fresh
   * install). null: never recorded (a fresh install).
   */
  lastSeenBuild: number | null;
}

export const DEFAULT_ONBOARDING: Onboarding = { lastSeenBuild: null };
