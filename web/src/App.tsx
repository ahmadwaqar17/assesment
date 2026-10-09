import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { Page } from './navigation';
import { BookingsPage } from './pages/BookingsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FleetPage } from './pages/FleetPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { SettingsPage } from './pages/SettingsPage';
import { TollsPage } from './pages/TollsPage';
import { gateway } from './payments';
import { dashboardSummary } from './state/selectors';
import { StoreProvider } from './state/store';
import { useStore } from './state/useStore';

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, dispatch } = useStore();
  const [page, setPage] = useState<Page>({ name: 'dashboard' });
  const [resetCount, setResetCount] = useState(0); // remounts pages so no stale local state survives a reset

  const waitingCount = dashboardSummary(state).ready.count;

  function go(next: Page) {
    setPage(next);
    window.scrollTo?.({ top: 0 });
  }

  function resetDemo() {
    if (window.confirm('Reset the demo? This clears all uploads, reviews and charges and restores the seed trips.')) {
      dispatch({ type: 'resetDemo' });
      gateway.reset();
      setResetCount((n) => n + 1);
      setPage({ name: 'dashboard' });
    }
  }

  return (
    <div className="shell">
      <Sidebar
        current={page}
        go={go}
        tollsView={state.rows.length > 0 ? 'results' : 'upload'} // nothing imported yet: start at upload
        tollsBadge={waitingCount}
      />
      <div className="workspace">
        <div className="demo-bar" role="region" aria-label="Demo controls">
          <span>
            <strong>Demo mode</strong> · sample bookings and test payments. Nothing real is charged.
          </span>
          <button className="button small" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
        <main key={resetCount}>
        {page.name === 'dashboard' && <DashboardPage go={go} />}
        {page.name === 'bookings' && <BookingsPage go={go} />}
        {page.name === 'fleet' && <FleetPage />}
        {page.name === 'settings' && <SettingsPage />}
        {page.name === 'tolls' && <TollsPage view={page.view} tab={page.tab} waitingCount={waitingCount} go={go} />}
        {page.name === 'receipt' && <ReceiptPage chargeId={page.chargeId} onBack={() => go(page.back)} />}
        </main>
      </div>
    </div>
  );
}
