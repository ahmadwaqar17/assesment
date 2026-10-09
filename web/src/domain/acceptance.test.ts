// Acceptance test: PROJECT_CONTEXT.md section 6, run against the real sample CSV and seed trips.
import { describe, expect, it } from 'vitest';
import sampleCsv from '../../public/sample-tolls.csv?raw';
import { OPERATOR_TIMEZONE, SEED_TRIPS } from '../data/trips';
import { buildChargeDrafts } from './charges';
import { bucketTotals, matchTolls } from './matcher';
import { formatCents } from './money';
import { parseStatement } from './statement';
import type { Outcome } from './types';

function importSample(seen: ReadonlySet<string> = new Set()) {
  const parsed = parseStatement(sampleCsv, OPERATOR_TIMEZONE);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return matchTolls(parsed.tolls, SEED_TRIPS, seen);
}

// [transaction id, outcome, trip (matched, or the suggestion / candidates for review)]
const EXPECTED: [string, Outcome, string[]][] = [
  ['TX-1001', 'BILL_RENTER', ['T1001']],
  ['TX-1002', 'BILL_RENTER', ['T1001']],
  ['TX-1003', 'BILL_RENTER', ['T1002']],
  ['TX-1004', 'NEEDS_REVIEW', ['T1001', 'T1002']],
  ['TX-1005', 'TURO_REIMBURSEMENT', ['T1003']],
  ['TX-1006', 'BILL_RENTER', ['T1004']],
  ['TX-1007', 'NEEDS_REVIEW', ['T1004']],
  ['TX-1008', 'BILL_RENTER', ['T1005']],
  ['TX-1009', 'OPERATOR_EXPENSE', []],
  ['TX-1002', 'DUPLICATE', []],
  ['TX-1010', 'BILL_RENTER', ['T1005']],
  ['TX-1011', 'NEEDS_REVIEW', ['T1004']],
  ['TX-1012', 'BILL_RENTER', ['T1006']],
];

describe('sample statement against seed trips (section 6)', () => {
  const results = importSample();

  it('parses all 13 rows', () => {
    expect(results).toHaveLength(13);
  });

  it.each(EXPECTED.map((row, index) => [index + 2, ...row] as const))(
    'row %i (%s) → %s %j',
    (rowNumber, txId, outcome, tripIds) => {
      const result = results[rowNumber - 2];
      expect(result.toll.externalId).toBe(txId);
      expect(result.outcome).toBe(outcome);
      const tripsShown =
        outcome === 'NEEDS_REVIEW'
          ? result.suggestedTrip
            ? [result.suggestedTrip.id]
            : result.candidates.map((t) => t.id)
          : result.trip
            ? [result.trip.id]
            : [];
      expect(tripsShown).toEqual(tripIds);
    },
  );

  it('explains the interesting rows', () => {
    const reasonOf = (row: number) => results[row - 2].reason;
    expect(reasonOf(5)).toBe('Exact handover moment between T1001 and T1002'); // TX-1004
    expect(reasonOf(7)).toBe("During Lisa Harris's trip T1004, after scheduled end, before actual return"); // TX-1006
    expect(reasonOf(8)).toBe("20 min after Lisa Harris's actual return (T1004), inside the 30-min buffer"); // TX-1007
    expect(reasonOf(10)).toBe('No trip had this car at that time'); // TX-1009
    expect(reasonOf(11)).toBe('Appears earlier in this file'); // TX-1002 again
    expect(reasonOf(13)).toBe("10 min before Lisa Harris's pickup (T1004), inside the 30-min buffer"); // TX-1011
  });

  it('converts TX-1008 (23:45 EDT) to 03:45 UTC the next day', () => {
    expect(results[7].toll.occurredAt).toBe('2026-10-03T03:45:00.000Z');
  });

  it('would bill the wrong renter if statement times were read as UTC (guards the timezone conversion)', () => {
    const parsedAsUtc = parseStatement(sampleCsv, 'UTC');
    if (!parsedAsUtc.ok) throw new Error('unexpected');
    const wrong = matchTolls(parsedAsUtc.tolls, SEED_TRIPS, new Set());
    expect(wrong[2].trip?.id).toBe('T1001'); // TX-1003 lands on Sarah instead of James
    expect(wrong[11].outcome).toBe('OPERATOR_EXPENSE'); // TX-1011 falls out of the buffer
  });

  it('has the expected bucket totals', () => {
    const totals = bucketTotals(results);
    expect(formatCents(totals.BILL_RENTER.cents)).toBe('$71.33');
    expect(formatCents(totals.NEEDS_REVIEW.cents)).toBe('$23.52');
    expect(formatCents(totals.TURO_REIMBURSEMENT.cents)).toBe('$9.10');
    expect(formatCents(totals.OPERATOR_EXPENSE.cents)).toBe('$13.38');
    expect(formatCents(totals.DUPLICATE.cents)).toBe('$17.63');
  });

  it('has the expected charges before review', () => {
    const drafts = buildChargeDrafts(results);
    expect(drafts.map((d) => [d.trip.id, d.trip.renter, d.tolls.length, formatCents(d.totalCents)])).toEqual([
      ['T1001', 'Sarah Mitchell', 2, '$22.38'],
      ['T1002', 'James Cruz', 1, '$13.38'],
      ['T1004', 'Lisa Harris', 1, '$5.25'],
      ['T1005', 'Omar Khan', 2, '$24.57'],
      ['T1006', 'Daniel Reyes', 1, '$5.75'],
    ]);
  });

  it('makes every row a DUPLICATE when the same CSV is uploaded a second time', () => {
    const seen = new Set(results.map((r) => r.fingerprint));
    const second = importSample(seen);
    expect(second).toHaveLength(13);
    expect(second.every((r) => r.outcome === 'DUPLICATE')).toBe(true);
  });
});
