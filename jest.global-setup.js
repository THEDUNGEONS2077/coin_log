/**
 * jest.global-setup.js: runs once before all test workers start.
 *
 * Pins the time zone so date tests are deterministic on any machine.
 * Europe/London has DST changes (2026: Mar 29 and Oct 25), which the date and
 * payday tests use to prove that day counts stay whole across them
 * (lib/payday.ts counts calendar days, never 24-hour blocks).
 * Workers inherit process.env, so this applies to every test file.
 */
module.exports = async () => {
  process.env.TZ = 'Europe/London';
};
