// Matching rules (PROJECT_CONTEXT.md section 5). Every toll lands in exactly one bucket.
import { DateTime } from 'luxon';
import { sumCents } from './money';
import { normalizePlate } from './plate';
import type { MatchResult, Outcome, ReviewDecision, Toll, Trip } from './types';

export const DEFAULT_BUFFER_MINUTES = 30;
export const OUTCOMES: Outcome[] = [
  'BILL_RENTER',
  'NEEDS_REVIEW',
  'TURO_REIMBURSEMENT',
  'OPERATOR_EXPENSE',
  'DUPLICATE',
];

const MINUTE_MS = 60_000;

function toMillis(iso: string): number {
  return DateTime.fromISO(iso, { setZone: true }).toMillis();
}

/** Extended or late trips use the actual return. */
export function effectiveEnd(trip: Trip): string {
  return trip.returnedAt ?? trip.end;
}

/** `ext:<transaction_id>` when there is one, otherwise a hash of the toll's contents. */
export function fingerprintOf(toll: Toll): string {
  if (toll.externalId) return `ext:${toll.externalId}`;
  return `hash:${normalizePlate(toll.plate)}|${toll.occurredAt}|${toll.plaza}|${toll.amountCents}`;
}

/** Inclusive: start <= toll <= effectiveEnd. */
export function strictlyContains(trip: Trip, occurredAt: string): boolean {
  const t = toMillis(occurredAt);
  return toMillis(trip.start) <= t && t <= toMillis(effectiveEnd(trip));
}

/** Minutes outside the trip window (0 when strictly inside). */
export function minutesOutside(trip: Trip, occurredAt: string): number {
  const t = toMillis(occurredAt);
  const start = toMillis(trip.start);
  const end = toMillis(effectiveEnd(trip));
  if (t < start) return (start - t) / MINUTE_MS;
  if (t > end) return (t - end) / MINUTE_MS;
  return 0;
}

function describeMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  return rounded === 1 ? '1 min' : `${rounded} min`;
}

function nearReason(trip: Trip, occurredAt: string, bufferMinutes: number): string {
  const gap = describeMinutes(minutesOutside(trip, occurredAt));
  const where =
    toMillis(occurredAt) < toMillis(trip.start)
      ? `${gap} before ${trip.renter}'s pickup (${trip.id})`
      : `${gap} after ${trip.renter}'s ${trip.returnedAt ? 'actual return' : 'trip ended'} (${trip.id})`;
  return `${where}, inside the ${bufferMinutes}-min buffer`;
}

function containedReason(trips: Trip[], occurredAt: string): string {
  const ids = trips.map((trip) => trip.id).join(' and ');
  const t = toMillis(occurredAt);
  const isHandover =
    trips.length === 2 &&
    trips.some((trip) => toMillis(effectiveEnd(trip)) === t) &&
    trips.some((trip) => toMillis(trip.start) === t);
  return isHandover
    ? `Exact handover moment between ${ids}`
    : `Overlapping trips ${ids} all had this car (data error)`;
}

function matchedReason(trip: Trip, occurredAt: string): string {
  const base =
    trip.source === 'turo'
      ? `During Turo trip ${trip.id}: file with Turo`
      : `During ${trip.renter}'s trip ${trip.id}`;
  const extended = trip.returnedAt !== undefined && toMillis(trip.returnedAt) > toMillis(trip.end);
  const afterScheduledEnd = extended && toMillis(occurredAt) > toMillis(trip.end);
  return afterScheduledEnd ? `${base}, after scheduled end, before actual return` : base;
}

const byStart = (a: Trip, b: Trip) => toMillis(a.start) - toMillis(b.start);

