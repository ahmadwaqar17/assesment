import { describe, expect, it } from 'vitest';
import {
  applyReviewDecision,
  bucketTotals,
  effectiveEnd,
  fingerprintOf,
  matchTolls,
  strictlyContains,
} from './matcher';
import { makeToll, makeTrip } from './testFixtures';
import type { Trip } from './types';

const NONE = new Set<string>();

function matchOne(at: string, trips: Trip[], plate = 'ABC-123', buffer?: number) {
  return matchTolls([makeToll({ at, plate })], trips, NONE, buffer)[0];
}

describe('effectiveEnd', () => {
  it('uses the actual return when there is one, otherwise the scheduled end', () => {
    expect(effectiveEnd(makeTrip({ id: 'A' }))).toBe('2026-10-03T10:00-04:00');
    expect(effectiveEnd(makeTrip({ id: 'A', returnedAt: '2026-10-04T10:00-04:00' }))).toBe('2026-10-04T10:00-04:00');
  });
});

describe('strictlyContains', () => {
  const trip = makeTrip({ id: 'A' }); // 10-01 10:00 to 10-03 10:00 EDT
  it('is inclusive at both ends', () => {
    expect(strictlyContains(trip, '2026-10-01T14:00:00.000Z')).toBe(true); // exactly start
    expect(strictlyContains(trip, '2026-10-03T14:00:00.000Z')).toBe(true); // exactly end
  });
  it('is false one minute outside', () => {
    expect(strictlyContains(trip, '2026-10-01T13:59:00.000Z')).toBe(false);
    expect(strictlyContains(trip, '2026-10-03T14:01:00.000Z')).toBe(false);
  });
  it('compares in UTC across different offsets', () => {
    expect(strictlyContains(trip, '2026-10-01T10:00:00-04:00')).toBe(true);
    expect(strictlyContains(trip, '2026-10-01T07:00:00-07:00')).toBe(true); // = 10:00 EDT
    expect(strictlyContains(trip, '2026-10-01T06:59:00-07:00')).toBe(false);
  });
});

describe('fingerprintOf', () => {
  it('uses ext:<transaction_id> when present', () => {
    expect(fingerprintOf(makeToll({ at: '2026-10-02T12:00-04:00', externalId: 'TX-9' }))).toBe('ext:TX-9');
  });
  it('otherwise hashes normalized plate, UTC time, plaza and cents', () => {
    const toll = makeToll({ at: '2026-10-02T12:00-04:00', plate: 'abc 123', plaza: 'GWB', amountCents: 1763 });
    expect(fingerprintOf(toll)).toBe('hash:ABC123|2026-10-02T16:00:00.000Z|GWB|1763');
  });
});

