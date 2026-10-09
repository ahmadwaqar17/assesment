// Small builders for domain tests.
import type { Toll, Trip } from './types';

export function makeTrip(overrides: Partial<Trip> & Pick<Trip, 'id'>): Trip {
  return {
    car: 'Test Car',
    plate: 'ABC-123',
    renter: `Renter ${overrides.id}`,
    source: 'direct',
    start: '2026-10-01T10:00-04:00',
    end: '2026-10-03T10:00-04:00',
    ...overrides,
  };
}

/** `occurredAt` is given as an ISO time with offset and stored as UTC, like the statement parser does. */
export function makeToll(overrides: Partial<Toll> & { at: string }): Toll {
  const { at, ...rest } = overrides;
  return {
    plate: 'ABC-123',
    occurredAt: new Date(at).toISOString(),
    timezone: 'America/New_York',
    plaza: 'Test Plaza',
    amountCents: 500,
    ...rest,
  };
}
