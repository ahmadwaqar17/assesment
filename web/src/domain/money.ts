// All money is integer cents. Dollars exist only at the edges: parsing input and display.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Parse a dollar string like "4.75", "$17.63", "-2" or ".5" into cents, without floating point.
 * Returns null when the text isn't a readable amount (more than 2 decimals counts as unreadable).
 */
export function parseDollarsToCents(text: string): number | null {
  const match = /^(-)?\$?(\d*)(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/^\$-/, '-$'));
  if (!match) return null;
  const [, minus, whole, fraction = ''] = match;
  if (whole === '' && fraction === '') return null;
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return minus ? -cents : cents;
}
