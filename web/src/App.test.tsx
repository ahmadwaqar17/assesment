// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleCsv from '../public/sample-tolls.csv?raw';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(sampleCsv)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function tab(name: RegExp) {
  return screen.getByRole('tab', { name });
}

describe('upload → results', () => {
  it('imports the sample statement and shows the five buckets with the right totals', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));

    expect(await screen.findByRole('heading', { name: 'Toll results' })).toBeTruthy();
    expect(tab(/Charge renter/).textContent).toContain('7 tolls$71.33');
    expect(tab(/Needs review/).textContent).toContain('3 tolls$23.52');
    expect(tab(/Turo reimbursement/).textContent).toContain('1 toll$9.10');
    expect(tab(/Operator expense/).textContent).toContain('1 toll$13.38');
    expect(tab(/Duplicate/).textContent).toContain('1 toll$17.63');

    // Charge renter tab: TX-1008 shown in the statement's local time, not UTC.
    const table = screen.getByRole('table');
    expect(within(table).getByText('Oct 2, 11:45 PM EDT')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 7); // header + 7 tolls
    expect(within(table).getAllByText(/During Sarah Mitchell's trip T1001/)).toHaveLength(2);
  });

  it('shows row errors and imports nothing when the file is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('plate,datetime,plaza,amount,transaction_id\n,soon,P,0,X')));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Row 2: missing plate')).toBeTruthy();
    expect(within(alert).getByText('Row 2: unreadable date "soon" (expected YYYY-MM-DD HH:mm)')).toBeTruthy();
    expect(within(alert).getByText('Row 2: amount must be greater than $0 (got "0")')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.getByRole('heading', { name: 'No tolls yet' })).toBeTruthy();
  });

  it('makes every row of a second identical upload a duplicate', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
    await screen.findByRole('heading', { name: 'Toll results' });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
    await screen.findByRole('heading', { name: 'Toll results' });
    // Second upload: 13 more rows, all duplicates. Charge renter is unchanged.
    expect(tab(/Duplicate/).textContent).toContain('14');
    expect(tab(/Charge renter/).textContent).toContain('7 tolls$71.33');
  });
});

describe('review', () => {
  it('resolving rows moves them to the right tab right away, updates totals and records the human decision', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample statement' }));
    await screen.findByRole('heading', { name: 'Toll results' });
    fireEvent.click(tab(/Needs review/));

    // TX-1004 (handover): both trips are candidates. Give it to Sarah.
    const handover = screen.getByLabelText('Review row 5');
    expect(within(handover).getByText(/James Cruz/)).toBeTruthy();
    fireEvent.click(within(handover).getByRole('button', { name: 'Assign to Sarah Mitchell (T1001)' }));
    expect(tab(/Needs review/).textContent).toContain('2 tolls$16.58');
    expect(tab(/Charge renter/).textContent).toContain('8 tolls$78.27');

    // TX-1007: suggested trip T1004 (Lisa). TX-1011: operator expense.
    fireEvent.click(within(screen.getByLabelText('Review row 8')).getByRole('button', { name: /Lisa Harris/ }));
    fireEvent.click(within(screen.getByLabelText('Review row 13')).getByRole('button', { name: 'Operator expense' }));

    expect(tab(/Needs review/).textContent).toContain('0 tolls$0.00');
    expect(tab(/Charge renter/).textContent).toContain('9 tolls$91.65');
    expect(tab(/Operator expense/).textContent).toContain('2 tolls$16.58');
    expect(screen.getByText('Nothing to review. Every toll was matched with certainty.')).toBeTruthy();

    fireEvent.click(tab(/Operator expense/));
    expect(screen.getByText('Marked as operator expense by reviewer')).toBeTruthy();
    expect(screen.getByText('Resolved by operator')).toBeTruthy();
    expect(screen.getByText(/Matcher said: 10 min before Lisa Harris's pickup/)).toBeTruthy();
  });
});
