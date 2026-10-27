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
} finally {
  await browser.close();
}
