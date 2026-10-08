// Any console.error or console.warn during a test (React warnings included) fails that test.
import { afterEach, beforeEach, expect, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(console, 'error');
  vi.spyOn(console, 'warn');
});

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
