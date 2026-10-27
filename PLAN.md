<!--
PLAN.md: the coin_log product spec, accepted by the user on 2026-10-27.
It's the source of truth for behaviour: every flow (F0–F14) is specified
here before it's built. Behaviour not covered here gets asked, not guessed.
§8 records implementation details settled while building (marked [P]).
-->
# coin_log: full spec and build plan

## Context
coin_log is an offline Android budgeting app based on the concept in `C:\Users\57298327\Downloads\coin_log.md`. It's a refactor of **quest_log** (`~/projects/quest_log`) with the same experience, design system and architecture, with yellow in place of green. The user's rule is that every flow and logic tree is settled before any code is written.
- Every **D#** below was decided by the user in the planning Q&A.
- Items marked **[P]** are small details I proposed to complete a flow. They stand unless the user objects at plan review.

---

## 1. Decisions (from the Q&A)
| # | Decision |
|---|---|
| D1 | Salary load: salary received → savings comes off the top → type the credit amount → debit = the remainder, shown live |
| D2 | Credit pool = allocated available credit. No card limit or debt tracking |
| D3 | Nothing may go below zero: spare, a line's remaining amount, or savings. Blocked, never warned |
| D4 | Envelope model: spare = side balance − Σ remaining of that side's open lines. One transaction can be split across sources on one side |
| D5 | Lines have no due dates |
| D9 | One transaction draws from one side only (credit OR debit) |
| D10 | Split: type the total, assign a part to each source. LOG enables only when the parts add up exactly; each source is capped at what it has; default source = spare, full amount |
| D11/D29 | Category chips are labels only, separate from sources. Spend chips and income chips both start empty. A custom spend label becomes a chip after its first use. Chips are editable in Settings |
| D12 | Two kinds of line. **BILL**: a static amount (a debit order), settled only in full by tick-off. **BUDGET**: drawn down by transactions, can be topped up |
| D7 | Tick-off always opens a confirm box pre-filled with the bill amount. Paid less → the leftover goes to spare; paid more → the excess comes out of spare (blocked if spare is short) |
| D13 | A budget top-up comes from the same side's spare only. Money enters debit via income (debit top-up) or savings → debit. It enters credit via debit → credit or savings → credit |
| D14/D25 | "Bulk" is the split transaction. Sources = BUDGET lines + spare only (bills only via tick-off) |
| D15 | Everything is logged after the fact (the card tap already happened) |
| D16/D18 | Salary load asks for the actual debit balance and the actual credit available |
| D17 | Savings in: the amount at salary load, plus debit → savings at any time. Savings out: savings → debit or credit |
| D19 | No REPEAT toggle. Last cycle's lines are the template. Salary load offers RESET (all lines back to their defaults) or EDIT (adjust, remove or add) |
| D20 | The salary load records the received date plus the next pay date. Days left shows in the top panel |
| D21 | LOG tab: a purely chronological list of every entry, newest on top |
| D22 | Tabs: BUDGET / LOG / SAVINGS. The top panel shows spare credit, spare debit and days to payday |
| D23 | Exactly one **Food** line, always a credit BUDGET line, never removable (it can be R0). It always shows R/day left until payday and has a quick TOP UP |
| D24 | On or after the pay date, a subtle red line at the top reads **"You Got Paid, Load Salary Now"**. No prompt, no notification. Red is a deliberate exception to the one-hue rule |
| D26 | Swipe left deletes (the money returns to its sources) with a 5 s UNDO. Tap edits. Any edit or delete that would push a source below zero is blocked |
| D27 | Editing a line's name or amount, or cancelling it, also changes the template. A cancelled line leaves the template |
| D28 | Whole rand only, stored as integers, shown as `R1 234` |
| D30 | Every entry in the current cycle can be edited or deleted, except a salary load (UNDO toast only). Deleting a tick-off reopens the bill. Past cycles are read-only |
| D31 | Kept: boot sequence, backup/import with snapshots, Help, What's new, haptics. Dropped: Trash, notifications, Markdown sync, search, quick actions, XP |
| — | Salary-load math: **spare debit = actual debit − Σ debit lines; spare credit = actual credit − Σ credit lines (incl. Food); savings += savings amount.** CONFIRM is blocked while either spare is below zero. First run = a mid-cycle START (F0): savings on hand, the actual balances, next pay date, and lines with monthly and left-now amounts. No salary needed. Public repo THEDUNGEONS2077/coin_log, app ID `com.thedungeons2077.coinlog` (`.dev`, `.e2e`) |

