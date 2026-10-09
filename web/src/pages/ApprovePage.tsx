import { buildChargeDrafts, chargedFingerprints } from '../domain/charges';
import { formatCents } from '../domain/money';
import { ChargeCard } from '../components/ChargeCard';
import { gateway } from '../payments';
import { chargeDraft } from '../state/chargeFlow';
import { currentResults, tollsForCharge } from '../state/reducer';
import { useStore } from '../state/useStore';

interface Props {
  onReview: () => void;
  onSettings: () => void;
  onOpenReceipt: (chargeId: string) => void;
}

export function ApprovePage({ onReview, onSettings, onOpenReceipt }: Props) {
  const { state, dispatch } = useStore();
  const results = currentResults(state);
  const drafts = buildChargeDrafts(results, {
    adminFeeEachCents: state.settings.adminFeeEachCents,
    alreadyCharged: chargedFingerprints(state.charges),
  });
  const waiting = drafts.filter((d) => !state.skippedTripIds.includes(d.trip.id));
  const skipped = drafts.filter((d) => state.skippedTripIds.includes(d.trip.id));
  const charges = [...state.charges].reverse();
  const toReview = results.filter((r) => r.outcome === 'NEEDS_REVIEW');

  return (
    <section className="page">
      <header className="page-header">
        <h2>Approve charges</h2>
        <p className="muted">Nothing is charged until you say so. One card per trip; each toll can only be charged once.</p>
      </header>

      <p className="muted small">
        Admin fee: {formatCents(state.settings.adminFeeEachCents)} per toll.{' '}
        <button className="link-button" onClick={onSettings}>
          Change in Settings
        </button>
      </p>

      {toReview.length > 0 && (
        <div className="notice" role="status">
          <span>
            {toReview.length} toll{toReview.length === 1 ? '' : 's'} ({formatCents(toReview.reduce((s, r) => s + r.toll.amountCents, 0))}) still
            need{toReview.length === 1 ? 's' : ''} review and {toReview.length === 1 ? 'is' : 'are'} not on these charges yet.
          </span>
          <button className="button small" onClick={onReview}>
            Review now
          </button>
        </div>
      )}

      <h2 className="section-title">
        Waiting for your OK <span className="muted small">{waiting.length}</span>
      </h2>
      {waiting.length === 0 ? (
        <div className="panel empty">
          <p className="muted">
            {state.rows.length === 0
              ? 'Upload a toll statement first. Tolls during direct trips show up here to approve.'
              : 'Nothing left to approve. Every chargeable toll is on a charge or skipped.'}
          </p>
        </div>
      ) : (
        <div className="cards">
          {waiting.map((draft) => (
            <ChargeCard
              key={draft.idempotencyKey}
              {...draft}
              onCharge={() => void chargeDraft(draft, { gateway, dispatch })}
              onSkip={() => dispatch({ type: 'skipTrip', tripId: draft.trip.id })}
            />
          ))}
        </div>
      )}

      {charges.length > 0 && (
        <>
          <h2 className="section-title">
            Charges <span className="muted small">{charges.length}</span>
          </h2>
          <div className="cards">
            {charges.map((charge) => {
              const trip = state.trips.find((t) => t.id === charge.tripId);
              if (!trip) return null;
              return (
                <ChargeCard
                  key={charge.id}
                  trip={trip}
                  tolls={tollsForCharge(state, charge)}
                  tollCents={charge.tollCents}
                  adminFeeCents={charge.adminFeeCents}
                  totalCents={charge.totalCents}
                  charge={charge}
                  onOpenReceipt={charge.status === 'pending' ? undefined : () => onOpenReceipt(charge.id)}
                />
              );
            })}
          </div>
        </>
      )}

      {skipped.length > 0 && (
        <>
          <h2 className="section-title">
            Skipped <span className="muted small">{skipped.length}</span>
          </h2>
          <div className="cards">
            {skipped.map((draft) => (
              <ChargeCard
                key={draft.idempotencyKey}
                {...draft}
                skipped
                onUnskip={() => dispatch({ type: 'unskipTrip', tripId: draft.trip.id })}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
