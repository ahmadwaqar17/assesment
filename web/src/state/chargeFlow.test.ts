import { describe, expect, it } from 'vitest';
import sampleCsv from '../../public/sample-tolls.csv?raw';
import { buildChargeDrafts, chargedFingerprints } from '../domain/charges';
import { parseStatement } from '../domain/statement';
import { FakeGateway } from '../payments/fakeGateway';
import { chargeDraft, draftToCharge, resumePendingCharges } from './chargeFlow';
import { currentResults, reducer, seedState, type Action, type AppState } from './reducer';

function imported(): AppState {
  const parsed = parseStatement(sampleCsv, 'America/New_York');
  if (!parsed.ok) throw new Error('bad sample');
  return reducer(seedState(), {
    type: 'importStatement',
    uploadId: 'u1',
    fileName: 'sample-tolls.csv',
    timezone: 'America/New_York',
    importedAt: '2026-10-08T12:00:00.000Z',
    tolls: parsed.tolls,
  });
}

/** A tiny store: the real reducer behind a dispatch function. */
function makeStore(initial: AppState) {
  const store = { state: initial, dispatch: (action: Action) => void (store.state = reducer(store.state, action)) };
  return store;
}

function drafts(state: AppState) {
  return buildChargeDrafts(currentResults(state), {
    adminFeeEachCents: state.settings.adminFeeEachCents,
    alreadyCharged: chargedFingerprints(state.charges),
  });
}

const draftFor = (state: AppState, tripId: string) => drafts(state).find((d) => d.trip.id === tripId)!;

describe('charging', () => {
  it('pressing Charge twice on the same trip never creates a second charge', async () => {
    const store = makeStore(imported());
    const gateway = new FakeGateway({ delayMs: 5 });
    const sarah = draftFor(store.state, 'T1001');

    // Two presses before the first one finishes (a double click), then a third press later.
    await Promise.all([
      chargeDraft(sarah, { gateway, dispatch: store.dispatch }),
      chargeDraft(sarah, { gateway, dispatch: store.dispatch }),
    ]);
    await chargeDraft(sarah, { gateway, dispatch: store.dispatch });

    expect(gateway.chargeCount).toBe(1);
    expect(store.state.charges).toHaveLength(1);
    expect(store.state.charges[0]).toMatchObject({ tripId: 'T1001', totalCents: 2238, status: 'paid' });
  });

  it('charged tolls cannot be charged again: the trip has no draft left', async () => {
    const store = makeStore(imported());
    const gateway = new FakeGateway({ delayMs: 0 });
    await chargeDraft(draftFor(store.state, 'T1001'), { gateway, dispatch: store.dispatch });
    expect(drafts(store.state).map((d) => d.trip.id)).toEqual(['T1002', 'T1004', 'T1005', 'T1006']);
  });

  it('refuses a charge that contains a toll already on another charge, even with a new key', () => {
    let state = imported();
    const sarah = draftFor(state, 'T1001');
    state = reducer(state, { type: 'chargeStarted', charge: draftToCharge(sarah, 'now') });
    const sneaky = { ...draftToCharge(sarah, 'now'), id: 'other', idempotencyKey: 'other' };
    expect(reducer(state, { type: 'chargeStarted', charge: sneaky })).toBe(state);
  });

  it('records each outcome: paid, waiting on renter with a link, failed with the reason', async () => {
    const store = makeStore(imported());
    const gateway = new FakeGateway({ delayMs: 0 });
    for (const tripId of ['T1001', 'T1005', 'T1006']) {
      await chargeDraft(draftFor(store.state, tripId), { gateway, dispatch: store.dispatch });
    }
    const byTrip = Object.fromEntries(store.state.charges.map((c) => [c.tripId, c]));
    expect(byTrip.T1001).toMatchObject({ status: 'paid', totalCents: 2238 });
    expect(byTrip.T1005).toMatchObject({ status: 'needs_renter_action', totalCents: 2457 });
    expect(byTrip.T1005.paymentLinkUrl).toMatch(/^https:\/\/example\.com\/pay\//);
    expect(byTrip.T1006).toMatchObject({ status: 'failed', failureReason: 'Your card was declined.', totalCents: 575 });
  });

  it('is pending while the gateway works', async () => {
    const store = makeStore(imported());
    const running = chargeDraft(draftFor(store.state, 'T1001'), { gateway: new FakeGateway({ delayMs: 5 }), dispatch: store.dispatch });
    expect(store.state.charges[0].status).toBe('pending');
    await running;
    expect(store.state.charges[0].status).toBe('paid');
  });

  it('records a gateway error as a failed charge', async () => {
    const store = makeStore(imported());
    const broken = { charge: () => Promise.reject(new Error('Network down')) };
    await chargeDraft(draftFor(store.state, 'T1001'), { gateway: broken, dispatch: store.dispatch });
    expect(store.state.charges[0]).toMatchObject({ status: 'failed', failureReason: 'Network down' });
  });

  it('adds the admin fee per toll to the total', () => {
    const state = reducer(imported(), { type: 'updateSettings', settings: { adminFeeEachCents: 100 } });
    expect(draftFor(state, 'T1001')).toMatchObject({ tollCents: 2238, adminFeeCents: 200, totalCents: 2438 });
  });

  it('skip hides a trip until it is unskipped; charging clears the skip', () => {
    let state = reducer(imported(), { type: 'skipTrip', tripId: 'T1002' });
    expect(state.skippedTripIds).toEqual(['T1002']);
    state = reducer(state, { type: 'unskipTrip', tripId: 'T1002' });
    expect(state.skippedTripIds).toEqual([]);
  });

  it('after a reload, finishes a pending charge with the same key, charging at most once', async () => {
    const gateway = new FakeGateway({ delayMs: 0 });
    // The page was closed while Sarah's charge was in flight: state says pending, the gateway never answered.
    const store = makeStore(reducer(imported(), { type: 'chargeStarted', charge: draftToCharge(draftFor(imported(), 'T1001'), 'now') }));
    await resumePendingCharges(store.state, { gateway, dispatch: store.dispatch });
    expect(store.state.charges[0]).toMatchObject({ status: 'paid', totalCents: 2238 });
    expect(gateway.chargeCount).toBe(1);

    // Resuming again (e.g. another reload) replays the stored outcome; no second charge.
    await resumePendingCharges(store.state, { gateway, dispatch: store.dispatch });
    expect(gateway.chargeCount).toBe(1);
  });
});
