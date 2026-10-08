// The human decision for a NEEDS_REVIEW toll: pick one of the candidate trips, or call it an operator expense.
import { formatTripWindow } from './format';
import type { ImportedRow } from '../state/reducer';
import { nowIso } from '../state/clock';
import { useStore } from '../state/useStore';

export function ReviewPanel({ row }: { row: ImportedRow }) {
  const { dispatch } = useStore();
  const { candidates, suggestedTrip } = row.match;

  function resolve(decision: { kind: 'assign'; tripId: string } | { kind: 'expense' }) {
    dispatch({ type: 'resolveReview', rowId: row.id, decision, resolvedAt: nowIso() });
  }

  return (
    <div className="review-box" aria-label={`Review row ${row.rowNumber}`}>
      <span className="small muted">Who had the car? Pick a trip, or keep the cost yourself.</span>
      <div className="candidates">
        {candidates.map((trip) => (
          <div key={trip.id} className={`candidate${trip.id === suggestedTrip?.id ? ' suggested' : ''}`}>
            <div className="candidate-info">
              <span>
                <strong>{trip.renter}</strong> <span className="muted">· {trip.car} · {trip.id}</span>{' '}
                <span className={`badge source-${trip.source}`}>{trip.source === 'turo' ? 'Turo' : 'Direct'}</span>
                {trip.id === suggestedTrip?.id && <span className="badge"> Suggested</span>}
              </span>
              <span className="small muted">{formatTripWindow(trip)}</span>
            </div>
            <button
              className="button small"
              onClick={() => resolve({ kind: 'assign', tripId: trip.id })}
              aria-label={`Assign to ${trip.renter} (${trip.id})`}
            >
              {trip.source === 'turo' ? 'Assign: file with Turo' : 'Assign: charge renter'}
            </button>
          </div>
        ))}
      </div>
      <div className="review-actions">
        <button className="button small" onClick={() => resolve({ kind: 'expense' })}>
          Operator expense
        </button>
      </div>
    </div>
  );
}
