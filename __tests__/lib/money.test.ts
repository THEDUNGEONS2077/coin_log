/**
 * __tests__/lib/money.test.ts: whole-rand amounts (lib/money.ts, PLAN D28).
 */
import { formatDelta, formatRand, isRand, MAX_RAND, parseRand } from '@/lib/money';

/** The non-breaking space formatRand puts between thousands. */
const NB = ' ';

describe('parseRand', () => {
  it('reads whole rand, with or without spaces between thousands', () => {
    expect(parseRand('1234')).toBe(1234);
    expect(parseRand('1 234')).toBe(1234);
    expect(parseRand(`20${NB}000`)).toBe(20000);
    expect(parseRand('0')).toBe(0);
  });

  it('rejects anything that is not plain digits, instead of rounding it', () => {
    for (const bad of ['', ' ', '12.50', '1,234', '-5', 'R100', '1e3']) expect(parseRand(bad)).toBeNull();
  });

  it('rejects amounts above the maximum', () => {
    expect(parseRand(String(MAX_RAND))).toBe(MAX_RAND);
    expect(parseRand(String(MAX_RAND + 1))).toBeNull();
  });
});

describe('formatRand', () => {
  it('groups thousands with a non-breaking space', () => {
    expect(formatRand(0)).toBe('R0');
    expect(formatRand(999)).toBe('R999');
    expect(formatRand(1234)).toBe(`R1${NB}234`);
    expect(formatRand(1234567)).toBe(`R1${NB}234${NB}567`);
  });

  it('shows negatives with a real minus sign, and signed changes', () => {
    expect(formatRand(-120)).toBe('−R120');
    expect(formatDelta(300)).toBe('+R300');
    expect(formatDelta(-300)).toBe('−R300');
    expect(formatDelta(0)).toBe('R0');
  });
});

describe('isRand', () => {
  it('accepts whole numbers from 0 to the maximum only', () => {
    expect(isRand(0)).toBe(true);
    expect(isRand(1500)).toBe(true);
    expect(isRand(-1)).toBe(false);
    expect(isRand(1.5)).toBe(false);
    expect(isRand(NaN)).toBe(false);
    expect(isRand('5')).toBe(false);
  });
});
