// Display helpers for the UI. Domain values stay in UTC and cents; this is where they become text.
import { DateTime } from 'luxon';
import { effectiveEnd } from '../domain/matcher';
import { normalizePlate } from '../domain/plate';
import type { ChargeStatus, Outcome, Trip } from '../domain/types';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  BILL_RENTER: 'Charge renter',
  NEEDS_REVIEW: 'Needs review',
  TURO_REIMBURSEMENT: 'Turo reimbursement',
  OPERATOR_EXPENSE: 'Operator expense',
  DUPLICATE: 'Duplicate',
};

export const STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'Charging…',
  paid: 'Paid',
  needs_renter_action: 'Waiting on renter',
  failed: 'Failed',
};

/** "Oct 2, 2:12 PM EDT", in the timezone the statement was uploaded with. */
export function formatLocalTime(utcIso: string, zone: string): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' }).setZone(zone).toFormat('MMM d, h:mm a ZZZZ');
}

/** "Oct 1, 10:00 AM → Oct 4, 10:00 AM", in the trip's own offset. Shows the actual return when there is one. */
export function formatTripWindow(trip: Trip): string {
  const fmt = (iso: string) => DateTime.fromISO(iso, { setZone: true }).toFormat('MMM d, h:mm a');
  const window = `${fmt(trip.start)} → ${fmt(effectiveEnd(trip))}`;
  return trip.returnedAt ? `${window} (returned late, scheduled ${fmt(trip.end)})` : window;
}

/** The car for a plate, even when no trip matched the toll. */
export function carForPlate(trips: Trip[], plate: string): string | undefined {
  const normalized = normalizePlate(plate);
  return trips.find((trip) => normalizePlate(trip.plate) === normalized)?.car;
}
