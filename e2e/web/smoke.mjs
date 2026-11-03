// e2e/web/smoke.mjs: drives coin_log's real screens in headless Chromium
// (PLAN §7 Verification: the web build as a local test harness).
//
// Usage: npm run web:export && npm run web:test
//
// No server and no port: every request to https://coinlog.test is answered
// from web-dist/ on disk (Playwright's request interception). Each flow
// starts from empty storage, walks a flow the way a person would (typing,
// tapping, picking dates), checks what the screen says, and saves a
// screenshot to e2e/web/screenshots/ (gitignored) for a look by eye.
// Nothing is deployed anywhere.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const site = join(root, 'web-dist');
const shots = join(root, 'e2e', 'web', 'screenshots');
// https: crypto.randomUUID (new IDs) only exists in secure contexts; requests never leave the machine.
const ORIGIN = 'https://coinlog.test';
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.json': 'application/json',
};

if (!existsSync(join(site, 'index.html'))) throw new Error('web-dist/ is missing: run `npm run web:export` first');
mkdirSync(shots, { recursive: true });

/** "2026-11-25" for a day `days` from today (local), as date inputs take it. */
function dayFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Fails the run with a message. */
function check(ok, what) {
  if (!ok) throw new Error(`✕ ${what}`);
  console.log(`✓ ${what}`);
}

/** A fresh page on empty storage (boot screen off, so flows start at once), optionally with a saved ledger. */
async function freshPage(browser, ledger = null) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    let file = join(site, decodeURIComponent(url.pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(site, 'index.html');
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' });
  });
  await page.addInitScript(
    (saved) => {
      // Once per test page: empty storage (or the given ledger), boot screen off.
      if (sessionStorage.getItem('fresh')) return;
      localStorage.clear();
      localStorage.setItem('coin_log\\settings.v1', JSON.stringify({ bootSequence: false }));
      if (saved) {
        localStorage.setItem('coin_log\\ledger.v1', saved);
        // A saved budget with no build seen counts as an update and opens What's new: mark every build as seen.
        localStorage.setItem('coin_log\\onboarding.v1', JSON.stringify({ lastSeenBuild: Number.MAX_SAFE_INTEGER }));
      }
      sessionStorage.setItem('fresh', '1');
    },
    ledger && JSON.stringify(ledger),
  );
  await page.goto(`${ORIGIN}/`);
  await page.waitForTimeout(1500);
  return { page, errors };
}

/** Types into the field with this accessibility label. */
async function type(page, label, text) {
  await page.getByLabel(label, { exact: true }).first().fill(text);
}

/** Taps the control with this accessibility label. */
async function tap(page, label) {
  await page.getByLabel(label, { exact: true }).first().click();
  await page.waitForTimeout(400);
}

/** Opens a DateField by its label and picks a day `days` from today. */
async function pickDay(page, labelStart, days) {
  await page
    .getByRole('button', { name: new RegExp(`^${labelStart}:`) })
    .first()
    .click();
  const input = page.locator('input[type=date]');
  await input.fill(dayFromToday(days));
  await page.waitForTimeout(300);
}

/** The visible text of the page. */
const text = (page) => page.locator('body').innerText();

/** F0: the first-run setup, from empty to the main screen. */
async function setUp(page) {
  check((await text(page)).includes('STEP 1/2 · NOW'), 'a fresh install opens on setup');
  await type(page, 'SAVINGS ON HAND', '8000');
  await type(page, 'DEBIT BALANCE NOW', '5000');
  await type(page, 'CREDIT AVAILABLE NOW', '3000');
  await pickDay(page, 'NEXT PAY DATE', 29);
  await tap(page, 'Next: your lines');
  check((await text(page)).includes('STEP 2/2 · LINES'), 'step 1 leads to the lines');

  await type(page, 'Food, monthly amount', '1800');
  await type(page, 'Food, left now', '900');
  await tap(page, 'Add a credit line');
  await type(page, 'NAME', 'Toiletries');
  await type(page, 'Toiletries, monthly amount', '250');
  await tap(page, 'Add a debit line');
  await page.getByLabel('NAME', { exact: true }).last().fill('Rent');
  await page.getByLabel('Bill: a fixed amount, ticked off when paid', { exact: true }).last().click();
  await type(page, 'Rent, monthly amount', '4000');
  await page.screenshot({ path: join(shots, 'setup-lines.png'), fullPage: true });
  // Credit 3000 − Food 900 − Toiletries 250 = 1850; debit 5000 − Rent 4000 = 1000.
  const preview = await text(page);
  check(preview.includes('R1 850') && preview.includes('R1 000'), 'the preview shows the spare setup leaves');
  await tap(page, 'start');
  const main = await text(page);
  check(
    main.includes('SPARE CREDIT') && main.includes('R1 850') && main.includes('STARTED'),
    'START opens the main screen, with STARTED · UNDO',
  );
  await page.screenshot({ path: join(shots, 'main-after-setup.png') });
}

