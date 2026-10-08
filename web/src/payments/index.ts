// The gateway the app uses. FakeGateway by default; StripeGateway is an optional later step.
import { FakeGateway } from './fakeGateway';

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export const gateway = new FakeGateway({ storage: browserStorage() });
