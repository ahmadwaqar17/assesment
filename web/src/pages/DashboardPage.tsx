import { formatCents } from '../domain/money';
import type { Go } from '../navigation';
import { dashboardSummary } from '../state/selectors';
import { useStore } from '../state/useStore';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Message {
  id: string;
  text: string;
  action: string;
  onClick: () => void;
  tone?: 'warn' | 'bad';
}

export function DashboardPage({ go }: { go: Go }) {
  const { state } = useStore();
  const summary = dashboardSummary(state);

  const messages: Message[] = [];
  if (!summary.hasStatements) {
    messages.push({
      id: 'upload',
      text: 'Upload this month’s toll statement and I’ll match every toll to the trip that had the car.',
      action: 'Upload statement',
      onClick: () => go({ name: 'tolls', view: 'upload' }),
    });
  }
  if (summary.ready.count > 0) {
    messages.push({
      id: 'ready',
      text: `${plural(summary.ready.count, 'toll charge')} ready for your OK · ${formatCents(summary.ready.cents)}. I won’t charge anyone until you say so.`,
      action: 'Review and approve',
      onClick: () => go({ name: 'tolls', view: 'approve' }),
    });
  }
  if (summary.review.count > 0) {
    messages.push({
      id: 'review',
      text: `${plural(summary.review.count, 'toll')} need${summary.review.count === 1 ? 's' : ''} your call · ${formatCents(summary.review.cents)}. I couldn’t be sure who had the car.`,
      action: 'Decide',
      onClick: () => go({ name: 'tolls', view: 'results', tab: 'NEEDS_REVIEW' }),
      tone: 'warn',
    });
  }
  if (summary.turo.count > 0) {
    messages.push({
      id: 'turo',
      text: `${plural(summary.turo.count, 'toll')} happened on Turo trips · ${formatCents(summary.turo.cents)} to file with Turo.`,
      action: 'See Turo tolls',
      onClick: () => go({ name: 'tolls', view: 'results', tab: 'TURO_REIMBURSEMENT' }),
    });
  }
  if (summary.waitingOnRenter.length > 0) {
    messages.push({
      id: 'waiting',
      text: `${plural(summary.waitingOnRenter.length, 'renter')} still need${summary.waitingOnRenter.length === 1 ? 's' : ''} to confirm payment. Their bank asked for it; send them the payment link.`,
      action: 'See charges',
      onClick: () => go({ name: 'tolls', view: 'approve' }),
      tone: 'warn',
    });
  }
  if (summary.failed.length > 0) {
    messages.push({
      id: 'failed',
      text: `${plural(summary.failed.length, 'charge')} failed. The card was declined.`,
      action: 'See charges',
      onClick: () => go({ name: 'tolls', view: 'approve' }),
      tone: 'bad',
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">Welcome back. Here’s what needs you today.</p>
      </header>

      <div className="panel carisma" aria-label="Carisma">
        <div className="carisma-head">
          <span className="assistant-avatar" aria-hidden="true">
            C
          </span>
          <div>
            <strong>Carisma</strong>
            <span className="muted small"> · Your assistant asks before it acts</span>
          </div>
        </div>
        {messages.length === 0 ? (
          <p className="carisma-message">All caught up. Every toll is charged, filed with Turo, or accounted for.</p>
        ) : (
          <ul className="carisma-list">
            {messages.map((message) => (
              <li key={message.id} className={`carisma-message${message.tone ? ` tone-${message.tone}` : ''}`}>
                <span>{message.text}</span>
                <button className="button small" onClick={message.onClick}>
                  {message.action}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stats">
        <Stat label="Recovered from renters" value={summary.recoveredCents} tone="good" />
        <Stat label="Waiting for your OK" value={summary.ready.cents} />
        <Stat label="To file with Turo" value={summary.turo.cents} />
        <Stat label="Tolls you absorbed" value={summary.absorbedCents} hint="No trip had the car" />
      </div>

      <div className="quick-links">
        <button className="link-button" onClick={() => go({ name: 'bookings' })}>
          Tolls by booking →
        </button>
        <button className="link-button" onClick={() => go({ name: 'fleet' })}>
          Tolls by car →
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'good' }) {
  return (
    <div className={`panel stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="muted small">{label}</span>
      <span className="stat-value money">{formatCents(value)}</span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}
