import { describe, expect, it } from 'vitest';
import sampleCsv from '../../public/sample-tolls.csv?raw';
import { bucketTotals } from '../domain/matcher';
import { parseStatement } from '../domain/statement';
import { loadState, saveState, STORAGE_KEY } from './persistence';
import { currentResult, reducer, seedState, type Action, type AppState } from './reducer';

const NY = 'America/New_York';

function importSample(state: AppState, uploadId = 'u1'): AppState {
  const parsed = parseStatement(sampleCsv, NY);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return reducer(state, {
    type: 'importStatement',
    uploadId,
    fileName: 'sample-tolls.csv',
    timezone: NY,
    importedAt: '2026-10-08T12:00:00.000Z',
    tolls: parsed.tolls,
  });
}

const results = (state: AppState) => state.rows.map((row) => currentResult(state, row));
const rowFor = (state: AppState, txId: string) =>
  state.rows.find((row) => row.match.toll.externalId === txId && row.match.outcome !== 'DUPLICATE')!;
const resolve = (rowId: string, decision: Extract<Action, { type: 'resolveReview' }>['decision']): Action => ({
  type: 'resolveReview',
  rowId,
  decision,
  resolvedAt: '2026-10-08T13:00:00.000Z',
});

describe('reducer', () => {
  it('starts from the seed data', () => {
    const state = seedState();
    expect(state.trips.map((t) => t.id)).toEqual(['T1001', 'T1002', 'T1003', 'T1004', 'T1005', 'T1006']);
    expect(state.rows).toEqual([]);
    expect(state.settings).toEqual({ bufferMinutes: 30, adminFeeEachCents: 0, timezone: NY });
  });

  describe('importing', () => {
    it('matches every row against the trips and records the upload', () => {
      const state = importSample(seedState());
      expect(state.uploads).toEqual([
        { id: 'u1', fileName: 'sample-tolls.csv', timezone: NY, importedAt: '2026-10-08T12:00:00.000Z', rowCount: 13 },
      ]);
      expect(state.rows).toHaveLength(13);
      expect(state.rows[0]).toMatchObject({ id: 'u1:2', uploadId: 'u1', rowNumber: 2 });
      const totals = bucketTotals(results(state));
      expect(totals.BILL_RENTER).toEqual({ count: 7, cents: 7133 });
      expect(totals.NEEDS_REVIEW).toEqual({ count: 3, cents: 2352 });
      expect(totals.DUPLICATE).toEqual({ count: 1, cents: 1763 });
    });

    it('uses the buffer from settings', () => {
      let state = reducer(seedState(), { type: 'updateSettings', settings: { bufferMinutes: 5 } });
      state = importSample(state);
      // TX-1007 (20 min after return) and TX-1011 (10 min before pickup) fall outside a 5-min buffer.
      expect(bucketTotals(results(state)).NEEDS_REVIEW.count).toBe(1);
    });
  });

  describe('re-importing', () => {
    it('makes every row of the same statement a DUPLICATE and keeps the first import unchanged', () => {
      const once = importSample(seedState(), 'u1');
      const twice = importSample(once, 'u2');
      expect(twice.uploads.map((u) => u.id)).toEqual(['u1', 'u2']);
      expect(twice.rows).toHaveLength(26);
      const second = twice.rows.filter((row) => row.uploadId === 'u2');
      expect(second.every((row) => row.match.outcome === 'DUPLICATE')).toBe(true);
      expect(second[0].match.reason).toBe('Already imported in an earlier upload');
      expect(twice.rows.slice(0, 13)).toEqual(once.rows);
    });
  });

  describe('resolving a review row', () => {
    it('to a direct trip makes it chargeable and keeps a record of the decision', () => {
      let state = importSample(seedState());
      const row = rowFor(state, 'TX-1004'); // handover T1001 / T1002
      state = reducer(state, resolve(row.id, { kind: 'assign', tripId: 'T1001' }));

      expect(state.reviews[row.id]).toEqual({
        decision: { kind: 'assign', tripId: 'T1001' },
        resolvedAt: '2026-10-08T13:00:00.000Z',
      });
      const result = currentResult(state, row);
      expect(result.outcome).toBe('BILL_RENTER');
      expect(result.trip?.id).toBe('T1001');
      // The original match is kept, so the UI can show what the matcher said.
      expect(state.rows.find((r) => r.id === row.id)!.match.outcome).toBe('NEEDS_REVIEW');

      const totals = bucketTotals(results(state));
      expect(totals.BILL_RENTER).toEqual({ count: 8, cents: 7133 + 694 });
      expect(totals.NEEDS_REVIEW).toEqual({ count: 2, cents: 2352 - 694 });
    });

    it('to operator expense moves it to OPERATOR_EXPENSE', () => {
      let state = importSample(seedState());
      const row = rowFor(state, 'TX-1011');
      state = reducer(state, resolve(row.id, { kind: 'expense' }));
      expect(state.reviews[row.id].decision).toEqual({ kind: 'expense' });
      expect(currentResult(state, row).outcome).toBe('OPERATOR_EXPENSE');
      expect(bucketTotals(results(state)).OPERATOR_EXPENSE).toEqual({ count: 2, cents: 1338 + 320 });
    });

    it('ignores a trip that is not a candidate', () => {
      const state = importSample(seedState());
      const row = rowFor(state, 'TX-1004');
      expect(reducer(state, resolve(row.id, { kind: 'assign', tripId: 'T1006' }))).toBe(state);
    });

    it('ignores rows that are not NEEDS_REVIEW, and rows already resolved', () => {
      let state = importSample(seedState());
      const billed = rowFor(state, 'TX-1001');
      expect(reducer(state, resolve(billed.id, { kind: 'expense' }))).toBe(state);

      const review = rowFor(state, 'TX-1007');
      state = reducer(state, resolve(review.id, { kind: 'assign', tripId: 'T1004' }));
      expect(reducer(state, resolve(review.id, { kind: 'expense' }))).toBe(state);
    });
  });

  describe('reset', () => {
    it('restores the seed data, so the sample imports cleanly again', () => {
      let state = importSample(seedState());
      state = reducer(state, resolve(rowFor(state, 'TX-1011').id, { kind: 'expense' }));
      state = reducer(state, { type: 'updateSettings', settings: { adminFeeEachCents: 100 } });

      state = reducer(state, { type: 'resetDemo' });
      expect(state).toEqual(seedState());

      state = importSample(state);
      expect(results(state).some((r) => r.outcome === 'DUPLICATE' && r.toll.externalId === 'TX-1001')).toBe(false);
    });
  });
});

describe('persistence', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
  }

  it('round-trips state through storage', () => {
    const storage = memoryStorage();
    const state = importSample(seedState());
    saveState(state, storage);
    expect(loadState(storage)).toEqual(state);
  });

  it('falls back to seed data when storage is empty, corrupt or from another version', () => {
    expect(loadState(memoryStorage())).toEqual(seedState());
    expect(loadState(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(seedState());
    expect(loadState(memoryStorage({ [STORAGE_KEY]: '{"version":99}' }))).toEqual(seedState());
    expect(loadState(undefined)).toEqual(seedState());
  });

  it('never throws when storage itself throws', () => {
    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(loadState(broken)).toEqual(seedState());
    expect(() => saveState(seedState(), broken)).not.toThrow();
  });
});
