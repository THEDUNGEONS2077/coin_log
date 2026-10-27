/**
 * components/common/useOnboarding.ts: "What's new" after an update.
 *
 * Layer: UI glue for the main screen. Waits for the boot screen to go
 * (useBooting), then once per launch:
 *   - after an update: opens "What's new" with the versions since the last
 *     build seen,
 *   - on a fresh install: nothing (the setup screen is the first thing to do),
 * and records this build as seen either way. (quest_log's, without its
 * first-run tips.)
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { appBuild } from '@/services/appInfo';
import { useStoreBundle } from '@/store/react';

import { useBooting } from './BootSequence';

/** Has this launch's What's new check run (once per JS process). */
let checked = false;

/** Runs the What's new check for the main screen, as a component that draws nothing. */
export function Onboarding(): null {
  useOnboarding();
  return null;
}

/** Runs the What's new check (render <Onboarding /> rather than calling it in the screen). */
export function useOnboarding(): void {
  const booting = useBooting();
  const { store } = useStoreBundle();

  useEffect(() => {
    if (booting || checked) return;
    checked = true;
    const s = store.getState();
    const build = appBuild();
    const seen = s.onboarding.lastSeenBuild;
    if (seen === build) return;
    s.markWhatsNewSeen(build);
    // A fresh install with no budget: setup comes first, not release notes.
    const hasData = s.ledger.cycles.length > 0;
    if (seen === null && !hasData) return;
    if (seen === null || seen < build) {
      router.push({ pathname: '/whats-new', params: { since: seen === null ? 'none' : String(seen) } });
    }
  }, [booting, store]);
}
