// One trip's tolls, asked as a question before anything is charged (Carisma style).
import { useState } from 'react';
import type { ChargeStatus, MatchResult, Trip } from '../domain/types';
import { formatCents } from '../domain/money';
import { formatLocalTime, STATUS_LABELS } from './format';

interface Props {
  trip: Trip;
  tolls: MatchResult[];
  tollCents: number;
  adminFeeCents: number;
  totalCents: number;
  /** Set once a charge exists for these tolls. */
  charge?: {
    status: ChargeStatus;
    paymentRef?: string;
    paymentLinkUrl?: string;
    failureReason?: string;
  };
  skipped?: boolean;
  onCharge?: () => void;
  onSkip?: () => void;
  onUnskip?: () => void;
  onOpenReceipt?: () => void;
}

export function ChargeCard(props: Props) {
  const { trip, tolls, adminFeeCents, totalCents, charge, skipped } = props;
  const [pressed, setPressed] = useState(false);
  const charging = pressed || charge?.status === 'pending';
  const count = tolls.length === 1 ? '1 toll' : `${tolls.length} tolls`;

  function handleCharge() {
    if (charging) return;
    setPressed(true);
    props.onCharge?.();
  }

  return (
    <article className={`card${skipped ? ' skipped' : ''}`} aria-label={`Charge for ${trip.renter} (${trip.id})`}>
      <div className="assistant-avatar" aria-hidden="true">
        C
      </div>

      <div className="card-body">
        <p className="card-ask">
          <strong>{trip.renter}</strong> · {trip.car} · {count} · <strong className="money">{formatCents(totalCents)}</strong>
          {charge ? '' : '. Charge saved card?'}
        </p>
        <ul className="card-tolls">
          {tolls.map((result) => (
            <li key={result.fingerprint}>
              <span>
                {formatLocalTime(result.toll.occurredAt, result.toll.timezone)} · {result.toll.plaza}
              </span>
              <span>{formatCents(result.toll.amountCents)}</span>
            </li>
          ))}
          {adminFeeCents > 0 && (
            <li>
              <span>Admin fee ({count})</span>
              <span>{formatCents(adminFeeCents)}</span>
            </li>
          )}
        </ul>

        {charge && charge.status !== 'pending' && <ChargeResult charge={charge} onOpenReceipt={props.onOpenReceipt} />}
      </div>

      <div className="card-actions">
        {!charge && !skipped && (
          <div className="row">
            <button className="button subtle" onClick={props.onSkip} disabled={charging}>
              Skip
            </button>
            <button className="button primary" onClick={handleCharge} disabled={charging} aria-busy={charging}>
              {charging ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Charging…
                </>
              ) : (
                'Charge'
              )}
            </button>
          </div>
        )}
        {charge?.status === 'pending' && (
          <button className="button primary" disabled aria-busy="true">
            <span className="spinner" aria-hidden="true" /> Charging…
          </button>
        )}
        {skipped && (
          <button className="button small" onClick={props.onUnskip}>
            Undo skip
          </button>
        )}
      </div>
    </article>
  );
}

function ChargeResult({ charge, onOpenReceipt }: { charge: NonNullable<Props['charge']>; onOpenReceipt?: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(charge.paymentLinkUrl ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the link is still selectable in the field.
    }
  }

  return (
    <div className="card-result">
      <span className={`chip chip-${charge.status}`}>{STATUS_LABELS[charge.status]}</span>
      {charge.status === 'failed' && <span>{charge.failureReason}</span>}
      {charge.paymentRef && <span className="muted mono">{charge.paymentRef}</span>}
      {onOpenReceipt && (
        <button className="link-button" onClick={onOpenReceipt}>
          View receipt
        </button>
      )}
      {charge.status === 'needs_renter_action' && charge.paymentLinkUrl && (
        <div className="pay-link">
          <span className="muted">The bank wants the renter to confirm. Send them this link:</span>
          <input type="text" readOnly value={charge.paymentLinkUrl} aria-label="Payment link" onFocus={(e) => e.target.select()} />
          <button className="button small" onClick={() => void copyLink()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
