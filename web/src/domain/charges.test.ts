import { describe, expect, it } from 'vitest';
import { buildChargeDrafts, chargedFingerprints, fnv1a64, idempotencyKey } from './charges';
import { applyReviewDecision, matchTolls } from './matcher';
import { makeToll, makeTrip } from './testFixtures';
import type { Charge } from './types';

const sarah = makeTrip({ id: 'T1', plate: 'AAA-111', renter: 'Sarah' });
const james = makeTrip({ id: 'T2', plate: 'BBB-222', renter: 'James' });
const turo = makeTrip({ id: 'T3', plate: 'CCC-333', source: 'turo' });

const tolls = [
  makeToll({ at: '2026-10-02T15:00-04:00', plate: 'AAA-111', amountCents: 1763, externalId: 'B' }),
  makeToll({ at: '2026-10-02T12:00-04:00', plate: 'AAA-111', amountCents: 475, externalId: 'A' }),
  makeToll({ at: '2026-10-02T12:00-04:00', plate: 'BBB-222', amountCents: 1338, externalId: 'C' }),
  makeToll({ at: '2026-10-02T12:00-04:00', plate: 'CCC-333', amountCents: 910, externalId: 'D' }), // Turo
  makeToll({ at: '2026-10-09T12:00-04:00', plate: 'AAA-111', amountCents: 999, externalId: 'E' }), // expense
];
const results = matchTolls(tolls, [sarah, james, turo], new Set());

describe('buildChargeDrafts', () => {
  it('groups BILL_RENTER tolls by trip and ignores every other bucket', () => {
    const drafts = buildChargeDrafts(results);
    expect(drafts.map((d) => [d.trip.id, d.tollFingerprints])).toEqual([
      ['T1', ['ext:A', 'ext:B']],
      ['T2', ['ext:C']],
    ]);
  });

  it('sorts each trip’s tolls by time for the receipt', () => {
    const [sarahDraft] = buildChargeDrafts(results);
    expect(sarahDraft.tolls.map((r) => r.toll.externalId)).toEqual(['A', 'B']);
  });

  it('totals in integer cents with no admin fee by default', () => {
    const [sarahDraft] = buildChargeDrafts(results);
    expect(sarahDraft).toMatchObject({ tollCents: 2238, adminFeeCents: 0, totalCents: 2238 });
  });

  it('adds adminFeeEach × number of tolls', () => {
    const [sarahDraft, jamesDraft] = buildChargeDrafts(results, { adminFeeEachCents: 150 });
    expect(sarahDraft).toMatchObject({ tollCents: 2238, adminFeeCents: 300, totalCents: 2538 });
    expect(jamesDraft).toMatchObject({ tollCents: 1338, adminFeeCents: 150, totalCents: 1488 });
  });

  it('includes tolls a reviewer assigned to a direct trip', () => {
    const a = makeTrip({ id: 'A', start: '2026-10-01T10:00-04:00', end: '2026-10-03T10:00-04:00' });
    const b = makeTrip({ id: 'B', start: '2026-10-03T10:00-04:00', end: '2026-10-05T10:00-04:00' });
    const [review] = matchTolls([makeToll({ at: '2026-10-03T10:00-04:00', externalId: 'H' })], [a, b], new Set());
    expect(buildChargeDrafts([review])).toEqual([]);
    const drafts = buildChargeDrafts([applyReviewDecision(review, { kind: 'assign', tripId: 'B' })]);
    expect(drafts.map((d) => [d.trip.id, d.tollFingerprints])).toEqual([['B', ['ext:H']]]);
  });

  it('never includes a toll that is already on a charge', () => {
    const drafts = buildChargeDrafts(results, { alreadyCharged: new Set(['ext:A', 'ext:C']) });
    expect(drafts.map((d) => [d.trip.id, d.tollFingerprints, d.totalCents])).toEqual([['T1', ['ext:B'], 1763]]);
  });

  it('gives the same idempotency key whatever order the tolls arrive in', () => {
    const forward = buildChargeDrafts(results)[0].idempotencyKey;
    const backward = buildChargeDrafts([...results].reverse())[0].idempotencyKey;
    expect(forward).toBe(backward);
  });
});

describe('idempotencyKey', () => {
  it('has the form tolls-<tripId>-<hash>', () => {
    expect(idempotencyKey('T1001', ['ext:TX-1001', 'ext:TX-1002'])).toMatch(/^tolls-T1001-[0-9a-f]{16}$/);
  });

  it('is the same for the same trip and the same set of tolls, in any order', () => {
    expect(idempotencyKey('T1', ['ext:A', 'ext:B'])).toBe(idempotencyKey('T1', ['ext:B', 'ext:A']));
  });

  it('differs for a different set of tolls or a different trip', () => {
    const key = idempotencyKey('T1', ['ext:A', 'ext:B']);
    expect(idempotencyKey('T1', ['ext:A'])).not.toBe(key);
    expect(idempotencyKey('T1', ['ext:A', 'ext:B', 'ext:C'])).not.toBe(key);
    expect(idempotencyKey('T2', ['ext:A', 'ext:B'])).not.toBe(key);
  });

  it('does not mutate the input array', () => {
    const fingerprints = ['ext:B', 'ext:A'];
    idempotencyKey('T1', fingerprints);
    expect(fingerprints).toEqual(['ext:B', 'ext:A']);
  });
});

describe('fnv1a64', () => {
  it('matches the reference FNV-1a 64-bit values', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
  });
});

describe('chargedFingerprints', () => {
  it('collects tolls from every charge, whatever its status (failed included)', () => {
    const charge = (tollFingerprints: string[], status: Charge['status']): Charge => ({
      id: 'x', tripId: 'T1', tollFingerprints, tollCents: 0, adminFeeCents: 0, totalCents: 0,
      idempotencyKey: 'k', status, createdAt: '2026-10-08T00:00:00.000Z',
    });
    const set = chargedFingerprints([charge(['ext:A'], 'paid'), charge(['ext:B'], 'failed'), charge(['ext:C'], 'pending')]);
    expect([...set].sort()).toEqual(['ext:A', 'ext:B', 'ext:C']);
  });
});
