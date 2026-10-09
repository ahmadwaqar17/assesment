// @vitest-environment jsdom
// The demo path from PROJECT_CONTEXT.md section 10, driven through the real UI.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleCsv from '../public/sample-tolls.csv?raw';
import App from './App';
import { openSection, openTollsView, openUpload } from './test/ui';
import type { FakeGateway } from './payments/fakeGateway';

vi.mock('./payments', async () => {
  const { FakeGateway } = await import('./payments/fakeGateway');
  return { gateway: new FakeGateway({ delayMs: 20 }) };
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

const card = (name: RegExp) => screen.getByRole('article', { name });

async function uploadAndResolveReviews() {
  render(<App />);
  openUpload();
  fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
  await screen.findByRole('heading', { name: 'Toll results' });
  fireEvent.click(screen.getByRole('tab', { name: /Needs review/ }));
  fireEvent.click(within(screen.getByLabelText('Review row 5')).getByRole('button', { name: /Sarah Mitchell/ }));
  fireEvent.click(within(screen.getByLabelText('Review row 8')).getByRole('button', { name: /Lisa Harris/ }));
  fireEvent.click(within(screen.getByLabelText('Review row 13')).getByRole('button', { name: 'Operator expense' }));
  openTollsView('Approve');
}

describe('demo path', () => {
  it('upload, review, charge Sarah (paid), Omar (waiting), Daniel (failed), double-click, receipt', async () => {
    await uploadAndResolveReviews();

    // After review Sarah has 3 tolls (TX-1004 assigned to her) and Lisa has 2.
    expect(card(/Sarah Mitchell/).textContent).toContain('Sarah Mitchell · Toyota RAV4 2022 · 3 tolls · $29.32. Charge saved card?');
    expect(card(/Lisa Harris/).textContent).toContain('2 tolls · $18.63');
    expect(screen.queryByRole('status')).toBeNull(); // no "still need review" notice

    // Sarah: loading state, button disabled, then Paid.
    fireEvent.click(within(card(/Sarah Mitchell/)).getByRole('button', { name: 'Charge' }));
    const charging = within(card(/Sarah Mitchell/)).getByRole('button', { name: /Charging/ });
    expect((charging as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(within(card(/Sarah Mitchell/)).getByText('Paid')).toBeTruthy());

    // Omar: waiting on renter, with a payment link and a copy button.
    fireEvent.click(within(card(/Omar Khan/)).getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(within(card(/Omar Khan/)).getByText('Waiting on renter')).toBeTruthy());
    const link = within(card(/Omar Khan/)).getByLabelText('Payment link') as HTMLInputElement;
    expect(link.value).toMatch(/^https:\/\/example\.com\/pay\//);
    expect(within(card(/Omar Khan/)).getByRole('button', { name: 'Copy link' })).toBeTruthy();

    // Daniel: failed, with the reason.
    fireEvent.click(within(card(/Daniel Reyes/)).getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(within(card(/Daniel Reyes/)).getByText('Failed')).toBeTruthy());
    expect(within(card(/Daniel Reyes/)).getByText('Your card was declined.')).toBeTruthy();

    // James: press Charge twice. One charge only.
    const before = gateway.chargeCount;
    const jamesButton = within(card(/James Cruz/)).getByRole('button', { name: 'Charge' });
    fireEvent.click(jamesButton);
    fireEvent.click(jamesButton);
    await waitFor(() => expect(within(card(/James Cruz/)).getByText('Paid')).toBeTruthy());
    expect(gateway.chargeCount - before).toBe(1);
    expect(screen.getAllByRole('article', { name: /James Cruz/ })).toHaveLength(1);

    // Receipt for Sarah: itemized, with total and payment reference.
    fireEvent.click(within(card(/Sarah Mitchell/)).getByRole('button', { name: 'View receipt' }));
    const receipt = screen.getByRole('article', { name: 'Toll receipt' });
    expect(within(receipt).getByText('Sunset Rentals')).toBeTruthy();
    expect(within(receipt).getByText('T1001')).toBeTruthy();
    expect(within(receipt).queryByText('Lincoln Tunnel')).toBeNull();
    expect(within(receipt).getByText('Verrazzano Bridge')).toBeTruthy();
    expect(within(receipt).getByText('Total').closest('tr')!.textContent).toContain('$29.32');
    expect(within(receipt).getByText(/^pi_fake_/)).toBeTruthy();
    expect(within(receipt).getByText('Paid')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print receipt' })).toBeTruthy();
  });

  it('skip moves a card aside without charging, and undo brings it back', async () => {
    await uploadAndResolveReviews();
    fireEvent.click(within(card(/James Cruz/)).getByRole('button', { name: 'Skip' }));
    expect(screen.getByRole('heading', { name: /Skipped/ })).toBeTruthy();
    expect(within(card(/James Cruz/)).queryByRole('button', { name: 'Charge' })).toBeNull();
    fireEvent.click(within(card(/James Cruz/)).getByRole('button', { name: 'Undo skip' }));
    expect(within(card(/James Cruz/)).getByRole('button', { name: 'Charge' })).toBeTruthy();
    expect(gateway.chargeCount).toBe(0);
  });

  it('shows the admin fee on the card and the receipt', async () => {
    await uploadAndResolveReviews();
    openSection('Settings');
    fireEvent.change(screen.getByLabelText(/Admin fee per toll/), { target: { value: '1.50' } });
    openSection(/^Tolls/);
    openTollsView('Approve');
    expect(screen.getByText(/Admin fee: \$1\.50 per toll/)).toBeTruthy();
    expect(card(/Sarah Mitchell/).textContent).toContain('3 tolls · $33.82');
    fireEvent.click(within(card(/Sarah Mitchell/)).getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(within(card(/Sarah Mitchell/)).getByText('Paid')).toBeTruthy());
    fireEvent.click(within(card(/Sarah Mitchell/)).getByRole('button', { name: 'View receipt' }));
    const receipt = screen.getByRole('article', { name: 'Toll receipt' });
    expect(within(receipt).getByText(/Admin fee \(3 × \$1\.50\)/).closest('tr')!.textContent).toContain('$4.50');
    expect(within(receipt).getByText('Total').closest('tr')!.textContent).toContain('$33.82');
  });

  it('Reset demo restores the seed state and the sample imports cleanly again', async () => {
    await uploadAndResolveReviews();
    fireEvent.click(within(card(/Sarah Mitchell/)).getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(within(card(/Sarah Mitchell/)).getByText('Paid')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText(/Upload this month’s toll statement/)).toBeTruthy();
    openUpload();
    expect(screen.queryByText('Previous uploads')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
    await screen.findByRole('heading', { name: 'Toll results' });
    expect(screen.getByRole('tab', { name: /Duplicate/ }).textContent).toContain('1 toll$17.63');
  });
});
