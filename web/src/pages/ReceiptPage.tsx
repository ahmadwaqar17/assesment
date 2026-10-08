import { DateTime } from 'luxon';
import { formatCents } from '../domain/money';
import { OPERATOR_NAME } from '../data/operator';
import { OPERATOR_TIMEZONE } from '../data/trips';
import { formatLocalTime, formatTripWindow, STATUS_LABELS } from '../components/format';
import { tollsForCharge } from '../state/reducer';
import { useStore } from '../state/useStore';

interface Props {
  chargeId: string;
  onBack: () => void;
}

export function ReceiptPage({ chargeId, onBack }: Props) {
  const { state } = useStore();
  const charge = state.charges.find((c) => c.id === chargeId);
  const trip = charge && state.trips.find((t) => t.id === charge.tripId);

  if (!charge || !trip) {
    return (
      <section className="page">
        <div className="panel empty">
          <h1>Receipt not found</h1>
          <p className="muted">This charge no longer exists. It may have been cleared by Reset demo.</p>
          <button className="button" onClick={onBack}>
            Back to charges
          </button>
        </div>
      </section>
    );
  }

  const tolls = tollsForCharge(state, charge);
  const issued = DateTime.fromISO(charge.createdAt).setZone(OPERATOR_TIMEZONE).toFormat('MMM d, yyyy, h:mm a ZZZZ');

  return (
    <section className="page receipt-page">
      <div className="receipt-toolbar no-print">
        <button className="button subtle" onClick={onBack}>
          ← Back to charges
        </button>
        <button className="button primary" onClick={() => window.print()}>
          Print receipt
        </button>
      </div>

      <article className="panel receipt" aria-label="Toll receipt">
        <header className="receipt-header">
          <div>
            <div className="receipt-operator">{OPERATOR_NAME}</div>
            <h1>Toll receipt</h1>
          </div>
          <dl className="receipt-meta">
            <dt>Issued</dt>
            <dd>{issued}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`chip chip-${charge.status}`}>{STATUS_LABELS[charge.status]}</span>
            </dd>
            <dt>Payment reference</dt>
            <dd className="mono">{charge.paymentRef ?? '—'}</dd>
          </dl>
        </header>

        <dl className="receipt-details">
          <div>
            <dt>Renter</dt>
            <dd>
              {trip.renter}
              {trip.email && <span className="muted"> · {trip.email}</span>}
            </dd>
          </div>
          <div>
            <dt>Trip</dt>
            <dd>{trip.id}</dd>
          </div>
          <div>
            <dt>Car</dt>
            <dd>
              {trip.car} · <span className="mono">{trip.plate}</span>
            </dd>
          </div>
          <div>
            <dt>Trip window</dt>
            <dd>{formatTripWindow(trip)}</dd>
          </div>
        </dl>

        <table className="table receipt-table">
          <thead>
            <tr>
              <th>Local time</th>
              <th>Plaza</th>
              <th>Transaction</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {tolls.map((result) => (
              <tr key={result.fingerprint}>
                <td className="nowrap">{formatLocalTime(result.toll.occurredAt, result.toll.timezone)}</td>
                <td>{result.toll.plaza}</td>
                <td className="mono muted">{result.toll.externalId ?? '—'}</td>
                <td className="num">{formatCents(result.toll.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Tolls</td>
              <td className="num">{formatCents(charge.tollCents)}</td>
            </tr>
            {charge.adminFeeCents > 0 && (
              <tr>
                <td colSpan={3}>
                  Admin fee ({tolls.length} × {formatCents(charge.adminFeeCents / tolls.length)}), as disclosed in the rental agreement
                </td>
                <td className="num">{formatCents(charge.adminFeeCents)}</td>
              </tr>
            )}
            <tr className="receipt-total">
              <td colSpan={3}>Total</td>
              <td className="num">{formatCents(charge.totalCents)}</td>
            </tr>
          </tfoot>
        </table>

        {charge.status === 'needs_renter_action' && charge.paymentLinkUrl && (
          <p className="receipt-note">
            Awaiting the renter’s confirmation. Payment link: <span className="mono">{charge.paymentLinkUrl}</span>
          </p>
        )}
        {charge.status === 'failed' && (
          <p className="receipt-note">Payment failed: {charge.failureReason}</p>
        )}

        <footer className="receipt-footer muted small">
          Toll agencies bill the car’s registered owner by license plate. Each toll above was recorded while this car
          was on your rental, between pickup and return. Times are shown in the timezone of the toll statement.
          Questions? Reply to {OPERATOR_NAME} with trip {trip.id}.
        </footer>
      </article>
    </section>
  );
}
