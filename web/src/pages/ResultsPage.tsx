import { Fragment, useState } from 'react';
import { bucketTotals, OUTCOMES } from '../domain/matcher';
import { formatCents } from '../domain/money';
import type { MatchResult, Outcome } from '../domain/types';
import { carForPlate, formatLocalTime, OUTCOME_LABELS } from '../components/format';
import { ReviewPanel } from '../components/ReviewPanel';
import { currentResult, type ImportedRow } from '../state/reducer';
import { useStore } from '../state/useStore';

const EMPTY_STATES: Record<Outcome, string> = {
  BILL_RENTER: 'No tolls to charge yet. Tolls that fall inside a direct trip land here.',
  NEEDS_REVIEW: 'Nothing to review. Every toll was matched with certainty.',
  TURO_REIMBURSEMENT: 'No Turo tolls. Tolls during Turo trips land here so you can file them with Turo.',
  OPERATOR_EXPENSE: 'No operator expenses. Tolls when nobody had the car land here.',
  DUPLICATE: 'No duplicates. Rows already imported before land here and are ignored.',
};

interface Props {
  initialTab?: Outcome;
  onUpload: () => void;
  onApprove: () => void;
}

export function ResultsPage({ initialTab = 'BILL_RENTER', onUpload, onApprove }: Props) {
  const { state } = useStore();
  const [tab, setTab] = useState<Outcome>(initialTab);

  if (state.rows.length === 0) {
    return (
      <section className="page">
        <div className="panel empty">
          <h2>No tolls yet</h2>
          <p className="muted">Upload a toll statement to see who owes each toll.</p>
          <button className="button primary" onClick={onUpload}>
            Upload a statement
          </button>
        </div>
      </section>
    );
  }

  const rows = state.rows.map((row) => ({ row, result: currentResult(state, row) }));
  const totals = bucketTotals(rows.map((r) => r.result));
  const visible = rows.filter((r) => r.result.outcome === tab);

  return (
    <section className="page">
      <header className="page-header with-action">
        <div>
          <h2>Toll results</h2>
          <p className="muted">
            {state.rows.length} rows from {state.uploads.length} upload{state.uploads.length === 1 ? '' : 's'}.
            A renter is only charged automatically when the toll falls strictly inside their trip.
          </p>
        </div>
        <button className="button primary" onClick={onApprove}>
          Approve charges →
        </button>
      </header>

      <div className="tabs" role="tablist">
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            role="tab"
            aria-selected={tab === outcome}
            className={`tab tab-${outcome.toLowerCase()}${tab === outcome ? ' active' : ''}`}
            onClick={() => setTab(outcome)}
          >
            <span className="tab-label">{OUTCOME_LABELS[outcome]}</span>
            <span className="tab-meta">
              <span className="count">
                {totals[outcome].count} toll{totals[outcome].count === 1 ? '' : 's'}
              </span>
              <span className="amount">{formatCents(totals[outcome].cents)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="panel flush">
        {visible.length === 0 ? (
          <p className="empty muted">{EMPTY_STATES[tab]}</p>
        ) : (
          <TollTable rows={visible} />
        )}
      </div>
    </section>
  );
}

function TollTable({ rows }: { rows: { row: ImportedRow; result: MatchResult }[] }) {
  const { state } = useStore();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Local time</th>
          <th>Car</th>
          <th>Plate</th>
          <th>Plaza</th>
          <th className="num">Amount</th>
          <th>Trip / renter</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ row, result }) => {
          const review = state.reviews[row.id];
          const needsReview = result.outcome === 'NEEDS_REVIEW';
          return (
            <Fragment key={row.id}>
              <tr className={needsReview ? 'review-row' : undefined}>
                <td className="nowrap">{formatLocalTime(result.toll.occurredAt, result.toll.timezone)}</td>
                <td>{result.trip?.car ?? carForPlate(state.trips, result.toll.plate) ?? '—'}</td>
                <td className="mono">{result.toll.plate}</td>
                <td>{result.toll.plaza}</td>
                <td className="num">{formatCents(result.toll.amountCents)}</td>
                <td>
                  <TripCell result={result} />
                </td>
                <td className="reason">
                  {result.reason}
                  {review && (
                    <span className="resolved-note">
                      <span className="badge">Resolved by operator</span>{' '}
                      <span className="muted">
                        {formatLocalTime(review.resolvedAt, result.toll.timezone)}. Matcher said: {row.match.reason}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
              {needsReview && (
                <tr className="review-row">
                  <td colSpan={7}>
                    <ReviewPanel row={row} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function TripCell({ result }: { result: MatchResult }) {
  if (result.trip) {
    return (
      <>
        {result.trip.renter} <span className="muted">· {result.trip.id}</span>
      </>
    );
  }
  if (result.suggestedTrip) {
    return (
      <>
        <span className="muted">Suggested:</span> {result.suggestedTrip.renter}{' '}
        <span className="muted">· {result.suggestedTrip.id}</span>
      </>
    );
  }
  if (result.candidates.length > 0) {
    return <span className="muted">{result.candidates.map((t) => t.id).join(' or ')}</span>;
  }
  return <span className="muted">—</span>;
}