---

## 2. Data model (`lib/types.ts`)
```ts
type Rand = number;                         // whole rand, integer ≥ 0
type Side = 'credit' | 'debit';

interface Line {                             // a budget line or a bill within a cycle
  id; side: Side; kind: 'bill' | 'budget'; name: string;
  isFood: boolean;                           // exactly one, side='credit', kind='budget'
  amount: Rand;                              // bill: the bill amount. budget: the allocation (base + top-ups)
  base: Rand;                                // the template default (D27 keeps it equal to the last edited amount)
  order: number;                             // display order within its side
}

type Entry =                                 // the log. Every money movement in a cycle
  | { type:'start';   at; actualDebit; actualCredit; savingsOnHand; payDate }   // first run, mid-cycle (F0)
  | { type:'salary';  at; salary; savings; credit; debitShare; actualDebit; actualCredit; payDate }
  | { type:'spend';   at; side; total; label; parts: { source: LineId | 'spare'; amount }[] }
  | { type:'tick';    at; lineId; paid }         // bill paid
  | { type:'cancel';  at; lineId; name; side; released }  // line cancelled (removed); records what was released
  | { type:'topup';   at; lineId; amount }       // budget top-up from same-side spare
  | { type:'income';  at; amount; label }        // debit top-up
  | { type:'xfer';    at; from:'debit'|'savings'; to: Side|'savings'; amount }  // debit→credit, debit→savings, savings→debit/credit
  | { type:'adjust';  at; delta; setTo };     // savings SET BALANCE correction (F14); delta may be ±
  // each entry also has: id, createdAt

interface Cycle { id; startAt; payDate; lines: Line[]; entries: Entry[]; closedAt: number|null; }
interface Ledger { schemaVersion; cycles: Cycle[] /* last = current */; savingsOpening: Rand; chips: { spend: string[]; income: string[] }; }
```

**Derived state** comes from one pure function, `computeCycle(cycle, savingsBefore) → Balances`, which replays the entries:
- `credit`/`debit` balance: the salary load's `actualCredit`/`actualDebit`, ± every movement.
- Per line:
  - budget: `remaining = amount − Σ spend parts on it`;
  - bill: `open = no tick` → reserved = `amount`, otherwise 0.
- `spare[side] = balance[side] − Σ reserved/remaining of that side's lines`.
- `savings = savingsBefore (or start.savingsOnHand) + salary.savings + Σ xfer to savings − Σ xfer from savings + Σ adjust.delta`.

**Validity rule (D3):** a state is valid when every `spare ≥ 0`, every budget `remaining ≥ 0` and `savings ≥ 0`. Each mutation is applied to a candidate ledger and validated; if it's invalid, it's refused with a message naming the source that would go short. Sums don't depend on order, so checking the final state is enough.

**Effect of each entry on the balances:**

| Entry | Effect |
|---|---|
| spend | Side balance −total. Each part reduces its line's remaining or spare |
| tick | Side balance −paid. The bill stops reserving. Net spare change = amount − paid |
| cancel | The line stops reserving. Spare + released |
| topup | Line amount + x. Spare −x |
| income | Debit + x |
| xfer | Moves x between debit, credit and savings |

---

## 3. Flows (logic trees)

### F0 First run: start now, mid-cycle (`app/setup.tsx`)
When the app opens with no ledger, it shows boot (if enabled), then **SETUP**. SETUP is built to start on any day, without a salary having just arrived.

1. **Where you are now:**
   - SAVINGS ON HAND: required, can be R0. It sets the opening savings balance.
   - ACTUAL DEBIT BALANCE and ACTUAL CREDIT AVAILABLE: the balances right now.
   - NEXT PAY DATE: must be after today.
