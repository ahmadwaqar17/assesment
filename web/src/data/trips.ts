// Seed trips from PROJECT_CONTEXT.md section 6. Operator timezone: America/New_York (EDT in October 2026).
import type { Trip } from '../domain/types';

export const OPERATOR_TIMEZONE = 'America/New_York';

export const SEED_TRIPS: Trip[] = [
  {
    id: 'T1001',
    car: 'Toyota RAV4 2022',
    plate: 'FLX-4821',
    renter: 'Sarah Mitchell',
    email: 'sarah@example.com',
    source: 'direct',
    start: '2026-10-01T10:00-04:00',
    end: '2026-10-04T10:00-04:00',
    testCard: 'pm_card_visa',
  },
  {
    id: 'T1002',
    car: 'Toyota RAV4 2022',
    plate: 'FLX-4821',
    renter: 'James Cruz',
    email: 'james@example.com',
    source: 'direct',
    start: '2026-10-04T10:00-04:00',
    end: '2026-10-06T18:00-04:00',
    testCard: 'pm_card_visa',
  },
  {
    id: 'T1003',
    car: 'Honda Civic 2021',
    plate: 'KTR-9935',
    renter: 'Turo guest (trip #88213)',
    source: 'turo',
    start: '2026-10-02T09:00-04:00',
    end: '2026-10-05T09:00-04:00',
  },
  {
    id: 'T1004',
    car: 'Ford Mustang 2023',
    plate: 'MVP-2207',
    renter: 'Lisa Harris',
    email: 'lisa@example.com',
    source: 'direct',
    start: '2026-10-03T12:00-04:00',
    end: '2026-10-05T12:00-04:00',
    returnedAt: '2026-10-07T12:00-04:00',
    testCard: 'pm_card_visa',
  },
  {
    id: 'T1005',
    car: 'Tesla Model 3 2024',
    plate: 'EVT-1180',
    renter: 'Omar Khan',
    email: 'omar@example.com',
    source: 'direct',
    start: '2026-10-01T08:00-04:00',
    end: '2026-10-03T20:00-04:00',
    // Card 4000 0027 6000 3184: always needs the renter to confirm (3DS).
    testCard: 'pm_card_authenticationRequired',
  },
  {
    id: 'T1006',
    car: 'Kia Sportage 2023',
    plate: 'JRD-5512',
    renter: 'Daniel Reyes',
    email: 'daniel@example.com',
    source: 'direct',
    start: '2026-10-05T09:00-04:00',
    end: '2026-10-07T09:00-04:00',
    testCard: 'pm_card_chargeDeclined',
  },
];