describe('matchTolls', () => {
  describe('rule 1: duplicates', () => {
    it('marks a fingerprint seen earlier in the same file as DUPLICATE (first one still matches)', () => {
      const toll = makeToll({ at: '2026-10-02T12:00-04:00', externalId: 'TX-1' });
      const [first, second] = matchTolls([toll, toll], [makeTrip({ id: 'A' })], NONE);
      expect(first.outcome).toBe('BILL_RENTER');
      expect(second).toMatchObject({ outcome: 'DUPLICATE', reason: 'Appears earlier in this file' });
    });

    it('marks a fingerprint from an earlier upload as DUPLICATE', () => {
      const toll = makeToll({ at: '2026-10-02T12:00-04:00', externalId: 'TX-1' });
      const [result] = matchTolls([toll], [makeTrip({ id: 'A' })], new Set(['ext:TX-1']));
      expect(result).toMatchObject({ outcome: 'DUPLICATE', reason: 'Already imported in an earlier upload' });
    });

    it('detects duplicates without a transaction id via the content hash', () => {
      const a = makeToll({ at: '2026-10-02T12:00-04:00', plate: 'ABC-123' });
      const b = makeToll({ at: '2026-10-02T12:00-04:00', plate: 'abc123' });
      const results = matchTolls([a, b], [makeTrip({ id: 'A' })], NONE);
      expect(results.map((r) => r.outcome)).toEqual(['BILL_RENTER', 'DUPLICATE']);
    });

    it('does not treat different amounts as duplicates when there is no transaction id', () => {
      const a = makeToll({ at: '2026-10-02T12:00-04:00', amountCents: 500 });
      const b = makeToll({ at: '2026-10-02T12:00-04:00', amountCents: 600 });
      expect(matchTolls([a, b], [makeTrip({ id: 'A' })], NONE).map((r) => r.outcome)).toEqual([
        'BILL_RENTER',
        'BILL_RENTER',
      ]);
    });
  });

  describe('rule 2: only trips for the same normalized plate', () => {
    it('ignores trips for other cars', () => {
      const other = makeTrip({ id: 'A', plate: 'ZZZ-999' });
      expect(matchOne('2026-10-02T12:00-04:00', [other]).outcome).toBe('OPERATOR_EXPENSE');
    });
    it('matches however the plate is written', () => {
      const trip = makeTrip({ id: 'A', plate: 'FLX-4821' });
      expect(matchOne('2026-10-02T12:00-04:00', [trip], 'flx 4821').trip?.id).toBe('A');
    });
  });

  describe('rule 3: exactly one trip strictly contains the toll', () => {
    it('is BILL_RENTER for a direct trip', () => {
      const result = matchOne('2026-10-02T12:00-04:00', [makeTrip({ id: 'A', renter: 'Sarah' })]);
      expect(result).toMatchObject({ outcome: 'BILL_RENTER', reason: "During Sarah's trip A", candidates: [] });
      expect(result.trip?.id).toBe('A');
    });

    it('is TURO_REIMBURSEMENT for a Turo trip', () => {
      const result = matchOne('2026-10-02T12:00-04:00', [makeTrip({ id: 'A', source: 'turo' })]);
      expect(result).toMatchObject({ outcome: 'TURO_REIMBURSEMENT', reason: 'During Turo trip A: file with Turo' });
    });

    it('adds "after scheduled end, before actual return" for an extended trip', () => {
      const trip = makeTrip({ id: 'A', renter: 'Lisa', returnedAt: '2026-10-05T10:00-04:00' });
      expect(matchOne('2026-10-04T12:00-04:00', [trip])).toMatchObject({
        outcome: 'BILL_RENTER',
        reason: "During Lisa's trip A, after scheduled end, before actual return",
      });
      // Before the scheduled end, no extra note.
      expect(matchOne('2026-10-02T12:00-04:00', [trip]).reason).toBe("During Lisa's trip A");
    });

    it('uses an early return as the end of the window', () => {
      const trip = makeTrip({ id: 'A', returnedAt: '2026-10-02T10:00-04:00' });
      expect(matchOne('2026-10-02T12:00-04:00', [trip]).outcome).toBe('OPERATOR_EXPENSE');
    });

    it('bills the containing trip even when another trip is only near', () => {
      const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
      const b = makeTrip({ id: 'B', start: '2026-10-03T10:00-04:00', end: '2026-10-05T10:00-04:00' });
      expect(matchOne('2026-10-03T10:10-04:00', [a, b]).trip?.id).toBe('B');
    });
  });

  describe('rule 4: two or more trips strictly contain the toll', () => {
    it('is NEEDS_REVIEW at the exact handover moment, with both trips as candidates', () => {
      const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
      const b = makeTrip({ id: 'B', start: '2026-10-03T10:00-04:00', end: '2026-10-05T10:00-04:00' });
      const result = matchOne('2026-10-03T10:00-04:00', [b, a]);
      expect(result).toMatchObject({ outcome: 'NEEDS_REVIEW', reason: 'Exact handover moment between A and B' });
      expect(result.candidates.map((t) => t.id)).toEqual(['A', 'B']);
      expect(result.trip).toBeUndefined();
    });

    it('is NEEDS_REVIEW for overlapping trips (a data error)', () => {
      const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-04T10:00-04:00' });
      const b = makeTrip({ id: 'B', start: '2026-10-02T10:00-04:00', end: '2026-10-05T10:00-04:00' });
      const result = matchOne('2026-10-03T10:00-04:00', [a, b]);
      expect(result).toMatchObject({ outcome: 'NEEDS_REVIEW', reason: 'Overlapping trips A and B all had this car (data error)' });
      expect(result.candidates.map((t) => t.id)).toEqual(['A', 'B']);
    });
  });

  describe('rule 5: no trip contains it, but one or more are near', () => {
    const trip = makeTrip({ id: 'A', renter: 'Lisa' }); // 10-01 10:00 to 10-03 10:00

    it('is NEEDS_REVIEW just before pickup, with the trip suggested', () => {
      const result = matchOne('2026-10-01T09:50-04:00', [trip]);
      expect(result).toMatchObject({
        outcome: 'NEEDS_REVIEW',
        reason: "10 min before Lisa's pickup (A), inside the 30-min buffer",
      });
      expect(result.suggestedTrip?.id).toBe('A');
    });

    it('is NEEDS_REVIEW just after the trip ended', () => {
      expect(matchOne('2026-10-03T10:20-04:00', [trip]).reason).toBe(
        "20 min after Lisa's trip ended (A), inside the 30-min buffer",
      );
    });

    it('says "actual return" when the trip has a return time', () => {
      const returned = makeTrip({ id: 'A', renter: 'Lisa', returnedAt: '2026-10-04T10:00-04:00' });
      expect(matchOne('2026-10-04T10:20-04:00', [returned]).reason).toBe(
        "20 min after Lisa's actual return (A), inside the 30-min buffer",
      );
    });

    it('includes the buffer edge (exactly 30 min) but not 31 min', () => {
      expect(matchOne('2026-10-03T10:30-04:00', [trip]).outcome).toBe('NEEDS_REVIEW');
      expect(matchOne('2026-10-03T10:31-04:00', [trip]).outcome).toBe('OPERATOR_EXPENSE');
      expect(matchOne('2026-10-01T09:30-04:00', [trip]).outcome).toBe('NEEDS_REVIEW');
      expect(matchOne('2026-10-01T09:29-04:00', [trip]).outcome).toBe('OPERATOR_EXPENSE');
    });

    it('respects a custom buffer', () => {
      expect(matchOne('2026-10-03T10:20-04:00', [trip], 'ABC-123', 15).outcome).toBe('OPERATOR_EXPENSE');
      expect(matchOne('2026-10-03T10:50-04:00', [trip], 'ABC-123', 60).outcome).toBe('NEEDS_REVIEW');
    });

    it('suggests the nearest trip and lists all near trips, nearest first', () => {
      const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
      const b = makeTrip({ id: 'B', start: '2026-10-03T10:30-04:00', end: '2026-10-05T10:00-04:00' });
      const result = matchOne('2026-10-03T10:20-04:00', [a, b]); // 20 min after A, 10 min before B
      expect(result.suggestedTrip?.id).toBe('B');
      expect(result.candidates.map((t) => t.id)).toEqual(['B', 'A']);
    });

    it('breaks a tie by picking the earlier trip', () => {
      const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
      const b = makeTrip({ id: 'B', start: '2026-10-03T10:20-04:00', end: '2026-10-05T10:00-04:00' });
      expect(matchOne('2026-10-03T10:10-04:00', [b, a]).suggestedTrip?.id).toBe('A');
    });
  });

  describe('rule 6: nobody had the car', () => {
    it('is OPERATOR_EXPENSE', () => {
      expect(matchOne('2026-10-09T12:00-04:00', [makeTrip({ id: 'A' })])).toMatchObject({
        outcome: 'OPERATOR_EXPENSE',
        reason: 'No trip had this car at that time',
        candidates: [],
      });
    });
    it('is OPERATOR_EXPENSE when there are no trips at all', () => {
      expect(matchOne('2026-10-02T12:00-04:00', []).outcome).toBe('OPERATOR_EXPENSE');
    });
  });
});