/** F1: a salary load with RESET lines. */
async function loadSalary(page) {
  await tap(page, 'Load salary');
  check((await text(page)).includes('STEP 1/3 · AMOUNTS'), 'SALARY opens the salary load');
  await type(page, 'SALARY', '20000');
  await type(page, 'TO SAVINGS', '3000');
  await type(page, 'TO CREDIT', '3000');
  check((await text(page)).includes('DEBIT GETS R14 000'), 'the debit share follows the amounts');
  await tap(page, 'Next: balances');
  await type(page, 'DEBIT BALANCE NOW', '14500');
  await type(page, 'CREDIT AVAILABLE NOW', '3200');
  await tap(page, 'Next: lines');
  // RESET: Food back to 1800, Toiletries 250 → credit 3200 − 2050 = 1150; debit 14500 − 4000 = 10500.
  const lines = await text(page);
  check(lines.includes('R1 150') && lines.includes('R10 500'), 'RESET previews the spare from the actual balances');
  await page.screenshot({ path: join(shots, 'salary-lines.png'), fullPage: true });
  await tap(page, 'Confirm: load the salary');
  const main = await text(page);
  check(main.includes('SALARY LOADED') && main.includes('R1 150'), 'CONFIRM loads it: SALARY LOADED · UNDO');
  await tap(page, 'Undo');
  check((await text(page)).includes('R1 850'), 'UNDO brings the old cycle back');
}

/** The row for a line on the BUDGET tab (its screen-reader label starts with the name). */
const row = (page, name) => page.getByRole('button', { name: new RegExp(`^${name},`) }).first();

/** F3–F7 on the BUDGET tab, from the setup above: credit 3000 (Food 900 left, Toiletries 250), debit 5000 (Rent 4000). */
async function budgetFlows(page) {
  let main = await text(page);
  check(main.includes('FOOD') && main.includes('TOILETRIES') && main.includes('RENT'), 'the BUDGET tab lists the lines');

  // F3: Rent paid R3 800 instead of R4 000: R200 back to spare debit (1000 → 1200).
  await page.getByText('[ ]', { exact: true }).first().click();
  await page.waitForTimeout(500);
  check((await text(page)).includes('RENT · DEBIT BILL'), 'the bill’s [ ] opens the tick-off');
  await type(page, 'PAID', '3800');
  check((await text(page)).includes('R200 GOES BACK TO SPARE DEBIT'), 'paying less previews the difference going back');
  await tap(page, 'Paid: tick it off');
  main = await text(page);
  check(main.includes('PAID R3\u00A0800') && main.includes('R1\u00A0200'), 'the bill shows as paid and spare debit grows');

  // F7: Food topped up by R100 from spare credit (1850 → 1750).
  await row(page, 'Food').getByText('+', { exact: true }).click();
  await page.waitForTimeout(500);
  await type(page, 'AMOUNT', '100');
  check((await text(page)).includes('FOOD R1\u00A0000 LEFT'), 'the top-up previews Food’s new amount');
  await tap(page, 'Top up');
  check((await text(page)).includes('R1\u00A0750'), 'a top-up comes out of spare credit');

  // F6: a R300 debit bill added (spare debit 1200 → 900).
  await tap(page, 'Add a debit line');
  await type(page, 'NAME', 'Gym');
  await tap(page, 'Bill: a fixed amount, ticked off when paid');
  await type(page, 'BILL AMOUNT', '300');
  await tap(page, 'Add the line');
  main = await text(page);
  check(main.includes('GYM') && main.includes('R900'), 'a new line is set aside from spare');

  // F4: Toiletries cancelled from its menu (spare credit 1750 → 2000), then UNDO.
  await row(page, 'Toiletries').getByText('≡', { exact: true }).click();
  await page.waitForTimeout(500);
  await tap(page, 'Cancel this line');
  main = await text(page);
  check(
    !main.includes('TOILETRIES') && main.includes('R2\u00A0000') && main.includes('CANCELLED'),
    'cancelling returns the line’s money to spare',
  );
  await tap(page, 'Undo');
  check((await text(page)).includes('TOILETRIES'), 'UNDO puts the line back');

  // F5: Food's amount set to R1 200 (with its top-up it was R1 000): spare credit 1750 → 1550.
  await row(page, 'Food').click();
  await page.waitForTimeout(500);
  await type(page, 'AMOUNT THIS CYCLE', '1200');
  await tap(page, 'Save the line');
  main = await text(page);
  check(main.includes('R1\u00A0550'), 'editing a line’s amount changes spare');
  await page.screenshot({ path: join(shots, 'budget-tab.png') });
}

