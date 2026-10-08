// Charges: group BILL_RENTER tolls by trip, total them, and give each charge a stable idempotency key.
import { DateTime } from 'luxon';
import { sumCents } from './money';
import type { Charge, MatchResult, Trip } from './types';

export interface ChargeDraft {
  trip: Trip;
  tolls: MatchResult[]; // sorted by time
  tollFingerprints: string[]; // sorted
  tollCents: number;
  adminFeeCents: number;
  totalCents: number;
  idempotencyKey: string;
}

/** 64-bit FNV-1a, as 16 hex chars. Synchronous and deterministic; not for security. */
export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Same trip + same set of tolls → same key, whatever the order. */
export function idempotencyKey(tripId: string, fingerprints: string[]): string {
  const sorted = [...fingerprints].sort();
  return `tolls-${tripId}-${fnv1a64(sorted.join('\n'))}`;
}

/** Every toll that is already on a charge, whatever its status. Those tolls can't be charged again. */
export function chargedFingerprints(charges: Charge[]): Set<string> {
  return new Set(charges.flatMap((charge) => charge.tollFingerprints));
}

/**
 * One draft per trip, from BILL_RENTER tolls (matched or assigned by a reviewer) that haven't
 * been charged yet. total = tolls + adminFeeEach × number of tolls.
 */
export function buildChargeDrafts(
  results: MatchResult[],
  options: { adminFeeEachCents?: number; alreadyCharged?: ReadonlySet<string> } = {},
): ChargeDraft[] {
  const { adminFeeEachCents = 0, alreadyCharged = new Set<string>() } = options;
  const byTrip = new Map<string, { trip: Trip; tolls: MatchResult[] }>();

  for (const result of results) {
    if (result.outcome !== 'BILL_RENTER' || !result.trip) continue;
    if (alreadyCharged.has(result.fingerprint)) continue;
    const group = byTrip.get(result.trip.id) ?? { trip: result.trip, tolls: [] };
    group.tolls.push(result);
    byTrip.set(result.trip.id, group);
  }

  return [...byTrip.values()]
    .sort((a, b) => a.trip.id.localeCompare(b.trip.id))
    .map(({ trip, tolls }) => {
      const sortedTolls = [...tolls].sort(
        (a, b) =>
          DateTime.fromISO(a.toll.occurredAt).toMillis() - DateTime.fromISO(b.toll.occurredAt).toMillis(),
      );
      const fingerprints = sortedTolls.map((r) => r.fingerprint).sort();
      const tollCents = sumCents(sortedTolls.map((r) => r.toll.amountCents));
      const adminFeeCents = adminFeeEachCents * sortedTolls.length;
      return {
        trip,
        tolls: sortedTolls,
        tollFingerprints: fingerprints,
        tollCents,
        adminFeeCents,
        totalCents: tollCents + adminFeeCents,
        idempotencyKey: idempotencyKey(trip.id, fingerprints),
      };
    });
}