describe('applyReviewDecision', () => {
  const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
  const b = makeTrip({ id: 'B', start: '2026-10-03T10:00-04:00', end: '2026-10-05T10:00-04:00', source: 'turo' });
  const handover = () => matchOne('2026-10-03T10:00-04:00', [a, b]);

  it('assigning to a direct trip makes it BILL_RENTER', () => {
    const result = applyReviewDecision(handover(), { kind: 'assign', tripId: 'A' });
    expect(result).toMatchObject({ outcome: 'BILL_RENTER', reason: 'Assigned to A by reviewer', candidates: [] });
    expect(result.trip?.id).toBe('A');
  });

  it('assigning to a Turo trip makes it TURO_REIMBURSEMENT', () => {
    expect(applyReviewDecision(handover(), { kind: 'assign', tripId: 'B' }).outcome).toBe('TURO_REIMBURSEMENT');
  });

  it('marking as expense makes it OPERATOR_EXPENSE', () => {
    expect(applyReviewDecision(handover(), { kind: 'expense' })).toMatchObject({
      outcome: 'OPERATOR_EXPENSE',
      reason: 'Marked as operator expense by reviewer',
    });
  });

  it('keeps the fingerprint and toll', () => {
    const before = handover();
    const after = applyReviewDecision(before, { kind: 'expense' });
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.toll).toBe(before.toll);
  });

  it('refuses a trip that is not a candidate', () => {
    expect(() => applyReviewDecision(handover(), { kind: 'assign', tripId: 'Z' })).toThrow(/not a candidate/);
  });

  it('refuses rows that are not NEEDS_REVIEW', () => {
    const billed = matchOne('2026-10-02T12:00-04:00', [a]);
    expect(() => applyReviewDecision(billed, { kind: 'expense' })).toThrow(/Only NEEDS_REVIEW/);
  });
});

describe('bucketTotals', () => {
  it('counts and sums every bucket, including empty ones', () => {
    const trip = makeTrip({ id: 'A' });
    const results = matchTolls(
      [
        makeToll({ at: '2026-10-02T12:00-04:00', amountCents: 475, externalId: '1' }),
        makeToll({ at: '2026-10-02T13:00-04:00', amountCents: 1763, externalId: '2' }),
        makeToll({ at: '2026-10-09T12:00-04:00', amountCents: 1338, externalId: '3' }),
      ],
      [trip],
      NONE,
    );
    expect(bucketTotals(results)).toEqual({
      BILL_RENTER: { count: 2, cents: 2238 },
      NEEDS_REVIEW: { count: 0, cents: 0 },
      TURO_REIMBURSEMENT: { count: 0, cents: 0 },
      OPERATOR_EXPENSE: { count: 1, cents: 1338 },
      DUPLICATE: { count: 0, cents: 0 },
    });
  });
});
