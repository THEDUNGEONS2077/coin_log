# coin_log: notes for Claude Code

coin_log is an offline Android budgeting app (Expo SDK 57). It's built from quest_log (`~/projects/quest_log`): the same design system, architecture, toolchain and release pipeline, with yellow in place of green.

Read these first:
- **`PLAN.md`** is the product spec. Decisions D1–D31, flows F0–F14, the data model and the build phases (§6). Work phase by phase and commit at the end of each phase.
- **`ARCHITECTURE.md`** covers layers, import rules, data flows, and the checklist for adding a feature.
- **quest_log's `DESIGN.md`** (`~/projects/quest_log/DESIGN.md`) is the design system. coin_log follows it, swapping green for the yellow tokens in `theme/colors.ts`.

## Rules
- **Spec first.** Every behaviour is specified in PLAN.md before it's built. Behaviour the spec doesn't cover is asked about, not guessed. Small details settled while building go in PLAN.md §8, marked [P].
- **Comments are required.** Every file gets a header comment (purpose and layer). Every exported function, component, hook, store action, and config plugin gets a doc comment covering what it does, its inputs and outputs, and its side effects. Non-obvious logic and each shell-script step get a short comment explaining *why*. Explain intent, not syntax.
- **TypeScript** is `strict` with no `any`. At a library boundary, use an eslint-disable comment with a reason.
- **Money is whole rand,** stored as integers (D28). Never use floats for amounts.
- **No network code, no analytics, no Expo cloud services** (EAS Build, EAS Update). Everything builds locally. This overrides AGENTS.md's EAS guidance.
- **`android/` and `ios/` are generated.** Never edit them; use config plugins in `/plugins`.
- **New dependencies** need a one-line justification in the commit message. Install with `npx expo install`.
- **User data is real.** Every schema change needs a migration plus a fixture test.
- **Expo APIs change every SDK.** Check the versioned docs (`https://docs.expo.dev/versions/v57.0.0/…`, append `.md`) instead of relying on memory.

## Commands
```bash
npm run check            # typecheck + lint + jest (must pass before every commit)
npm start                # Metro for the dev build (APP_VARIANT=dev)
npm run android:release  # clean prebuild + signed release APK
scripts/release-android.sh --publish   # build, verify and publish a GitHub release (RELEASING.md)
npm run web:export && npm run web:test # local web harness: the same screens in headless Chromium
```

## Environment
- WSL Ubuntu 24.04 with Node (nvm) and JDK 17. The Android SDK is in `~/Android/Sdk`.
- The user tests builds by downloading the APK from GitHub Releases (`https://github.com/THEDUNGEONS2077/coin_log/releases/latest`), not over USB.
