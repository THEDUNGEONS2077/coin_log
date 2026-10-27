/**
 * store/migrations/index.ts: upgrades saved ledger data to the current
 * format, and checks loaded data before the app runs on it.
 *
 * Layer: store. The budget is real data, so every schema change ships with:
 *   1. a pure migration `(data at version N) => data at version N + 1`,
 *      registered in MIGRATIONS below,
 *   2. a bump of SCHEMA_VERSION in lib/types.ts,
 *   3. a fixture saved from the previous version (`__tests__/fixtures/ledger-vN.json`)
 *      and a test that migrates it.
 *
 * The caller (persist.ts) snapshots the raw data *before* migrating, so a
 * buggy migration can never destroy the original. (The pipeline is
 * quest_log's; the checks are coin_log's own.)
 */
import { isRand } from '@/lib/money';
import { type Ledger, SCHEMA_VERSION } from '@/lib/types';

/**
 * A migration step. Input and output are untyped JSON on purpose: old
 * formats don't match today's types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- old data formats are untyped JSON by nature
type Migration = (data: any) => any;

/**
 * MIGRATIONS[n] upgrades data from version n to n + 1.
 * Version 1 is the first format, so there's nothing to migrate yet.
 */
export const MIGRATIONS: Record<number, Migration> = {};

/** Thrown when saved data comes from a *newer* app version than this one. */
export class FutureSchemaError extends Error {
  constructor(public readonly found: number) {
    super(`saved data has schema ${found}, this app understands up to ${SCHEMA_VERSION}`);
  }
}

/**
 * Runs every migration needed to bring `data` to SCHEMA_VERSION.
 * Returns the migrated data and whether anything changed. Throws
 * FutureSchemaError for data newer than the app (it must not be touched),
 * and Error when a step is missing or the data is malformed.
 */
export function migrate(data: unknown): { ledger: Ledger; migrated: boolean } {
  if (!data || typeof data !== 'object') throw new Error('migrate: data is not an object');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking an old, untyped format
  let current: any = data;
  const start = Number(current.schemaVersion);
  if (!Number.isInteger(start) || start < 1) throw new Error(`migrate: invalid schemaVersion ${current.schemaVersion}`);
  if (start > SCHEMA_VERSION) throw new FutureSchemaError(start);

  // Apply each step in order, stamping the new version after each.
  for (let v = start; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`migrate: no migration from schema ${v}`);
    current = { ...step(current), schemaVersion: v + 1 };
  }
  assertValidLedger(current);
  return { ledger: current, migrated: start !== SCHEMA_VERSION };
}

/** Throws with `what` when `ok` is false. */
function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`invalid: ${what}`);
}

/**
 * Structural checks on loaded data: catches corruption and migration bugs
 * before the app runs on bad data. Not a full schema check, but it covers
 * what lib/ledger.ts relies on: the shapes, whole-rand amounts, unique IDs
 * within a cycle, and every cycle opening with its start or salary entry.
 */
export function assertValidLedger(s: unknown): asserts s is Ledger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON
  const l = s as any;
  check(!!l && typeof l === 'object' && Array.isArray(l.cycles), 'missing cycles');
  check(!!l.chips && Array.isArray(l.chips.spend) && Array.isArray(l.chips.income), 'missing chips');
  check(
    [...l.chips.spend, ...l.chips.income].every((c: unknown) => typeof c === 'string'),
    'chip is not text',
  );
  l.cycles.forEach((c: unknown, i: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON
    const cycle = c as any;
    check(!!cycle && typeof cycle.id === 'string', `cycle ${i} has no id`);
    check(Number.isFinite(cycle.startAt) && Number.isFinite(cycle.payDate), `cycle ${i} dates`);
    check(cycle.closedAt === null || Number.isFinite(cycle.closedAt), `cycle ${i} closedAt`);
    // Only the last cycle is open.
    check((cycle.closedAt === null) === (i === l.cycles.length - 1), `cycle ${i} open/closed`);
    check(Array.isArray(cycle.lines) && Array.isArray(cycle.entries), `cycle ${i} lists`);
    const lineIds = new Set<string>();
    for (const line of cycle.lines) {
      check(typeof line?.id === 'string' && !lineIds.has(line.id), `cycle ${i} line id`);
      lineIds.add(line.id);
      check(line.side === 'credit' || line.side === 'debit', `line ${line.id} side`);
      check(line.kind === 'bill' || line.kind === 'budget', `line ${line.id} kind`);
      check(typeof line.name === 'string' && typeof line.isFood === 'boolean', `line ${line.id} name`);
      check(Number.isInteger(line.amount) && isRand(line.base), `line ${line.id} amounts`);
    }
    const entryIds = new Set<string>();
    cycle.entries.forEach((e: { id?: unknown; type?: unknown; at?: unknown }, j: number) => {
      check(typeof e?.id === 'string' && !entryIds.has(e.id), `cycle ${i} entry id`);
      entryIds.add(e.id as string);
      check(Number.isFinite(e.at), `entry ${e.id} time`);
      const opening = e.type === 'start' || e.type === 'salary';
      // Exactly one opening entry per cycle, and it comes first.
      check(opening === (j === 0), `cycle ${i} opening entry`);
      check(
        ['start', 'salary', 'spend', 'tick', 'cancel', 'topup', 'income', 'move', 'adjust'].includes(e.type as string),
        `entry ${e.id} type`,
      );
    });
  });
}
