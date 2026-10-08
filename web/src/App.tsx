import { useState } from 'react';
import { buildChargeDrafts, chargedFingerprints } from './domain/charges';
import type { Outcome } from './domain/types';
import { ApprovePage } from './pages/ApprovePage';
import { ReceiptPage } from './pages/ReceiptPage';
import { ResultsPage } from './pages/ResultsPage';
import { UploadPage } from './pages/UploadPage';
import { gateway } from './payments';
import { currentResults } from './state/reducer';
import { StoreProvider } from './state/store';
import { useStore } from './state/useStore';

type Page =
  | { name: 'upload' }
  | { name: 'results'; tab?: Outcome }
  | { name: 'approve' }
  | { name: 'receipt'; chargeId: string };

const NAV: { page: Page; label: string }[] = [
  { page: { name: 'upload' }, label: 'Upload' },
  { page: { name: 'results' }, label: 'Results' },
  { page: { name: 'approve' }, label: 'Approve' },
];

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, dispatch } = useStore();
  const [page, setPage] = useState<Page>(state.rows.length > 0 ? { name: 'results' } : { name: 'upload' });
  const [resetCount, setResetCount] = useState(0); // remounts pages so no stale local state survives a reset

  const waitingCount = buildChargeDrafts(currentResults(state), {
    alreadyCharged: chargedFingerprints(state.charges),
  }).filter((d) => !state.skippedTripIds.includes(d.trip.id)).length;

  function resetDemo() {
    if (window.confirm('Reset the demo? This clears all uploads, reviews and charges and restores the seed trips.')) {
      dispatch({ type: 'resetDemo' });
      gateway.reset();
      setResetCount((n) => n + 1);
      setPage({ name: 'upload' });
    }
  }

  const activeNav = page.name === 'receipt' ? 'approve' : page.name;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Toll Recovery
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.page.name}
              className={`nav-link${activeNav === item.page.name ? ' active' : ''}`}
              aria-current={activeNav === item.page.name ? 'page' : undefined}
              onClick={() => setPage(item.page)}
            >
              {item.label}
              {item.page.name === 'approve' && waitingCount > 0 && (
                <span className="nav-badge" aria-label={`${waitingCount} waiting`}>
                  {waitingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button className="button subtle" onClick={resetDemo}>
          Reset demo
        </button>
      </header>

      <main key={resetCount}>
        {page.name === 'upload' && <UploadPage onImported={() => setPage({ name: 'results' })} />}
        {page.name === 'results' && (
          <ResultsPage
            key={page.tab ?? 'default'}
            initialTab={page.tab}
            onUpload={() => setPage({ name: 'upload' })}
            onApprove={() => setPage({ name: 'approve' })}
          />
        )}
        {page.name === 'approve' && (
          <ApprovePage
            onReview={() => setPage({ name: 'results', tab: 'NEEDS_REVIEW' })}
            onOpenReceipt={(chargeId) => setPage({ name: 'receipt', chargeId })}
          />
        )}
        {page.name === 'receipt' && (
          <ReceiptPage chargeId={page.chargeId} onBack={() => setPage({ name: 'approve' })} />
        )}
      </main>
    </div>
  );
}
