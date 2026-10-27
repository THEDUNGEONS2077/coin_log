# coin_log architecture

coin_log uses quest_log's architecture (`~/projects/quest_log/ARCHITECTURE.md`), adapted to a budget instead of a task tree. This file covers what a contributor needs; PLAN.md is the behaviour spec.

## 1. Layers and import rules

| From ↓ may import → | theme | lib | store | services | components | app |
|---|---|---|---|---|---|---|
| `app/` (screens) | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| `components/` | ✓ | ✓ | ✓ (hooks, actions) | haptics only | ✓ | ✗ |
| `store/` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `services/` | ✗ | ✓ | ✓ (types, errors) | ✓ | ✗ | ✗ |
| `lib/` | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `theme/` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Hard rules:
1. **`lib/` is pure.** No React, React Native, Expo or I/O, and no `Date.now()`. Time and new IDs are passed in (`Ids` in lib/ledger.ts).
2. **Components hold no business logic.** Every money rule lives in `lib/ledger.ts`; screens collect input, call a store action, and show its answer.
3. **`Platform.OS` branches** only in `services/`, `theme/platform.ts`, or `.web.ts` twin files.
4. **No magic numbers or colors in components.** Everything comes from `theme/`; `__tests__/theme.test.ts` scans `app/` and `components/` for literal colors and durations.
5. **No network.** Release builds block INTERNET (app.config.ts).
6. **Money is whole rand** (integers). Parsing and display go through `lib/money.ts`.

## 2. Folder layout
- `app/`: Expo Router screens: the main screen (`index.tsx`), Settings, Help, What's new, and one page per flow (setup, load salary, log a transaction, …).
- `components/`: `common/` (chrome, top panel, tabs, bottom bar), `overlays/` (sheets, toast), `list/` (swipeable rows), and one folder per tab as they're built.
- `lib/`: `types.ts` (the data model), `ledger.ts` (derived state and one builder per flow), `money.ts`, `payday.ts`, `dates.ts`, `backup.ts`, `changelog.ts`.
- `store/`: the Zustand store (`createStore.ts`), React bindings (`react.tsx`), persistence (`persist.ts`, `kv.ts`, `mmkv*.ts`), migrations, backups, settings, UI state, undo history.
- `services/`: native boundaries: haptics, backup files, date pickers, app info.
- `theme/`: colors, type, spacing, motion, glyphs, effects (all quest_log's, in yellow).

## 3. Data flow
1. A screen collects the user's input (amounts as text, parsed by `parseRand`).
2. It calls a store action, for example `logSpend(input)`.
3. The action runs the pure builder from `lib/ledger.ts`, which returns the next ledger, or a message saying why not (D3: nothing may go below zero).
4. On success, `commit` records `{ before, after }` in the undo history and shows the toast (`LOGGED · UNDO`). On refusal, the message goes back to the screen, which shows it on its error line, and nothing changes.
5. Every number on screen is derived from the ledger by `computeCycle` and `savingsTotal`, cached per ledger object (`useBudget` in store/react.tsx). Nothing derived is stored.

Undo puts the `before` ledger back. Ledgers are immutable, so history entries hold references, not copies.

## 4. Persistence
- **Keys:** `ledger.v1` (the whole budget as one JSON document), `settings.v1`, `ui.v1`, `onboarding.v1`, `snapshot.YYYY-MM-DD` (daily copies, newest 3), `snapshot.premigration.vN`, `corrupt.<ts>`.
- **Startup is synchronous:** read → pre-migration copy → migrate → validate. Unreadable data is kept under `corrupt.*`, and the newest good snapshot is loaded instead. Data from a newer app version is never written over.
- **Saving:** one throttled writer per key (300 ms, trailing), all flushed when the app leaves the foreground.
- **Schema changes:** a migration in `store/migrations`, a bump of `SCHEMA_VERSION`, and a fixture test (`__tests__/fixtures/ledger-vN.json`).

## 5. Checklist for adding a flow
1. Write its logic tree in PLAN.md §3 first (asked, not guessed).
2. Add the builder to `lib/ledger.ts`, returning `Result`, and validate through `commit`.
3. Test the happy path and every refusal in `__tests__/lib/ledger.test.ts`.
4. Add the store action (one line through `commit`, with its toast).
5. Build the screen: input, the action's message on an error line, the toast on success.
6. Add its line to `app/help.tsx` and its entry to CHANGELOG.md.
7. `npm run check` before committing.
