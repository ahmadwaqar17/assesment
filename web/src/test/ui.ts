// Navigation helpers for UI tests.
import { fireEvent, screen, within } from '@testing-library/react';

/** Click an item in the sidebar: Dashboard, Bookings, Fleet, Tolls, Settings. */
export function openSection(name: string | RegExp) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name }));
}

/** Click a view inside Tolls: Upload, Results, Approve. */
export function openTollsView(name: 'Upload' | 'Results' | 'Approve') {
  const nav = screen.getByRole('navigation', { name: 'Tolls sections' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${name}`) }));
}

export function openUpload() {
  openSection(/^Tolls/);
  openTollsView('Upload');
}
