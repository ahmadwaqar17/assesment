import { describe, expect, it } from 'vitest';
import { normalizePlate } from './plate';

describe('normalizePlate', () => {
  it('treats "flx 4821", "FLX-4821" and "FLX4821" as the same car', () => {
    expect(normalizePlate('flx 4821')).toBe('FLX4821');
    expect(normalizePlate('FLX-4821')).toBe('FLX4821');
    expect(normalizePlate('FLX4821')).toBe('FLX4821');
  });

  it('removes everything except A–Z and 0–9', () => {
    expect(normalizePlate(' k.t·r_99/35 ')).toBe('KTR9935');
  });

  it('returns an empty string when nothing readable is left', () => {
    expect(normalizePlate(' - ')).toBe('');
  });
});
