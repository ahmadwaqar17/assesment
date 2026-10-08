// Core domain types. Pure TypeScript: no React, no browser APIs.

export type Source = 'direct' | 'turo';

export type Outcome =
  | 'BILL_RENTER'
  | 'TURO_REIMBURSEMENT'
  | 'OPERATOR_EXPENSE'
  | 'NEEDS_REVIEW'
  | 'DUPLICATE';

export interface Trip {
  id: string;
  car: string;
  plate: string;
  renter: string;
  email?: string;
  source: Source;
  start: string; // ISO with offset
  end: string; // scheduled end, ISO with offset
  returnedAt?: string; // actual return, ISO with offset
  testCard?: string;
}

export interface Toll {
  plate: string; // as written on the statement
  occurredAt: string; // UTC ISO
  timezone: string; // statement timezone, used to show local time
  plaza: string;
  amountCents: number;
  externalId?: string; // transaction_id from the statement
}

export interface MatchResult {
  toll: Toll;
  fingerprint: string;
  outcome: Outcome;
  trip?: Trip; // the matched trip (BILL_RENTER / TURO_REIMBURSEMENT)
  suggestedTrip?: Trip; // NEEDS_REVIEW only: the nearest trip, when there is one
  candidates: Trip[]; // NEEDS_REVIEW only: trips the reviewer can choose from
  reason: string;
}

export type ReviewDecision =
  | { kind: 'assign'; tripId: string }
  | { kind: 'expense' };

export type ChargeStatus = 'pending' | 'paid' | 'needs_renter_action' | 'failed';

export interface Charge {
  id: string;
  tripId: string;
  tollFingerprints: string[];
  tollCents: number;
  adminFeeCents: number;
  totalCents: number;
  idempotencyKey: string;
  status: ChargeStatus;
  paymentRef?: string;
  paymentLinkUrl?: string;
  failureReason?: string;
  createdAt: string;
}
