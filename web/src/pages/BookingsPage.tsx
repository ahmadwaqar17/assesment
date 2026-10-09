import type { ReactNode } from 'react';
import { formatCents, sumCents } from '../domain/money';
import { formatTripWindow, STATUS_LABELS } from '../components/format';
import type { Go } from '../navigation';
import { tollsByTrip, type TripTolls } from '../state/selectors';
import { useStore } from '../state/useStore';

export function BookingsPage({ go }: { go: Go }) {
  const { state } = useStore();
  const rows = tollsByTrip(state);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Bookings</h1>
        <p className="muted">Every trip, with the tolls driven during it and where each one stands.</p>
      </header>

      <div className="panel flush">
        <table className="table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Renter</th>
              <th>Car</th>
              <th>Trip</th>
              <th className="num">Tolls</th>
              <th>Toll status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tolls = [...row.billed, ...row.turo];
              return (
                <tr key={row.trip.id}>
                  <td className="nowrap">
                    {row.trip.id}{' '}
                    <span className={`badge source-${row.trip.source}`}>{row.trip.source === 'turo' ? 'Turo' : 'Direct'}</span>
                  </td>
                  <td>{row.trip.renter}</td>
                  <td>
                    {row.trip.car} <span className="muted mono">{row.trip.plate}</span>
                  </td>
                  <td className="small">{formatTripWindow(row.trip)}</td>
                  <td className="num">
                    {tolls.length > 0 ? (
                      <>
                        {formatCents(sumCents(tolls.map((r) => r.toll.amountCents)))}{' '}
                        <span className="muted small">({tolls.length})</span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <TollStatus row={row} go={go} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TollStatus({ row, go }: { row: TripTolls; go: Go }) {
  const parts: ReactNode[] = [];

  for (const charge of row.charges) {
    parts.push(
      <span key={charge.id} className="status-line">
        <span className={`chip chip-${charge.status}`}>{STATUS_LABELS[charge.status]}</span>
        <span className="money">{formatCents(charge.totalCents)}</span>
        {charge.status !== 'pending' && (
          <button
            className="link-button"
            onClick={() => go({ name: 'receipt', chargeId: charge.id, back: { name: 'bookings' } })}
          >
            Receipt
          </button>
        )}
      </span>,
    );
  }
  if (row.uncharged.count > 0) {
    parts.push(
      <span key="uncharged" className="status-line">
        <span className="chip chip-ready">{row.skipped ? 'Skipped' : 'Ready to charge'}</span>
        <span className="money">{formatCents(row.uncharged.cents)}</span>
        <button className="link-button" onClick={() => go({ name: 'tolls', view: 'approve' })}>
          {row.skipped ? 'Open' : 'Approve'}
        </button>
      </span>,
    );
  }
  if (row.turo.length > 0) {
    parts.push(
      <span key="turo" className="status-line">
        <span className="chip chip-turo">File with Turo</span>
        <span className="money">{formatCents(sumCents(row.turo.map((r) => r.toll.amountCents)))}</span>
      </span>,
    );
  }
  if (row.inReview.length > 0) {
    parts.push(
      <span key="review" className="status-line">
        <span className="chip chip-needs_renter_action">
          {row.inReview.length} toll{row.inReview.length === 1 ? '' : 's'} to review
        </span>
        <button className="link-button" onClick={() => go({ name: 'tolls', view: 'results', tab: 'NEEDS_REVIEW' })}>
          Decide
        </button>
      </span>,
    );
  }

  if (parts.length === 0) return <span className="muted">No tolls</span>;
  return <div className="status-stack">{parts}</div>;
}
