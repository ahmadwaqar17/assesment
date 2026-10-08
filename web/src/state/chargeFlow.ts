// Approving a charge: record it as pending, ask the gateway, record the outcome.
import type { Dispatch } from 'react';
import type { ChargeDraft } from '../domain/charges';
import type { Charge } from '../domain/types';
import type { PaymentGateway } from '../payments/gateway';
import type { Action, AppState } from './reducer';
import { nowIso } from './clock';

export function draftToCharge(draft: ChargeDraft, createdAt: string): Charge {
  return {
    id: draft.idempotencyKey,
    tripId: draft.trip.id,
    tollFingerprints: draft.tollFingerprints,
    tollCents: draft.tollCents,
    adminFeeCents: draft.adminFeeCents,
    totalCents: draft.totalCents,
    idempotencyKey: draft.idempotencyKey,
    status: 'pending',
    createdAt,
  };
}

export async function chargeDraft(
  draft: ChargeDraft,
  deps: { gateway: PaymentGateway; dispatch: Dispatch<Action>; now?: () => string },
): Promise<void> {
  const { gateway, dispatch, now = nowIso } = deps;
  const charge = draftToCharge(draft, now());
  dispatch({ type: 'chargeStarted', charge });

  const tolls = draft.tolls.length === 1 ? '1 toll' : `${draft.tolls.length} tolls`;
  try {
    const outcome = await gateway.charge({
      tripId: draft.trip.id,
      amountCents: draft.totalCents,
      paymentMethodId: draft.trip.testCard,
      customerEmail: draft.trip.email,
      description: `Tolls for trip ${draft.trip.id} (${draft.trip.car}): ${tolls}`,
      idempotencyKey: draft.idempotencyKey,
    });
    dispatch({ type: 'chargeFinished', chargeId: charge.id, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dispatch({ type: 'chargeFinished', chargeId: charge.id, outcome: { status: 'failed', failureReason: message } });
  }
}

/**
 * A charge still 'pending' after a reload never got its answer. Ask the gateway again with the same
 * idempotency key: if the first request went through, we get its outcome back; if not, it runs once now.
 */
export async function resumePendingCharges(
  state: AppState,
  deps: { gateway: PaymentGateway; dispatch: Dispatch<Action> },
): Promise<void> {
  const pending = state.charges.filter((charge) => charge.status === 'pending');
  await Promise.all(
    pending.map(async (charge) => {
      const trip = state.trips.find((t) => t.id === charge.tripId);
      try {
        const outcome = await deps.gateway.charge({
          tripId: charge.tripId,
          amountCents: charge.totalCents,
          paymentMethodId: trip?.testCard,
          customerEmail: trip?.email,
          description: `Tolls for trip ${charge.tripId}`,
          idempotencyKey: charge.idempotencyKey,
        });
        deps.dispatch({ type: 'chargeFinished', chargeId: charge.id, outcome });
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : String(error);
        deps.dispatch({ type: 'chargeFinished', chargeId: charge.id, outcome: { status: 'failed', failureReason } });
      }
    }),
  );
}
