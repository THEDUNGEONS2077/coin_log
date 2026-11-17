/**
 * __tests__/lib/labels.test.ts: finding a transaction label as it's typed
 * (lib/labels.ts, PLAN D43): word-start matching, most recent first, at
 * most six, an exact label always shown.
 */
import { labelsByRecency, matchLabels, sameLabel, SUGGESTIONS } from '@/lib/labels';
import { type Ledger, SCHEMA_VERSION, type SpendEntry } from '@/lib/types';

/** A spend entry with just what labelsByRecency reads. */
const spend = (label: string, at: number): SpendEntry => ({
  id: `${label}-${at}`,
  at,
  type: 'spend',
  side: 'credit',
  total: 1,
  label,
  parts: [],
});

/** A ledger of two cycles with these spend chips and transactions. */
function ledgerWith(chips: string[], older: SpendEntry[], newer: SpendEntry[]): Ledger {
  const cycle = (id: string, entries: SpendEntry[], closedAt: number | null) => ({
    id,
    startAt: 0,
    payDate: 1,
    closedAt,
    lines: [],
    entries,
  });
  return { schemaVersion: SCHEMA_VERSION, cycles: [cycle('c1', older, 5), cycle('c2', newer, null)], chips: { spend: chips, income: [] } };
}

describe('labelsByRecency', () => {
  it('orders chips by their newest transaction in any cycle; unused chips last, in Settings order', () => {
    const l = ledgerWith(
      ['Groceries', 'Fuel', 'Restaurant', 'Pharmacy', 'Gifts'],
      [spend('Restaurant', 100), spend('Fuel', 50)],
      // Labels compare ignoring case, as chips do.
      [spend('groceries', 300), spend('Restaurant', 200)],
    );
    expect(labelsByRecency(l)).toEqual(['Groceries', 'Restaurant', 'Fuel', 'Pharmacy', 'Gifts']);
  });
});

describe('matchLabels', () => {
  const labels = ['Restaurant', 'Bank fee', 'Residence fee', 'Fuel', 'Take-away', 'Gym'];

  it('matches the start of any word, ignoring case and spaces', () => {
    expect(matchLabels(labels, 'res')).toEqual(['Restaurant', 'Residence fee']);
    expect(matchLabels(labels, 'FEE')).toEqual(['Bank fee', 'Residence fee']);
    expect(matchLabels(labels, '  bank   f ')).toEqual(['Bank fee']);
    expect(matchLabels(labels, 'away')).toEqual(['Take-away']);
  });

  it('doesn’t match the middle of a word', () => {
    expect(matchLabels(labels, 'aur')).toEqual([]);
    expect(matchLabels(labels, 'ym')).toEqual([]);
  });

  it('finds nothing for nothing typed', () => {
    expect(matchLabels(labels, '  ')).toEqual([]);
  });

  it('keeps the given order, up to six', () => {
    const many = Array.from({ length: 9 }, (_, i) => `Shop ${i + 1}`);
    expect(matchLabels(many, 'shop')).toEqual(many.slice(0, SUGGESTIONS));
  });

  it('puts a label typed in full first, so it always shows', () => {
    const many = [...Array.from({ length: 7 }, (_, i) => `Fuel stop ${i + 1}`), 'Fuel'];
    const found = matchLabels(many, 'fuel');
    expect(found[0]).toBe('Fuel');
    expect(found).toHaveLength(SUGGESTIONS);
  });
});

describe('sameLabel', () => {
  it('ignores case and spacing', () => {
    expect(sameLabel('Bank  fee ', 'bank fee')).toBe(true);
    expect(sameLabel('Bank fee', 'Bank fees')).toBe(false);
  });
});
