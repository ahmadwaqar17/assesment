// App state as a pure reducer: no React here, so it's easy to test.
import { OPERATOR_TIMEZONE, SEED_TRIPS } from '../data/trips';
import { applyReviewDecision, DEFAULT_BUFFER_MINUTES, matchTolls } from '../domain/matcher';
import type { Charge, MatchResult, ReviewDecision, Toll, Trip } from '../domain/types';
import type { ChargeOutcome } from '../payments/gateway';

export interface Settings {
  bufferMinutes: number;
  adminFeeEachCents: number;
  timezone: string; // default timezone for new statements
}

export interface Upload {
  id: string;
  fileName: string;
  timezone: string;
  importedAt: string;
  rowCount: number;
}

/** One statement row as it was matched on import. Review decisions are kept separately. */
export interface ImportedRow {
  id: string; // `${uploadId}:${rowNumber}`
  uploadId: string;
  rowNumber: number; // row in the CSV file (header is row 1)
  match: MatchResult;
}

/** The record that a human resolved a NEEDS_REVIEW row. */
export interface Review {
  decision: ReviewDecision;
  resolvedAt: string;
}

export interface AppState {
  version: 1;
  trips: Trip[];
  uploads: Upload[];
  rows: ImportedRow[];
  reviews: Record<string, Review>; // by row id
  charges: Charge[];
  skippedTripIds: string[]; // trips the operator chose not to charge (for now)
  settings: Settings;
}

export type Action =
  | {
      type: 'importStatement';
      uploadId: string;
      fileName: string;
      timezone: string;
      importedAt: string;
      tolls: Toll[];
    }
  | { type: 'resolveReview'; rowId: string; decision: ReviewDecision; resolvedAt: string }
  | { type: 'chargeStarted'; charge: Charge }
  | { type: 'chargeFinished'; chargeId: string; outcome: ChargeOutcome }
  | { type: 'skipTrip'; tripId: string }
  | { type: 'unskipTrip'; tripId: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'resetDemo' };

export const DEFAULT_SETTINGS: Settings = {
  bufferMinutes: DEFAULT_BUFFER_MINUTES,
  adminFeeEachCents: 0,
  timezone: OPERATOR_TIMEZONE,
};

export function seedState(): AppState {
  return {
    version: 1,
    trips: structuredClone(SEED_TRIPS),
    uploads: [],
    rows: [],
    reviews: {},
    charges: [],
    skippedTripIds: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Every fingerprint imported so far. Passed to the matcher so re-uploads become duplicates. */
export function seenFingerprints(state: AppState): Set<string> {
  return new Set(state.rows.map((row) => row.match.fingerprint));
}

/** A row's result after any human review. */
/** Every row's result after review. */
export function currentResults(state: AppState): MatchResult[] {
  return state.rows.map((row) => currentResult(state, row));
}

/** The tolls on a charge, in time order. Duplicate rows share a fingerprint, so only billed rows count. */
export function tollsForCharge(state: AppState, charge: Charge): MatchResult[] {
  const fingerprints = new Set(charge.tollFingerprints);
  return currentResults(state)
    .filter((r) => r.outcome === 'BILL_RENTER' && fingerprints.has(r.fingerprint))
    .sort((a, b) => a.toll.occurredAt.localeCompare(b.toll.occurredAt));
}

export function currentResult(state: AppState, row: ImportedRow): MatchResult {
  const review = state.reviews[row.id];
  return review ? applyReviewDecision(row.match, review.decision) : row.match;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'importStatement': {
      const results = matchTolls(action.tolls, state.trips, seenFingerprints(state), state.settings.bufferMinutes);
      const rows: ImportedRow[] = results.map((match, index) => ({
        id: `${action.uploadId}:${index + 2}`,
        uploadId: action.uploadId,
        rowNumber: index + 2,
        match,
      }));
      const upload: Upload = {
        id: action.uploadId,
        fileName: action.fileName,
        timezone: action.timezone,
        importedAt: action.importedAt,
        rowCount: rows.length,
      };
      return { ...state, uploads: [...state.uploads, upload], rows: [...state.rows, ...rows] };
    }

    case 'resolveReview': {
      const row = state.rows.find((r) => r.id === action.rowId);
      // Only an unresolved NEEDS_REVIEW row can be resolved, and only to one of its candidates.
      if (!row || row.match.outcome !== 'NEEDS_REVIEW' || state.reviews[row.id]) return state;
      if (action.decision.kind === 'assign') {
        const tripId = action.decision.tripId;
        if (!row.match.candidates.some((trip) => trip.id === tripId)) return state;
      }
      return {
        ...state,
        reviews: { ...state.reviews, [row.id]: { decision: action.decision, resolvedAt: action.resolvedAt } },
      };
    }

    case 'chargeStarted': {
      // Never a second charge: not for the same key, and not for a toll that's already on a charge.
      const { charge } = action;
      const charged = new Set(state.charges.flatMap((c) => c.tollFingerprints));
      if (state.charges.some((c) => c.idempotencyKey === charge.idempotencyKey)) return state;
      if (charge.tollFingerprints.some((fp) => charged.has(fp))) return state;
      return {
        ...state,
        charges: [...state.charges, charge],
        skippedTripIds: state.skippedTripIds.filter((id) => id !== charge.tripId),
      };
    }

    case 'chargeFinished': {
      const { outcome } = action;
      return {
        ...state,
        charges: state.charges.map((charge) => {
          if (charge.id !== action.chargeId || charge.status !== 'pending') return charge;
          return {
            ...charge,
            status: outcome.status,
            paymentRef: outcome.paymentRef,
            paymentLinkUrl: outcome.status === 'needs_renter_action' ? outcome.paymentLinkUrl : undefined,
            failureReason: outcome.status === 'failed' ? outcome.failureReason : undefined,
          };
        }),
      };
    }

    case 'skipTrip':
      if (state.skippedTripIds.includes(action.tripId)) return state;
      return { ...state, skippedTripIds: [...state.skippedTripIds, action.tripId] };

    case 'unskipTrip':
      return { ...state, skippedTripIds: state.skippedTripIds.filter((id) => id !== action.tripId) };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'resetDemo':
      return seedState();
  }
}