/** Swipes a row left with the mouse (the swipe-to-delete gesture). */
async function swipeLeft(page, locator) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width - 20 - i * 30, y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(800);
}

/** F2, F8, F9 from the bottom bar; then F10 on LOG and F14 on SAVINGS. Credit spare 1550, debit spare 900, savings 8000 to start. */
async function moneyFlows(page) {
  // F2: R200 on credit, split R100 Food + R100 spare (spare credit 1550 → 1450).
  await tap(page, 'Log a transaction');
  await type(page, 'AMOUNT', '200');
  await type(page, 'Label', 'Restaurant');
  await page.getByRole('checkbox', { name: /^From Food,/ }).click();
  await type(page, 'Amount from Food', '100');
  let form = await text(page);
  check(
    form.includes('FOOD R1\u00A0100 LEFT') && form.includes('SPARE CREDIT R1\u00A0450'),
    'a split previews each source after the transaction',
  );
  await page.screenshot({ path: join(shots, 'spend-split.png'), fullPage: true });
  await tap(page, 'Log it');
  check(
    (await text(page)).includes('R1\u00A0450') && (await text(page)).includes('LOGGED'),
    'LOG takes it out of Food and spare: LOGGED · UNDO',
  );

  // F2 again: the typed label is a chip now; on debit there are no budget lines, so it's all spare (900 → 800).
  await tap(page, 'Log a transaction');
  check((await text(page)).includes('RESTAURANT'), 'a typed label became a chip');
  await page.getByRole('radio', { name: 'DEBIT', exact: true }).click();
  await type(page, 'AMOUNT', '100');
  await page.getByRole('radio', { name: 'Restaurant', exact: true }).click();
  await tap(page, 'Log it');
  check((await text(page)).includes('R800'), 'a debit transaction comes out of spare debit');

  // F8: R300 debit → credit (debit 800 → 500, credit 1450 → 1750).
  await tap(page, 'Move money');
  await type(page, 'AMOUNT', '300');
  await tap(page, 'Move it');
  let main = await text(page);
  check(main.includes('R500') && main.includes('R1\u00A0750') && main.includes('MOVED'), 'MOVE shifts spare debit to credit');

  // F9: R500 cash in (debit 500 → 1000).
  await tap(page, 'Log extra cash in');
  await type(page, 'AMOUNT', '500');
  await type(page, 'Label', 'Refund');
  await tap(page, 'Log the cash in');
  check((await text(page)).includes('R1\u00A0000'), 'cash in lands on spare debit');

  // F10 on LOG: change the move to R200 (debit 1000 → 1100, credit 1750 → 1650).
  await tap(page, 'Log of every entry');
  main = await text(page);
  check(
    main.includes('THIS CYCLE') && main.includes('REFUND') && main.includes('DEBIT → CREDIT') && main.includes('START'),
    'LOG lists every entry, newest first',
  );
  await page.screenshot({ path: join(shots, 'log-tab.png') });
  await page
    .getByRole('button', { name: /debit → credit/i })
    .first()
    .click();
  await page.waitForTimeout(500);
  await type(page, 'AMOUNT', '200');
  await tap(page, 'Save');
  main = await text(page);
  check(main.includes('R1\u00A0100') && main.includes('R1\u00A0650') && main.includes('SAVED'), 'changing an entry redoes its money');

  // F10: swipe the cash in away, then UNDO (debit 1100 → 600 → 1100).
  await swipeLeft(page, page.getByRole('button', { name: /refund/i }).first());
  main = await text(page);
  check(
    !main.includes('REFUND') && main.includes('R600') && main.includes('DELETED'),
    'swiping left deletes an entry and its money goes back',
  );
  await tap(page, 'Undo');
  check((await text(page)).includes('REFUND'), 'UNDO brings the entry back');

  // F14 and F8 from SAVINGS: set 8 300, then R1 000 to credit (savings 7 300, credit 1650 → 2650).
  await tap(page, 'Savings');
  check((await text(page)).includes('R8\u00A0000'), 'SAVINGS shows the total from setup');
  await tap(page, 'Set the savings balance');
  await type(page, 'REAL TOTAL', '8300');
  check((await text(page)).includes('+R300 LOGGED'), 'SET BALANCE previews the difference it logs');
  await tap(page, 'Set savings');
  await tap(page, 'Move savings to credit');
  await type(page, 'AMOUNT', '1000');
  await tap(page, 'Move it');
  main = await text(page);
  check(
    main.includes('R7\u00A0300') && main.includes('R2\u00A0650') && main.includes('SAVINGS SET TO R8\u00A0300'),
    'savings moves and corrections show in its history',
  );
  await page.screenshot({ path: join(shots, 'savings-tab.png') });
}

