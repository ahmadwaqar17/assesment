/** Uppercase, keep only A–Z and 0–9. "flx 4821", "FLX-4821" and "FLX4821" are the same car. */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
