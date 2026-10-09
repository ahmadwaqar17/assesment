// Read-only views of app state for the operator's existing screens: Dashboard, Bookings, Fleet.
import { buildChargeDrafts, chargedFingerprints, type ChargeDraft } from '../domain/charges';
import { sumCents } from '../domain/money';
import { normalizePlate } from '../domain/plate';
import type { Charge, MatchResult, Trip } from '../domain/types';
import { currentResults, type AppState } from './reducer';

const cents = (results: MatchResult[]) => sumCents(results.map((r) => r.toll.amountCents));

/** Drafts waiting for the operator's OK (skipped trips excluded), with the admin fee from settings. */
export function chargeDrafts(state: AppState): ChargeDraft[] {
  return buildChargeDrafts(currentResults(state), {
    adminFeeEachCents: state.settings.adminFeeEachCents,
    alreadyCharged: chargedFingerprints(state.charges),
  });
}

export interface TripTolls {
  trip: Trip;
  billed: MatchResult[]; // tolls this renter owes (charged or not)
  turo: MatchResult[]; // tolls to file with Turo
  inReview: MatchResult[]; // unresolved tolls that might belong to this trip
  charges: Charge[];
  uncharged: { count: number; cents: number }; // billed tolls not on any charge yet
  skipped: boolean;
}

/** Toll status per booking, for the Bookings page. Trips in pickup order. */
export function tollsByTrip(state: AppState): TripTolls[] {
  const results = currentResults(state);
  const charged = chargedFingerprints(state.charges);
  return [...state.trips]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((trip) => {
      const billed = results.filter((r) => r.outcome === 'BILL_RENTER' && r.trip?.id === trip.id);
      const unchargedResults = billed.filter((r) => !charged.has(r.fingerprint));
      return {
        trip,
        billed,
        turo: results.filter((r) => r.outcome === 'TURO_REIMBURSEMENT' && r.trip?.id === trip.id),
        inReview: results.filter(
          (r) => r.outcome === 'NEEDS_REVIEW' && r.candidates.some((candidate) => candidate.id === trip.id),
        ),
        charges: state.charges.filter((charge) => charge.tripId === trip.id),
        uncharged: { count: unchargedResults.length, cents: cents(unchargedResults) },
        skipped: state.skippedTripIds.includes(trip.id),
      };
    });
}

export interface CarTolls {
  plate: string; // as written on the trips (or the statement, for an unknown car)
  car: string;
  tollCount: number;
  totalCents: number;
  recoveredCents: number; // on a paid charge
  outstandingCents: number; // the renter owes it, but it isn't paid yet
  turoCents: number; // to file with Turo
  reviewCents: number; // waiting for a human decision
  absorbedCents: number; // operator expense: a cost on this car
}

/** Toll money per car, for the Fleet page. Duplicates are ignored. Admin fees are not tolls, so not counted. */
export function tollsByCar(state: AppState): CarTolls[] {
  const paid = new Set(
    state.charges.filter((c) => c.status === 'paid').flatMap((c) => c.tollFingerprints),
  );
  const cars = new Map<string, CarTolls>();
  for (const trip of state.trips) {
    const key = normalizePlate(trip.plate);
    if (!cars.has(key)) cars.set(key, emptyCar(trip.plate, trip.car));
  }

  for (const result of currentResults(state)) {
    if (result.outcome === 'DUPLICATE') continue;
    const key = normalizePlate(result.toll.plate);
    const car = cars.get(key) ?? emptyCar(result.toll.plate, 'Unknown car');
    cars.set(key, car);
    const amount = result.toll.amountCents;
    car.tollCount += 1;
    car.totalCents += amount;
    switch (result.outcome) {
      case 'BILL_RENTER':
        if (paid.has(result.fingerprint)) car.recoveredCents += amount;
        else car.outstandingCents += amount;
        break;
      case 'TURO_REIMBURSEMENT':
        car.turoCents += amount;
        break;
      case 'NEEDS_REVIEW':
        car.reviewCents += amount;
        break;
      case 'OPERATOR_EXPENSE':
        car.absorbedCents += amount;
        break;
    }
  }
  return [...cars.values()];
}

function emptyCar(plate: string, car: string): CarTolls {
  return {
    plate,
    car,
    tollCount: 0,
    totalCents: 0,
    recoveredCents: 0,
    outstandingCents: 0,
    turoCents: 0,
    reviewCents: 0,
    absorbedCents: 0,
  };
}

export interface DashboardSummary {
  hasStatements: boolean;
  ready: { count: number; cents: number }; // charges waiting for the operator's OK (incl. admin fee)
  review: { count: number; cents: number };
  turo: { count: number; cents: number };
  waitingOnRenter: Charge[];
  failed: Charge[];
  recoveredCents: number;
  absorbedCents: number;
}

export function dashboardSummary(state: AppState): DashboardSummary {
  const results = currentResults(state);
  const ready = chargeDrafts(state).filter((d) => !state.skippedTripIds.includes(d.trip.id));
  const review = results.filter((r) => r.outcome === 'NEEDS_REVIEW');
  const turo = results.filter((r) => r.outcome === 'TURO_REIMBURSEMENT');
  const cars = tollsByCar(state);
  return {
    hasStatements: state.uploads.length > 0,
    ready: { count: ready.length, cents: sumCents(ready.map((d) => d.totalCents)) },
    review: { count: review.length, cents: cents(review) },
    turo: { count: turo.length, cents: cents(turo) },
    waitingOnRenter: state.charges.filter((c) => c.status === 'needs_renter_action'),
    failed: state.charges.filter((c) => c.status === 'failed'),
    recoveredCents: sumCents(cars.map((c) => c.recoveredCents)),
    absorbedCents: sumCents(cars.map((c) => c.absorbedCents)),
  };
}
