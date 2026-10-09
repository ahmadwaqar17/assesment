// Where the operator is in the app. No router library: one piece of state, passed down as `go`.
import type { Outcome } from './domain/types';

export type TollsView = 'upload' | 'results' | 'approve';

export type Page =
  | { name: 'dashboard' }
  | { name: 'bookings' }
  | { name: 'fleet' }
  | { name: 'settings' }
  | { name: 'tolls'; view: TollsView; tab?: Outcome }
  | { name: 'receipt'; chargeId: string; back: Page };

export type Go = (page: Page) => void;