/** F12: from the pay date on, the red line says so and opens the salary load (a saved budget whose payday was yesterday). */
async function paydayLine(browser) {
  const day = 86_400_000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const ledger = {
    schemaVersion: 1,
    cycles: [
      {
        id: 'c1',
        startAt: midnight.getTime() - 30 * day,
        payDate: midnight.getTime() - day,
        closedAt: null,
        lines: [{ id: 'food', side: 'credit', kind: 'budget', name: 'Food', isFood: true, amount: 600, base: 1800 }],
        entries: [{ id: 'e1', at: midnight.getTime() - 30 * day, type: 'start', actualDebit: 1000, actualCredit: 1000, savingsOnHand: 0 }],
      },
    ],
    chips: { spend: [], income: [] },
  };
  const { page, errors } = await freshPage(browser, ledger);
  const main = await text(page);
  check(main.includes('You Got Paid, Load Salary Now') && main.includes('PAYDAY PASSED'), 'after the pay date, the red payday line shows');
  check(!main.includes('/DAY'), 'Food shows no per-day amount once payday is here');
  await page.screenshot({ path: join(shots, 'payday-line.png') });
  await tap(page, 'You Got Paid, Load Salary Now. Opens the salary load.');
  check((await text(page)).includes('STEP 1/3 · AMOUNTS'), 'the payday line opens the salary load');
  check(errors.length === 0, 'no page errors on the payday page');
}

/** D29: chips managed in Settings, then offered when logging. */
async function chipFlows(page) {
  await tap(page, 'Settings');
  await page.getByRole('button', { name: 'Add a label…' }).first().click();
  await page.waitForTimeout(400);
  await type(page, 'LABEL', 'Fuel');
  await tap(page, 'Add the label');
  check((await text(page)).includes('FUEL'), 'a chip added in Settings is listed');
  await page.getByRole('button', { name: 'FUEL', exact: true }).click();
  await page.waitForTimeout(400);
  await type(page, 'LABEL', 'Petrol');
  await tap(page, 'Save the label');
  const settings = await text(page);
  check(settings.includes('PETROL') && !settings.includes('FUEL'), 'a chip can be renamed');
  await tap(page, 'Close settings');
  await tap(page, 'Log a transaction');
  check((await text(page)).includes('PETROL'), 'the chip is offered when logging');
  await tap(page, 'Cancel');
}

/**
 * D32–D37: expected money, from a saved version-1 budget (so the 1 → 2
 * migration runs too): R20 000 debit, Rent R10 000 with Partner R5 000 coming
 * in, Internet R800 with Partner R400. Spare debit 20 000 − 5 400 = R14 600.
 */
