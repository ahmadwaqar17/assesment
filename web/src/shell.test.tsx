// @vitest-environment jsdom
// The operator app around Toll Recovery: dashboard, bookings, fleet, settings, demo reset.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleCsv from '../public/sample-tolls.csv?raw';
import App from './App';
import type { FakeGateway } from './payments/fakeGateway';
import { openSection, openTollsView, openUpload } from './test/ui';

vi.mock('./payments', async () => {
  const { FakeGateway } = await import('./payments/fakeGateway');
  return { gateway: new FakeGateway({ delayMs: 10 }) };
});
const { gateway } = (await import('./payments')) as unknown as { gateway: FakeGateway };

beforeEach(() => {
  localStorage.clear();
  gateway.reset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(sampleCsv)));
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importSample() {
  openUpload();
  fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
  await screen.findByRole('heading', { name: 'Toll results' });
}

const carisma = () => screen.getByLabelText('Carisma');
const bookingRow = (tripId: string) => screen.getByRole('cell', { name: new RegExp(`^${tripId}`) }).closest('tr')!;

describe('app shell', () => {
  it('opens on the dashboard, with sections outside the demo shown as disabled', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Dashboard', 'Bookings', 'Fleet', 'Tolls', 'Settings']) {
      expect(within(nav).getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    for (const name of ['Customers', 'Calendar', 'Payouts', 'Carisma']) {
      expect(within(nav).queryByRole('button', { name: new RegExp(name) })).toBeNull();
      expect(within(nav).getByText(name).closest('[aria-disabled="true"]')).toBeTruthy();
    }
  });

  it('Tolls starts at the upload step until a statement is imported', async () => {
    render(<App />);
    openSection(/^Tolls/);
    expect(screen.getByRole('heading', { name: 'Upload a toll statement' })).toBeTruthy();
    await importSample();
    openSection('Dashboard');
    openSection(/^Tolls/);
    expect(screen.getByRole('heading', { name: 'Toll results' })).toBeTruthy();
  });

  it('the demo bar Reset demo button restores the seed data from any page', async () => {
    render(<App />);
    await importSample();
    openSection('Bookings');
    fireEvent.click(within(screen.getByRole('region', { name: 'Demo controls' })).getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    openSection('Bookings');
    expect(within(bookingRow('T1001')).getByText('No tolls')).toBeTruthy();
  });
});

describe('dashboard', () => {
  it('Carisma asks for a statement first, and the button goes to upload', () => {
    render(<App />);
    expect(within(carisma()).getByText(/Upload this month’s toll statement/)).toBeTruthy();
    fireEvent.click(within(carisma()).getByRole('button', { name: 'Upload statement' }));
    expect(screen.getByRole('heading', { name: 'Upload a toll statement' })).toBeTruthy();
  });

  it('after a statement, Carisma lists what needs the operator and links to it', async () => {
    render(<App />);
    await importSample();
    openSection('Dashboard');
    expect(within(carisma()).getByText(/5 toll charges ready for your OK · \$71\.33/)).toBeTruthy();
    expect(within(carisma()).getByText(/3 tolls need your call · \$23\.52/)).toBeTruthy();
    expect(within(carisma()).getByText(/1 toll happened on Turo trips · \$9\.10/)).toBeTruthy();
    expect(screen.getByText('Tolls you absorbed').parentElement!.textContent).toContain('$13.38');

    fireEvent.click(within(carisma()).getByRole('button', { name: 'Decide' }));
    expect(screen.getByRole('tab', { name: /Needs review/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('reports renters who must confirm and charges that failed', async () => {
    render(<App />);
    await importSample();
    openTollsView('Approve');
    for (const renter of [/Omar Khan/, /Daniel Reyes/]) {
      const card = screen.getByRole('article', { name: renter });
      fireEvent.click(within(card).getByRole('button', { name: 'Charge' }));
      await waitFor(() => expect(within(screen.getByRole('article', { name: renter })).queryByText(/Charging/)).toBeNull());
    }
    openSection('Dashboard');
    expect(within(carisma()).getByText(/1 renter still needs to confirm payment/)).toBeTruthy();
    expect(within(carisma()).getByText(/1 charge failed/)).toBeTruthy();
  });
});

describe('bookings', () => {
  it('shows each booking’s toll status, and the receipt opens from it', async () => {
    render(<App />);
    await importSample();
    openTollsView('Approve');
    fireEvent.click(within(screen.getByRole('article', { name: /Sarah Mitchell/ })).getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(within(screen.getByRole('article', { name: /Sarah Mitchell/ })).getByText('Paid')).toBeTruthy());

    openSection('Bookings');
    expect(within(bookingRow('T1001')).getByText('Paid')).toBeTruthy();
    expect(within(bookingRow('T1001')).getByText('1 toll to review')).toBeTruthy(); // the handover toll
    expect(within(bookingRow('T1002')).getByText('Ready to charge')).toBeTruthy();
    expect(within(bookingRow('T1003')).getByText('File with Turo')).toBeTruthy();
    expect(within(bookingRow('T1004')).getByText('2 tolls to review')).toBeTruthy();

    fireEvent.click(within(bookingRow('T1001')).getByRole('button', { name: 'Receipt' }));
    expect(screen.getByRole('article', { name: 'Toll receipt' }).textContent).toContain('Sarah Mitchell');
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy();
  });
});

describe('fleet', () => {
  it('splits tolls per car and totals them', async () => {
    render(<App />);
    await importSample();
    openSection('Fleet');
    const tesla = screen.getByRole('cell', { name: 'Tesla Model 3 2024' }).closest('tr')!;
    expect(tesla.textContent).toContain('$24.57'); // renter owes
    expect(tesla.textContent).toContain('$13.38'); // absorbed
    const totals = screen.getByRole('cell', { name: 'All cars' }).closest('tr')!;
    expect(totals.textContent).toContain('$117.33');
  });
});

describe('settings', () => {
  it('the review buffer applies to the next statement', async () => {
    render(<App />);
    openSection('Settings');
    fireEvent.change(screen.getByLabelText(/Review buffer/), { target: { value: '5' } });
    await importSample();
    // With a 5-minute buffer, only the exact handover still needs review.
    expect(screen.getByRole('tab', { name: /Needs review/ }).textContent).toContain('1 toll$6.94');
  });

  it('the default statement timezone pre-selects the upload timezone', () => {
    render(<App />);
    openSection('Settings');
    fireEvent.change(screen.getByLabelText(/Default statement timezone/), { target: { value: 'America/Chicago' } });
    openUpload();
    expect((screen.getByLabelText(/Statement timezone/) as HTMLSelectElement).value).toBe('America/Chicago');
  });
});
