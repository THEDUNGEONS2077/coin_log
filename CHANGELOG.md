The changes in each coin_log version, newest first. The latest six show in the app (Settings → HELP → What's new).

## 0.2.0 (build 2)

Set up, payday and the BUDGET tab: the budget is real now. Logging money (+ LOG, MOVE, + IN) arrives next.

- **Setup from today.** The first time, enter your savings, your debit balance and credit available right now, and your next pay date. Then add Food and your other lines: each has a monthly amount, and a budget line has what's left of it now; a bill can already be paid. coin_log shows the spare that leaves before you START.
- **Payday.** ⊕ SALARY (or the red "You Got Paid, Load Salary Now" line) loads a salary in three steps: the salary, what went to savings (off the top) and to credit; your actual balances; then RESET every line to its default or EDIT them first. Leftovers from last cycle become spare.
- **The BUDGET tab.** Credit lines, then debit. Budget lines show what's left and what's spent; Food shows how much you can spend per day until payday.
  - **Bills:** tap `[ ]` (or swipe right) to tick one off at what was actually paid. Less goes back to spare; more comes out of spare.
  - **Top up** a budget line from its side's spare (Food has its own `+`).
  - **Add** a line with the `+` next to CREDIT or DEBIT; **tap** a line to edit its name and amount; **swipe left** (or `≡` → Cancel) to cancel it, with UNDO.
- **Never below zero.** Anything that would leave spare or a line short is refused, and the form says what would be short before you confirm.

## 0.1.0 (build 1)

The look: coin_log's shell, built from quest_log, in yellow. The money flows arrive in the next builds.

- **Yellow terminal design.** quest_log's look with yellow in place of green: the lit top panel with drifting scanlines, the boot screen, the `<R>` icon.
- **The main screen's layout.** SPARE CR and SPARE DB at the top, days to payday with ⊕ SALARY, the BUDGET / LOG / SAVINGS tabs, and + LOG, ↔ MOVE and + IN at the bottom. The buttons open pages that say what's coming.
- **Settings.** Boot screen, haptics and reduce motion; backups, imports and daily snapshots; the user guide.