async function expectedFlows(browser) {
  const day = 86_400_000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const ledger = {
    schemaVersion: 1,
    cycles: [
      {
        id: 'c1',
        startAt: midnight.getTime() - 5 * day,
        payDate: midnight.getTime() + 20 * day,
        closedAt: null,
        lines: [
          { id: 'food', side: 'credit', kind: 'budget', name: 'Food', isFood: true, amount: 1000, base: 1000 },
          { id: 'rent', side: 'debit', kind: 'bill', name: 'Rent', isFood: false, amount: 10000, base: 10000, expected: { payer: 'Partner', amount: 5000 } },
          { id: 'net', side: 'debit', kind: 'bill', name: 'Internet', isFood: false, amount: 800, base: 800, expected: { payer: 'Partner', amount: 400 } },
        ],
        entries: [{ id: 'e1', at: midnight.getTime() - 5 * day, type: 'start', actualDebit: 20000, actualCredit: 2000, savingsOnHand: 0 }],
      },
    ],
    chips: { spend: [], income: [] },
  };
  const { page, errors } = await freshPage(browser, ledger);
  let main = await text(page);
  check(main.includes('R14\u00A0600') && main.includes('PARTNER R5\u00A0000 DUE'), 'a bill holds back only your share while theirs is due');
  await page.screenshot({ path: join(shots, 'expected-due.png') });

  // D35: the tick is blocked and offers RECEIVE.
  await page.getByText('[ ]', { exact: true }).first().click();
  await page.waitForTimeout(400);
  check((await text(page)).includes('PARTNER R5\u00A0000 DUE ON RENT'), 'a bill with money due can’t be ticked off');
  await tap(page, "Receive Partner's money");

  // F16 / D34: R5 200 arrives instead of R5 400 (spare 14 600 → 14 400).
  let form = await text(page);
  check(form.includes('FROM PARTNER') && form.includes('INTERNET') && form.includes('R5\u00A0400'), 'RECEIVE lists every bill the payer covers');
  await type(page, 'RECEIVED', '5200');
  check((await text(page)).includes('R200 SHORT COMES FROM SPARE DEBIT'), 'a shortfall is previewed against spare debit');
  await page.screenshot({ path: join(shots, 'expected-receive.png'), fullPage: true });
  await tap(page, 'Received: it arrived in debit');
  main = await text(page);
  check(main.includes('RECEIVED') && main.includes('R14\u00A0400') && main.includes('PARTNER R5\u00A0000 RECEIVED'), 'receiving covers both bills');

  // Now Rent can be ticked off.
  await page.getByText('[ ]', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await tap(page, 'Paid: tick it off');
  check((await text(page)).includes('PAID R10\u00A0000'), 'once received, the bill can be ticked off');

  // F15: a new debit bill with Partner's share (chip offered); spare 14 400 − 300 = 14 100.
  await tap(page, 'Add a debit line');
  await type(page, 'NAME', 'Water');
  await page.getByLabel('Bill: a fixed amount, ticked off when paid', { exact: true }).click();
  await type(page, 'BILL AMOUNT', '600');
  await page.getByRole('checkbox', { name: 'Water: part of it is paid in by someone else' }).click();
  await page.getByRole('radio', { name: 'Partner', exact: true }).click();
  await type(page, 'Water, their share', '300');
  check((await text(page)).includes('SPARE DEBIT R14\u00A0100'), 'COMING IN is held back from spare only as your share');
  await tap(page, 'Add the line');
  check((await text(page)).includes('PARTNER R300 DUE'), 'the new bill shows its money due');

  // + IN lists what's due.
  await tap(page, 'Log extra cash in');
  check((await text(page)).includes('PARTNER R300 DUE'), '+ IN lists money still due');
  await tap(page, 'Cancel');

  // D37: the salary load asks CARRY or DROP (R300 still due from Partner).
  await tap(page, 'Load salary');
  check((await text(page)).includes('STEP 1/4 · AMOUNTS'), 'with money still due, the salary load has four steps');
  await type(page, 'SALARY', '20000');
  await type(page, 'TO CREDIT', '2000');
  await tap(page, 'Next: balances');
  await type(page, 'DEBIT BALANCE NOW', '15000');
  await type(page, 'CREDIT AVAILABLE NOW', '2000');
  await tap(page, 'Next: lines');
  // RESET: 15 000 − (5 000 + 400 + 300) = 9 300.
  check((await text(page)).includes('R9\u00A0300'), 'RESET keeps COMING IN, so only your shares are held back');
  await tap(page, 'Next: still due');
  await tap(page, 'Confirm: load the salary');
  check((await text(page)).includes('CHOOSE CARRY OR DROP FOR PARTNER'), 'CONFIRM waits for CARRY or DROP');
  await page.screenshot({ path: join(shots, 'salary-still-due.png'), fullPage: true });
  await tap(page, "Carry Partner's R300 into the new cycle");
  await tap(page, 'Confirm: load the salary');
  main = await text(page);
  check(main.includes('SALARY LOADED') && main.includes('STILL DUE FROM LAST CYCLE'), 'CARRY lists the money under DEBIT in the new cycle');
  await page.screenshot({ path: join(shots, 'expected-carried.png'), fullPage: true });
  check(errors.length === 0, `no page errors on the expected-money page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
}

/**
 * D39–D42: the card settlement, from a saved version-2 budget (the 2 → 3
 * migration runs too): debit R20 000 with Card settlement R1 200, credit
 * R10 000 with Food R1 800. Spare credit 8 200, spare debit 18 800.
 */
async function cardFlows(browser) {
  const day = 86_400_000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const ledger = {
    schemaVersion: 2,
    cycles: [
      {
        id: 'c1',
        startAt: midnight.getTime() - 5 * day,
        payDate: midnight.getTime() + 20 * day,
        closedAt: null,
        lines: [
          { id: 'food', side: 'credit', kind: 'budget', name: 'Food', isFood: true, amount: 1800, base: 1800 },
          { id: 'card', side: 'debit', kind: 'bill', name: 'Card settlement', isFood: false, amount: 1200, base: 1200 },
        ],
        entries: [{ id: 'e1', at: midnight.getTime() - 5 * day, type: 'start', actualDebit: 20000, actualCredit: 10000, savingsOnHand: 0 }],
      },
    ],
    chips: { spend: [], income: [] },
  };
  const { page, errors } = await freshPage(browser, ledger);

  // F19: mark the bill.
  await row(page, 'Card settlement').click();
  await page.waitForTimeout(400);
  await page.getByRole('checkbox', { name: "Card settlement: settles the credit card's deductions" }).click();
  await tap(page, 'Save the line');
  let main = await text(page);
  check(main.includes('⊖ DEDUCTED') && main.includes('NOTHING YET'), 'PAYS THE CARD adds DEDUCTED under the bill');

  // F20: two deductions; credit drops, spare credit doesn't.
  await page.getByText('⊖ DEDUCTED', { exact: true }).click();
  await page.waitForTimeout(400);
  await type(page, 'AMOUNT', '380');
  await type(page, 'Label', 'Interest');
  const form = await text(page);
  check(form.includes('CREDIT AVAILABLE R9\u00A0620') && form.includes('SPARE CREDIT R8\u00A0200'), 'a deduction lowers credit but not spare credit');
  await page.screenshot({ path: join(shots, 'card-deduct.png'), fullPage: true });
  await tap(page, 'Log the deduction');
  await page.getByText('⊖ DEDUCTED', { exact: true }).click();
  await page.waitForTimeout(400);
  await type(page, 'AMOUNT', '800');
  check((await text(page)).includes('INTEREST'), 'a deduction label becomes a chip');
  await type(page, 'Label', 'Facility');
  await tap(page, 'Log the deduction');
  main = await text(page);
  check(main.includes('R8\u00A0200') && main.includes('R1\u00A0180 TO SETTLE'), 'the bill shows what is owed to the card');
  await page.screenshot({ path: join(shots, 'card-owed.png') });

  // F21: settle, prefilled with what was deducted.
  await page.getByText('[ ]', { exact: true }).first().click();
  await page.waitForTimeout(400);
  const settle = await text(page);
  check(settle.includes('SETTLES WHAT WAS DEDUCTED') && settle.includes('CREDIT AVAILABLE R10\u00A0000'), 'SETTLE starts at what was deducted');
  await page.screenshot({ path: join(shots, 'card-settle.png'), fullPage: true });
  await tap(page, 'Settled: pay the card');
  main = await text(page);
  check(main.includes('SETTLED R1\u00A0180') && main.includes('R18\u00A0820') && main.includes('R8\u00A0200'), 'settling pays debit into credit');
  check(!main.includes('⊖ DEDUCTED'), 'nothing more can be deducted once settled');
  await tap(page, 'Log of every entry');
  main = await text(page);
  check(main.includes('INTEREST') && main.includes('SETTLED CARD SETTLEMENT'), 'LOG shows the deductions and the settlement');
  check(errors.length === 0, `no page errors on the card page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
}

const browser = await chromium.launch();
try {
  const { page, errors } = await freshPage(browser);
  await setUp(page);
  await loadSalary(page);
  await budgetFlows(page);
  await moneyFlows(page);
  await chipFlows(page);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await paydayLine(browser);
  await expectedFlows(browser);
  await cardFlows(browser);
} finally {
  await browser.close();
}
