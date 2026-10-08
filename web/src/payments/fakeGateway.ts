// Deterministic stand-in for Stripe, so the demo runs with zero setup. The outcome depends only on the test card.
import { fnv1a64 } from '../domain/charges';
import type { ChargeOutcome, ChargeRequest, PaymentGateway } from './gateway';

export const FAKE_LEDGER_KEY = 'toll-recovery:fake-gateway:v1';
const DEFAULT_DELAY_MS = 900;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface LedgerEntry {
  amountCents: number;
  outcome: ChargeOutcome;
}

export interface FakeGatewayOptions {
  delayMs?: number;
  storage?: KeyValueStorage; // keeps the idempotency ledger across reloads, like a real provider would
}

function decide(request: ChargeRequest): ChargeOutcome {
  const paymentRef = `pi_fake_${fnv1a64(request.idempotencyKey).slice(0, 14)}`;
  switch (request.paymentMethodId) {
    case 'pm_card_visa':
      return { status: 'paid', paymentRef };
    case 'pm_card_authenticationRequired':
      return {
        status: 'needs_renter_action',
        paymentRef,
        paymentLinkUrl: `https://example.com/pay/${paymentRef}`,
      };
    case 'pm_card_chargeDeclined':
      return { status: 'failed', paymentRef, failureReason: 'Your card was declined.' };
    case undefined:
      return { status: 'failed', failureReason: 'No saved card for this renter.' };
    default:
      return { status: 'failed', failureReason: `Unknown test card "${request.paymentMethodId}".` };
  }
}

export class FakeGateway implements PaymentGateway {
  /** How many times a card was actually charged (cache hits don't count). For tests and the demo. */
  chargeCount = 0;

  private readonly delayMs: number;
  private readonly storage: KeyValueStorage | undefined;
  private readonly inFlight = new Map<string, Promise<ChargeOutcome>>();
  private ledger = new Map<string, LedgerEntry>();

  constructor(options: FakeGatewayOptions = {}) {
    this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.storage = options.storage;
    this.ledger = this.load();
  }

  charge(request: ChargeRequest): Promise<ChargeOutcome> {
    const { idempotencyKey } = request;
    const done = this.ledger.get(idempotencyKey);
    if (done) return Promise.resolve(this.replay(done, request));

    // A second call while the first is still running gets the same promise: one charge, one outcome.
    const running = this.inFlight.get(idempotencyKey);
    if (running) return running;

    const promise = this.wait().then(() => {
      const outcome = decide(request);
      this.chargeCount += 1;
      this.ledger.set(idempotencyKey, { amountCents: request.amountCents, outcome });
      this.inFlight.delete(idempotencyKey);
      this.save();
      return outcome;
    });
    this.inFlight.set(idempotencyKey, promise);
    return promise;
  }

  /** Forget every charge. Only for the demo's Reset button. */
  reset(): void {
    this.ledger.clear();
    this.inFlight.clear();
    this.chargeCount = 0;
    try {
      this.storage?.removeItem(FAKE_LEDGER_KEY);
    } catch {
      // ignore: storage blocked
    }
  }

  private replay(entry: LedgerEntry, request: ChargeRequest): ChargeOutcome {
    // Like Stripe: reusing a key with different parameters is an error, not a new charge.
    if (entry.amountCents !== request.amountCents) {
      return {
        status: 'failed',
        failureReason: 'This idempotency key was already used for a different amount.',
      };
    }
    return entry.outcome;
  }

  private wait(): Promise<void> {
    return this.delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, this.delayMs)) : Promise.resolve();
  }

  private load(): Map<string, LedgerEntry> {
    try {
      const raw = this.storage?.getItem(FAKE_LEDGER_KEY);
      return new Map(raw ? (JSON.parse(raw) as [string, LedgerEntry][]) : []);
    } catch {
      return new Map();
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(FAKE_LEDGER_KEY, JSON.stringify([...this.ledger]));
    } catch {
      // ignore: storage full or blocked
    }
  }
}
