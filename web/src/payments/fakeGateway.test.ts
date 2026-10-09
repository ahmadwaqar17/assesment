import { describe, expect, it } from 'vitest';
import { FAKE_LEDGER_KEY, FakeGateway } from './fakeGateway';
import type { ChargeRequest } from './gateway';

const request = (overrides: Partial<ChargeRequest> = {}): ChargeRequest => ({
  tripId: 'T1001',
  amountCents: 2238,
  paymentMethodId: 'pm_card_visa',
  description: 'Tolls',
  idempotencyKey: 'tolls-T1001-abc',
  ...overrides,
});

function memoryStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('FakeGateway', () => {
  it('is deterministic by test card', async () => {
    const gateway = new FakeGateway({ delayMs: 0 });
    expect(await gateway.charge(request({ idempotencyKey: 'a' }))).toMatchObject({ status: 'paid' });
    expect(
      await gateway.charge(request({ idempotencyKey: 'b', paymentMethodId: 'pm_card_authenticationRequired' })),
    ).toMatchObject({ status: 'needs_renter_action', paymentLinkUrl: expect.stringMatching(/^https:\/\/example\.com\/pay\/pi_fake_/) });
    expect(
      await gateway.charge(request({ idempotencyKey: 'c', paymentMethodId: 'pm_card_chargeDeclined' })),
    ).toMatchObject({ status: 'failed', failureReason: 'Your card was declined.' });
    expect(await gateway.charge(request({ idempotencyKey: 'd', paymentMethodId: undefined }))).toEqual({
      status: 'failed',
      failureReason: 'No saved card for this renter.',
    });
  });

  it('returns the same outcome for the same idempotency key without charging again', async () => {
    const gateway = new FakeGateway({ delayMs: 0 });
    const first = await gateway.charge(request());
    const second = await gateway.charge(request());
    expect(second).toEqual(first);
    expect(gateway.chargeCount).toBe(1);
  });

  it('charges once when the same key is sent twice at the same time', async () => {
    const gateway = new FakeGateway({ delayMs: 5 });
    const [a, b] = await Promise.all([gateway.charge(request()), gateway.charge(request())]);
    expect(a).toEqual(b);
    expect(gateway.chargeCount).toBe(1);
  });

  it('refuses to reuse a key for a different amount', async () => {
    const gateway = new FakeGateway({ delayMs: 0 });
    await gateway.charge(request());
    expect(await gateway.charge(request({ amountCents: 9999 }))).toMatchObject({ status: 'failed' });
    expect(gateway.chargeCount).toBe(1);
  });

  it('waits a little so the UI can show a loading state', async () => {
    const gateway = new FakeGateway({ delayMs: 30 });
    const started = Date.now();
    await gateway.charge(request());
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  it('remembers keys across reloads through storage, and forgets them on reset', async () => {
    const storage = memoryStorage();
    await new FakeGateway({ delayMs: 0, storage }).charge(request());
    expect(storage.data[FAKE_LEDGER_KEY]).toBeDefined();

    const afterReload = new FakeGateway({ delayMs: 0, storage });
    await afterReload.charge(request());
    expect(afterReload.chargeCount).toBe(0); // replayed, not charged

    afterReload.reset();
    expect(storage.data[FAKE_LEDGER_KEY]).toBeUndefined();
  });
});
