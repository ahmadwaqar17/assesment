// The one seam between the app and a payment provider.

export interface ChargeRequest {
  tripId: string;
  amountCents: number;
  paymentMethodId: string | undefined; // the renter's saved card
  customerEmail?: string;
  description: string;
  idempotencyKey: string;
}

export type ChargeOutcome =
  | { status: 'paid'; paymentRef: string }
  | { status: 'needs_renter_action'; paymentRef: string; paymentLinkUrl: string }
  | { status: 'failed'; failureReason: string; paymentRef?: string };

export interface PaymentGateway {
  /** Charge a saved card. The same idempotency key must never charge twice; it returns the first outcome. */
  charge(request: ChargeRequest): Promise<ChargeOutcome>;
}
