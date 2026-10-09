import type { Outcome } from '../domain/types';
import type { Go, TollsView } from '../navigation';
import { ApprovePage } from './ApprovePage';
import { ResultsPage } from './ResultsPage';
import { UploadPage } from './UploadPage';

interface Props {
  view: TollsView;
  tab?: Outcome;
  waitingCount: number;
  go: Go;
}

const VIEWS: { view: TollsView; label: string }[] = [
  { view: 'upload', label: 'Upload' },
  { view: 'results', label: 'Results' },
  { view: 'approve', label: 'Approve' },
];

export function TollsPage({ view, tab, waitingCount, go }: Props) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Tolls</h1>
        <p className="muted">
          Upload a statement from your toll agency. Each toll is matched to the trip that had the car, and you approve
          every charge.
        </p>
      </header>

      <nav className="subnav" aria-label="Tolls sections">
        {VIEWS.map((item) => (
          <button
            key={item.view}
            className={`subnav-link${view === item.view ? ' active' : ''}`}
            aria-current={view === item.view ? 'page' : undefined}
            onClick={() => go({ name: 'tolls', view: item.view })}
          >
            {item.label}
            {item.view === 'approve' && waitingCount > 0 && (
              <span className="nav-badge" aria-label={`${waitingCount} waiting`}>
                {waitingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {view === 'upload' && <UploadPage onImported={() => go({ name: 'tolls', view: 'results' })} />}
      {view === 'results' && (
        <ResultsPage
          key={tab ?? 'default'}
          initialTab={tab}
          onUpload={() => go({ name: 'tolls', view: 'upload' })}
          onApprove={() => go({ name: 'tolls', view: 'approve' })}
        />
      )}
      {view === 'approve' && (
        <ApprovePage
          onReview={() => go({ name: 'tolls', view: 'results', tab: 'NEEDS_REVIEW' })}
          onSettings={() => go({ name: 'settings' })}
          onOpenReceipt={(chargeId) => go({ name: 'receipt', chargeId, back: { name: 'tolls', view: 'approve' } })}
        />
      )}
    </section>
  );
}
