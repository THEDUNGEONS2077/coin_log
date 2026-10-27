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

/** A fresh page on empty storage (boot screen off, so flows start at once). */
async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    let file = join(site, decodeURIComponent(url.pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(site, 'index.html');
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' });
  });
  await page.addInitScript(() => {
    // Once per test page: empty storage, boot screen off.
    if (sessionStorage.getItem('fresh')) return;
    localStorage.clear();
    localStorage.setItem('coin_log\\settings.v1', JSON.stringify({ bootSequence: false }));
    sessionStorage.setItem('fresh', '1');
  });
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

const browser = await chromium.launch();
try {
  const { page, errors } = await freshPage(browser);
  await setUp(page);
  await loadSalary(page);
  await budgetFlows(page);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
}