2. **Lines:** the list starts with Food only, and lines can be added. Each line has:
   - NAME, KIND, SIDE;
   - MONTHLY AMOUNT: the full-cycle default, which becomes the template `base` that RESET uses on the first real salary load;
   - for a budget line, LEFT NOW (defaults to the monthly amount; can't be more than it). This cycle's `amount` = LEFT NOW;
   - for a bill, ALREADY PAID THIS CYCLE? (default no). A paid bill is created as closed and reserves nothing.
3. **Live preview:**
   - spare debit = actual debit − Σ open debit lines' left amounts;
   - spare credit = actual credit − Σ open credit lines' left amounts;
   - START is blocked while either preview is below zero.
4. **START:**
   - creates the first cycle `{startAt: today, payDate, lines}` with a single `start` entry (the actual balances, savings on hand and pay date);
   - the first salary load (F1) later closes this cycle normally;
   - the `start` entry, like `salary`, can't be deleted or edited, only undone from its toast;
   - to change the starting figures later, use backup/replace or delete all data in Settings [P].

### F1 Load salary (`app/load-salary.tsx`, a full page with steps)
Entry points:
- top panel ⊕ LOAD SALARY: always available, also before the pay date (early pay) [P];
- the red payday line (tap);
- the first run.

1. **Amounts.**
   - Fields: DATE RECEIVED (default today), SALARY.
   - SAVINGS (default 0). If > salary → error "More than salary".
   - CREDIT (default = last cycle's credit amount [P]). Debit share = salary − savings − credit, shown live. If < 0 → NEXT is blocked.
   - NEXT PAY DATE: a date picker, which must be after DATE RECEIVED.
2. **Actual balances.** ACTUAL DEBIT BALANCE (the debit account's total now) and ACTUAL CREDIT AVAILABLE. Each shows "expected ≥ R{share}" as a hint only.
3. **Lines.**
   - **[ RESET ]**: copies every template line with `amount = base`. A budget's spent amount starts at 0, and bills open.
   - **[ EDIT ]**: the same list, editable. Rename, change the amount, change kind or side, remove or add. Food can't be removed or moved off credit.
   - Live preview: spare credit = actualCredit − Σ credit lines, and spare debit likewise. If either is < 0, CONFIRM is disabled and the short side is named.
4. **CONFIRM**:
   - closes the current cycle (`closedAt = now`), which becomes read-only;
   - creates the new cycle `{startAt: dateReceived, payDate, lines}`, whose first entry is the `salary` entry;
   - savings += savings;
   - edited lines' `base` = their amounts (D27);
   - toast `SALARY LOADED · UNDO`. Undo restores the whole previous ledger; this is the only way to reverse a salary load (D30).

Back or ✕ at any step discards and leaves everything unchanged.

### F2 Log a transaction / split / bulk (bottom bar **[ + LOG ]** → `SpendSheet`)
1. **SIDE**: [CREDIT] [DEBIT]. The default is the last side used [P].
2. **AMOUNT**: the total, numeric keypad, must be > 0.
3. **LABEL**:
   - spend chips (tap one) or custom text;
   - one of the two is required; if both are blank → "Add a label";
   - if the label is custom and not already a chip, it's added as a chip after LOG (D29).
4. **FROM** (the sources): that side's BUDGET lines plus SPARE, each showing what it has left.
   - Starts as SPARE = total.
   - Tapping a line adds it with an editable amount, prefilled with min(unassigned, line remaining) [P].
   - Each part is capped at its source's left amount.
   - The footer shows `ASSIGNED R x / R total`.
5. **[ LOG ]** is enabled only when Σ parts = total and every part ≤ its source → append `spend`, haptic, toast `LOGGED · UNDO`.

The Food line is listed first on credit.

### F3 Tick off a bill (BUDGET tab: tap `[ ]` on a bill, or swipe right)
- A confirm box shows PAID, prefilled with the bill amount (D7).
  - paid < amount → the difference returns to spare;
  - paid > amount → the excess comes from spare, blocked if spare < paid − amount ("Spare debit short by R x").
- CONFIRM → append `tick`. The row shows `[x]`, dimmed, in place until the next cycle [P]. Toast `PAID · UNDO`.
- Tapping `[x]` on a paid bill does nothing [P]; to reopen it, delete its tick entry in LOG (D30).

### F4 Cancel a line (swipe left on an open line, or the row menu → CANCEL)
- Food: CANCEL isn't offered.
- A paid bill: CANCEL isn't offered [P].
- Otherwise append `cancel` and remove the line from the cycle and the template (D27). Released = the bill amount, or the budget's remaining; it goes to spare. Toast `CANCELLED · UNDO`.
- Budget spend parts already logged against it stay, as history [P].

### F5 Edit a line (tap the row name → `LineSheet`)
- **Fields:** NAME and AMOUNT. KIND and SIDE can only be changed for lines with no entries yet [P]. Food: AMOUNT only.
- **Bill:** a new amount is allowed while open. An increase is blocked if spare is short; a decrease releases to spare.
- **Budget:** the new amount must be ≥ spent. An increase is blocked if spare is short.
- **Saving:** sets `amount` and `base` (D27). Not a log entry [P].

### F6 Add a line (BUDGET tab, a `+` on each side heading)
- `LineSheet` empty: NAME, AMOUNT, KIND (BILL/BUDGET), SIDE (preset from the heading).
- The amount is reserved from that side's spare, blocked if short. It joins the template.

### F7 Top up a budget line (row menu → TOP UP; Food shows an inline **[ + ]** for one-tap access, D23)
- Amount → append `topup`, taken from the same side's spare (D13), blocked if short. It changes this cycle only and doesn't change `base` [P].

### F8 Move money (bottom bar **[ ⇄ MOVE ]** → `MoveSheet`)
Pick a route:
- DEBIT → CREDIT
- DEBIT → SAVINGS
- SAVINGS → DEBIT
- SAVINGS → CREDIT

Then an amount. It's blocked if the source's spare (or savings) is short. Append `xfer`, toast `MOVED · UNDO`.

### F9 Debit top-up / extra cash in (bottom bar **[ + IN ]** → `IncomeSheet`)
- Amount, plus an income chip or custom text (required) → append `income`. Debit spare goes up.
- A custom income label also becomes a chip after its first use [P, mirrors D29].

### F10 Edit or delete a log entry (LOG tab; current cycle only)
- **Swipe left = delete.**
  - Allowed for every entry type except `salary`.
  - The money returns. A delete that leaves something negative is refused. Examples: deleting an income that was already spent, or deleting a `cancel` (which restores the line) when spare can no longer cover it.
  - Toast `DELETED · UNDO`.
- **Tap = edit.** The entry's own sheet reopens prefilled (spend → SpendSheet, tick → confirm box, …). Saving replaces the entry, so it is still validated.
  - Deleting a tick reopens the bill.
  - Editing a `cancel` isn't offered; delete it instead [P].
- **Salary rows** have neither swipe nor edit; their UNDO toast is the only way back.
- **Past cycles** have no swipe and no edit.

### F11 Undo
Every action above is one undo step, using quest_log's history pattern (`store/history.ts`, 100 steps, in memory). The toast's UNDO calls it.

### F12 Payday indicator (D24)
Each minute and when the app comes to the foreground (`useMinute`), if `today ≥ payDate` the top panel shows the red line "You Got Paid, Load Salary Now". Tap → F1.

### F13 Food per day (D23)
- `daysLeft = max(1, days from today (inclusive) to payDate (exclusive))`.
- The row shows `R{floor(remaining ÷ daysLeft)}/DAY`.
- On or after the pay date, it shows only the remaining amount.

The top panel shows `{daysLeft} DAYS TO PAYDAY` (`PAYDAY TODAY` / `PAYDAY PASSED` [P]).

---

### F14 Savings SET BALANCE (SAVINGS tab → `[ SET BALANCE ]`)
1. Type the real savings total (≥ 0).
2. Append `adjust {delta = new − current, setTo}` and log it as `ADJUST +R x / −R x`. Toast `SAVINGS SET · UNDO`.
3. Like any non-salary entry, it can be edited or deleted in the current cycle (F10). Editing it changes the delta.
4. A delete or edit that would make savings negative is blocked.

## 4. Screens
- **Top panel** (`Phosphor` + `LitEdge`, as on quest_log):
  - title `coin_log`, plus ⊛ settings;
  - the red payday line (when due);
  - `SPARE CR R x` and `SPARE DB R x` in large type;
  - `{n} DAYS TO PAYDAY`;
  - Tabs `[BUDGET] [LOG] [SAVINGS]`.
- **BUDGET:**
  - **CREDIT** heading `+`: Food first, then the lines in order. Budget rows: `NAME  R left / R amount`, plus a meter (quest_log's `QuestMeter`, showing spent). Bill rows: `[ ] NAME  R amount`.
  - **DEBIT** heading `+`: the same layout.
  - Swipe right = tick off (bills); swipe left = cancel.
- **LOG:** compact rows, newest first, for the current cycle. Each row: `date · glyph · label · −R/+R · side`. Past cycles sit below a `CYCLE dd mmm – dd mmm` divider, read-only and collapsed by default [P].
- **SAVINGS:** a large `SAVINGS R x`, `[ → DEBIT ] [ → CREDIT ] [ ← FROM DEBIT ] [ SET BALANCE ]`, then the history of savings entries only (start, salary savings, xfers, adjusts), across all cycles.
- **Bottom bar** (thumb reach): `[ + LOG ] [ ⇄ MOVE ] [ + IN ]`.
- **Pages:**
  - `load-salary`;
  - `settings`: spend chips and income chips (add, rename, remove), haptics, boot sequence, reduce motion, backup save/share/import/snapshots;
  - `help`;
  - `whats-new`.
- **Sheets** (on `SheetModal`): SpendSheet, IncomeSheet, MoveSheet, LineSheet, TickSheet, TopUpSheet.

---

## 5. Architecture: reuse from quest_log
Start from a copy of quest_log's infrastructure in a new repo, `~/projects/coin_log` (fresh history). The layer rules come from quest_log's ARCHITECTURE.md §1 unchanged: `lib/` pure, components hold no logic, injected `now` and `newId`. Every file gets a header and doc comments (CLAUDE.md, plus the user's comment rule).

**Copy and rename** (`questlog`/`QUESTLOG` → `coinlog`/`COINLOG`):
- **Config and build:** `app.config.ts`, `version.json` (0.1.0 / build 1), `plugins/withReleaseSigning.js`.
- **Scripts:** `scripts/{release-android.sh,gen-changelog.mjs,subset-fonts.sh}`.
- **Tooling:** `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `jest.setup.ts`, `jest.global-setup.js`.
- **Docs:** CLAUDE.md, AGENTS.md, RELEASING.md.
- **Stores and persistence:** `store/{kv,mmkv,history,react,persist (throttled writer, loadJSON, snapshots),migrations,backup,settings,onboarding}.ts`.
- **Pure lib:** `lib/{dates,changelog}.ts`, `lib/backup.ts` (format `coin_log-backup`).
- **Services:** `services/{backup,haptics,appInfo,datePicker}.ts`.
- **Theme:** all of `theme/`.
- **Components:**
  - `components/common/{Phosphor,Rule,PageHeader,Prompted,BlockCursor,CrashScreen,keyboard,useMinute,motion,BootSequence,Tabs,Header}`;
  - `components/overlays/{SheetModal,ActionSheet,Toast}`;
  - `components/list/{SwipeableRow,FocusGlow,QuestMeter→Meter,StrikeText,keepInView}`.
- **Settings rows:** the helpers from `app/settings.tsx`.
- **Tests:** `__tests__/{config,theme}.test.ts`.

**New:**
- `lib/types.ts` and `lib/money.ts` (format and parse whole rand).
- `lib/ledger.ts`: `computeCycle`, `validate`, and pure builders, one per flow, each returning the next ledger or an error: `loadSalary`, `logSpend`, `tickBill`, `cancelLine`, `editLine`, `addLine`, `topUp`, `move`, `income`, `deleteEntry`, `editEntry`.
- `lib/payday.ts` (days left, per day).
- `store/createStore.ts` actions wrapping those builders. Undo stores the previous ledger, since the documents are small; that replaces quest_log's op inverses.
- Persistence keys `ledger.v1`, `settings.v1`, `ui.v1`, `onboarding.v1` (one JSON doc, no buckets).
- The screens and sheets in §4.

**Yellow theme** (`theme/colors.ts`, same token names; values from the UI survey, re-verified by `theme.test.ts`):

| Token | Value |
|---|---|
| bg | `#000000` |
| surface | `#0D0B05` |
| surfaceRaised | `#16130A` |
| line | `#2E2712` |
| lineLit | `#594B04` |
| xpWash | `#292202` |
| textDim | `#9C8420` |
| text | `#B89B26` |
| accent | `#FFD60A` |
| textBright | `#FFF0B0` |

- **New token** `alert: #FF4D4D`, for the D24 line only.
- **Also change:** the rgba literals in `glowShadow`/`glowText` (`theme/colors.ts`), `ACCENT`/`BRIGHT` in `theme/effects.ts`, and `ACCENT` in `app.config.ts`, all to `255,214,10` and `255,240,176`.
- **New yellow icon set.**

---

## 6. Build phases (each ends with `npm run check` green and a GitHub release for phone testing)
1. **Scaffold:** a new repo, the copied infrastructure, renames, the yellow theme, a new keystore (`~/.coin_log/release.keystore`, `COINLOG_*` Gradle properties), an empty three-tab shell. Release 0.1.0.
2. **Domain:** `lib/types`, `money`, `ledger`, `payday`, with exhaustive unit tests for every flow's tree, including each "blocked" branch and the delete/undo round-trips.
3. **Store and persistence:** load, save, migrations scaffold, backup format. Store tests.
4. **F0/F1:** setup and load salary. Release.
5. **BUDGET tab:** F3–F7, Food per day, the payday line. Release.
6. **F2/F8/F9 sheets** and the bottom bar. Release.
7. **LOG and SAVINGS tabs:** F10 edit and delete. Release.
8. **Settings, chips, backup, Help, What's new, boot.** Release 1.0.0.

## 7. Verification
- **Unit tests:** in `__tests__/lib/ledger.test.ts`, for every flow:
  - the happy path;
  - each block condition (spare short, remaining < spent, savings short, parts ≠ total);
  - the delete or edit inverse;
  - the salary-load math, using the worked example: credit 3000 = food 1800, water 200, toilet paper 250, toiletries 250, spare 500. Then a restaurant bill of R200 = food 100 + spare 100 → food 1700 left, spare 400.
- **Other automated checks:** store tests with the memory KV, `theme.test.ts` contrast for the yellow palette and the alert colour, `config.test.ts` for the app IDs.
- **Web harness:** an `expo export -p web` run plus a Playwright smoke test of F1 → F2 → F3 → F10 (it's a local harness only, never deployed).
- **On the phone:** each phase's APK goes out as a GitHub release (`scripts/release-android.sh`), and the user tests it by eye.

## 8. Implementation notes (settled while building; [P] = proposed, open to change)
- **Money forms are full pages, not bottom sheets [P].** Every flow that types an amount (F0, F1, F2, F3, F5–F9, F14) opens its own page. quest_log's history showed Android keyboards inside modal sheets losing track of the keyboard, so text fields stay out of modals. Choices without typing (a line's menu, confirmations) still use sheets.
- **Top-ups are entries [P].** A budget line stores its amount before top-ups. What the row shows is that plus its top-ups. Editing the shown amount (F5) sets the template default to it, and the stored amount to it minus the top-ups. Deleting a top-up (F10) takes it back off the line.
- **Bills paid before setup [P].** F0's ALREADY PAID is recorded as a tick of R0, marked "paid before setup", so nothing is deducted twice. It can't be edited; deleting it reopens the bill.
- **A tick may be R0 [P]**: the bill wasn't charged this cycle but stays for the next (CANCEL removes it from the template instead).
- **A new line may be R0 [P]** (a budget to top up later).
- **Salary and start entries [P]** are timestamped when logged; the cycle keeps the DATE RECEIVED as its start. DATE RECEIVED can't be in the future. F10's "except salary" covers the start entry too.
- **Labels and names [P]**: up to 40 characters, with extra spaces trimmed. A label matches an existing chip regardless of case, so it isn't added twice.
- **A spend part on a line cancelled later [P]** counts as spare when that transaction is edited (numerically it already is: the cancelled line no longer holds anything back).
- **Editing a SET BALANCE [P]** re-aims it: savings end at the new total, with everything else unchanged.
- **Import is replace only [P]**: merging two budgets has no clear meaning. It's one undo step.
- **Delete all data [P]** (Settings → DATA) asks for confirmation, is one undo step, and returns the app to SETUP.
- **Chip edits in Settings [P]** happen at once. Any toast still up is hidden, so an UNDO never undoes something other than what it names.
- **Load salary prefills [P]:** DATE RECEIVED today (not later than today), SAVINGS R0, CREDIT the last salary's credit amount (empty before the first one), NEXT PAY DATE a month after the date received. Every prefill can be changed.
- **The BUDGET tab [P]:** each line has a `≡` button for its menu (TOP UP, PAY, EDIT, CANCEL, as the line allows); holding the row opens the same menu. Food's `[+]` opens its top-up. Every gesture is also a screen-reader action.
- **Forms preview their outcome [P]** by running the same rule the confirm button runs, so a refusal ("SPARE CREDIT WOULD BE SHORT BY R100") shows before confirming.