/** Match one toll against the trips. Assumes the toll is not a duplicate. */
export function matchToll(
  toll: Toll,
  fingerprint: string,
  trips: Trip[],
  bufferMinutes = DEFAULT_BUFFER_MINUTES,
): MatchResult {
  const plate = normalizePlate(toll.plate);
  const sameCar = trips.filter((trip) => normalizePlate(trip.plate) === plate).sort(byStart);
  const containing = sameCar.filter((trip) => strictlyContains(trip, toll.occurredAt));
  const base = { toll, fingerprint, candidates: [] as Trip[] };

  if (containing.length === 1) {
    const trip = containing[0];
    return {
      ...base,
      outcome: trip.source === 'direct' ? 'BILL_RENTER' : 'TURO_REIMBURSEMENT',
      trip,
      reason: matchedReason(trip, toll.occurredAt),
    };
  }

  if (containing.length > 1) {
    return {
      ...base,
      outcome: 'NEEDS_REVIEW',
      candidates: containing,
      reason: containedReason(containing, toll.occurredAt),
    };
  }

  const near = sameCar.filter((trip) => minutesOutside(trip, toll.occurredAt) <= bufferMinutes);
  if (near.length > 0) {
    // Nearest first; ties go to the earlier trip (sameCar is already sorted by start).
    const ranked = [...near].sort(
      (a, b) => minutesOutside(a, toll.occurredAt) - minutesOutside(b, toll.occurredAt),
    );
    return {
      ...base,
      outcome: 'NEEDS_REVIEW',
      suggestedTrip: ranked[0],
      candidates: ranked,
      reason: nearReason(ranked[0], toll.occurredAt, bufferMinutes),
    };
  }

  return { ...base, outcome: 'OPERATOR_EXPENSE', reason: 'No trip had this car at that time' };
}

/**
 * Match a whole statement. `seenFingerprints` holds every fingerprint from earlier uploads;
 * a fingerprint seen there, or earlier in this file, is a DUPLICATE.
 */
export function matchTolls(
  tolls: Toll[],
  trips: Trip[],
  seenFingerprints: ReadonlySet<string>,
  bufferMinutes = DEFAULT_BUFFER_MINUTES,
): MatchResult[] {
  const seenInFile = new Set<string>();
  return tolls.map((toll) => {
    const fingerprint = fingerprintOf(toll);
    const duplicateReason = seenFingerprints.has(fingerprint)
      ? 'Already imported in an earlier upload'
      : seenInFile.has(fingerprint)
        ? 'Appears earlier in this file'
        : null;
    seenInFile.add(fingerprint);
    if (duplicateReason) {
      return { toll, fingerprint, outcome: 'DUPLICATE', candidates: [], reason: duplicateReason };
    }
    return matchToll(toll, fingerprint, trips, bufferMinutes);
  });
}

/** A reviewer resolves a NEEDS_REVIEW row: assign it to one of its candidate trips, or expense it. */
export function applyReviewDecision(result: MatchResult, decision: ReviewDecision): MatchResult {
  if (result.outcome !== 'NEEDS_REVIEW') {
    throw new Error(`Only NEEDS_REVIEW tolls can be reviewed (got ${result.outcome})`);
  }
  if (decision.kind === 'expense') {
    return {
      ...result,
      outcome: 'OPERATOR_EXPENSE',
      suggestedTrip: undefined,
      candidates: [],
      reason: 'Marked as operator expense by reviewer',
    };
  }
  const trip = result.candidates.find((candidate) => candidate.id === decision.tripId);
  if (!trip) throw new Error(`Trip ${decision.tripId} is not a candidate for this toll`);
  return {
    ...result,
    outcome: trip.source === 'direct' ? 'BILL_RENTER' : 'TURO_REIMBURSEMENT',
    trip,
    suggestedTrip: undefined,
    candidates: [],
    reason: `Assigned to ${trip.id} by reviewer`,
  };
}

export type BucketTotals = Record<Outcome, { count: number; cents: number }>;

export function bucketTotals(results: MatchResult[]): BucketTotals {
  return Object.fromEntries(
    OUTCOMES.map((outcome) => {
      const inBucket = results.filter((r) => r.outcome === outcome);
      return [outcome, { count: inBucket.length, cents: sumCents(inBucket.map((r) => r.toll.amountCents)) }];
    }),
  ) as BucketTotals;
}
