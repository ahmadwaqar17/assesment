import { describe, expect, it } from 'vitest';
import { formatCents, parseDollarsToCents, sumCents } from './money';

describe('parseDollarsToCents', () => {
  it.each([
    ['4.75', 475],
    ['$17.63', 1763],
    ['9.1', 910],
    ['13', 1300],
    ['.5', 50],
    [' $0.07 ', 7],
    ['0', 0],
    ['-2.50', -250],
    ['$-2.50', -250],
  ])('parses %j as %i cents', (text, cents) => {
    expect(parseDollarsToCents(text)).toBe(cents);
  });

  it('avoids floating point errors', () => {
    // 0.1 + 0.2 style bugs: 4.35 * 100 is 434.99999999999994 in floating point.
    expect(parseDollarsToCents('4.35')).toBe(435);
  });

  it.each(['', '$', 'abc', '4.755', '1,000.00', '4.75 USD', '--1'])('rejects %j', (text) => {
    expect(parseDollarsToCents(text)).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats integer cents as US dollars', () => {
    expect(formatCents(2238)).toBe('$22.38');
    expect(formatCents(7133)).toBe('$71.33');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});

describe('sumCents', () => {
  it('adds integer cents', () => {
    expect(sumCents([475, 1763])).toBe(2238);
    expect(sumCents([])).toBe(0);
  });
});
