import { describe, expect, it } from 'vitest';
import sampleCsv from '../../public/sample-tolls.csv?raw';
import { parseStatement } from '../domain/statement';
import { FakeGateway } from '../payments/fakeGateway';
import { chargeDraft } from './chargeFlow';
import { reducer, seedState, type Action, type AppState } from './reducer';
import { chargeDrafts, dashboardSummary, tollsByCar, tollsByTrip } from './selectors';

function imported(state = seedState(), uploadId = 'u1'): AppState {
  const parsed = parseStatement(sampleCsv, 'America/New_York');
  if (!parsed.ok) throw new Error('bad sample');
  return reducer(state, {
    type: 'importStatement', uploadId, fileName: 'sample-tolls.csv', timezone: 'America/New_York',
    importedAt: '2026-10-08T12:00:00.000Z', tolls: parsed.tolls,
  });
}

function makeStore(initial: AppState) {
  const store = { state: initial, dispatch: (action: Action) => void (store.state = reducer(store.state, action)) };
  return store;
}

const trip = (state: AppState, id: string) => tollsByTrip(state).find((t) => t.trip.id === id)!;
const car = (state: AppState, plate: string) => tollsByCar(state).find((c) => c.plate === plate)!;

describe('tollsByTrip', () => {
  it('lists every booking, with no tolls before any statement', () => {
    const rows = tollsByTrip(seedState());
    expect(rows.map((r) => r.trip.id)).toEqual(['T1005', 'T1001', 'T1003', 'T1004', 'T1002', 'T1006']);
    expect(rows.every((r) => r.billed.length === 0 && r.charges.length === 0)).toBe(true);
  });

  it('shows what each booking owes, what is in review and what goes to Turo', () => {
    const state = imported();
    expect(trip(state, 'T1001')).toMatchObject({ uncharged: { count: 2, cents: 2238 } });
    expect(trip(state, 'T1001').inReview.map((r) => r.toll.externalId)).toEqual(['TX-1004']);
    expect(trip(state, 'T1002').inReview.map((r) => r.toll.externalId)).toEqual(['TX-1004']);
    expect(trip(state, 'T1004').inReview.map((r) => r.toll.externalId)).toEqual(['TX-1007', 'TX-1011']);
    expect(trip(state, 'T1003').turo.map((r) => r.toll.amountCents)).toEqual([910]);
  });

  it('moves tolls from uncharged to a charge once approved', async () => {
    const store = makeStore(imported());
    await chargeDraft(chargeDrafts(store.state)[0], { gateway: new FakeGateway({ delayMs: 0 }), dispatch: store.dispatch });
    expect(trip(store.state, 'T1001')).toMatchObject({ uncharged: { count: 0, cents: 0 } });
    expect(trip(store.state, 'T1001').charges.map((c) => c.status)).toEqual(['paid']);
    expect(trip(store.state, 'T1001').billed).toHaveLength(2);
  });
});

describe('tollsByCar', () => {
  it('splits each car’s tolls into recovered, outstanding, Turo, review and absorbed, ignoring duplicates', async () => {
    const store = makeStore(imported(imported(), 'u2')); // second upload is all duplicates
    await chargeDraft(chargeDrafts(store.state).find((d) => d.trip.id === 'T1001')!, {
      gateway: new FakeGateway({ delayMs: 0 }),
      dispatch: store.dispatch,
    });
    expect(car(store.state, 'FLX-4821')).toEqual({
      plate: 'FLX-4821', car: 'Toyota RAV4 2022', tollCount: 4, totalCents: 475 + 1763 + 1338 + 694,
      recoveredCents: 2238, outstandingCents: 1338, turoCents: 0, reviewCents: 694, absorbedCents: 0,
    });
    expect(car(store.state, 'EVT-1180')).toMatchObject({ outstandingCents: 2457, absorbedCents: 1338 });
    expect(car(store.state, 'KTR-9935')).toMatchObject({ turoCents: 910 });
  });

  it('accounts for every non-duplicate cent exactly once', () => {
    const state = imported();
    for (const c of tollsByCar(state)) {
      expect(c.recoveredCents + c.outstandingCents + c.turoCents + c.reviewCents + c.absorbedCents).toBe(c.totalCents);
    }
    const total = tollsByCar(state).reduce((sum, c) => sum + c.totalCents, 0);
    expect(total).toBe(7133 + 2352 + 910 + 1338);
  });

  it('lists a toll for a plate with no bookings as an unknown car', () => {
    const state = reducer(seedState(), {
      type: 'importStatement', uploadId: 'u', fileName: 'x.csv', timezone: 'America/New_York', importedAt: 'now',
      tolls: [{ plate: 'ZZZ 999', occurredAt: '2026-10-02T12:00:00.000Z', timezone: 'America/New_York', plaza: 'P', amountCents: 400 }],
    });
    expect(car(state, 'ZZZ 999')).toMatchObject({ car: 'Unknown car', absorbedCents: 400 });
  });
});

describe('dashboardSummary', () => {
  it('is empty before any statement', () => {
    expect(dashboardSummary(seedState())).toMatchObject({ hasStatements: false, ready: { count: 0, cents: 0 } });
  });

  it('sums what Carisma has ready after the sample statement', () => {
    expect(dashboardSummary(imported())).toEqual({
      hasStatements: true,
      ready: { count: 5, cents: 7133 },
      review: { count: 3, cents: 2352 },
      turo: { count: 1, cents: 910 },
      waitingOnRenter: [],
      failed: [],
      recoveredCents: 0,
      absorbedCents: 1338,
    });
  });

  it('includes the admin fee, leaves out skipped trips, and tracks outcomes', async () => {
    let state = reducer(imported(), { type: 'updateSettings', settings: { adminFeeEachCents: 100 } });
    state = reducer(state, { type: 'skipTrip', tripId: 'T1002' });
    expect(dashboardSummary(state).ready).toEqual({ count: 4, cents: 7133 - 1338 + 600 });

    const store = makeStore(state);
    const gateway = new FakeGateway({ delayMs: 0 });
    for (const tripId of ['T1001', 'T1005', 'T1006']) {
      await chargeDraft(chargeDrafts(store.state).find((d) => d.trip.id === tripId)!, { gateway, dispatch: store.dispatch });
    }
    const summary = dashboardSummary(store.state);
    expect(summary.ready.count).toBe(1); // only Lisa left
    expect(summary.recoveredCents).toBe(2238);
    expect(summary.waitingOnRenter.map((c) => c.tripId)).toEqual(['T1005']);
    expect(summary.failed.map((c) => c.tripId)).toEqual(['T1006']);
  });
});
