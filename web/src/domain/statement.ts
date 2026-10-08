// Toll statement CSV: parsing and validation (PROJECT_CONTEXT.md section 5, "Statement validation").
import Papa from 'papaparse';
import { DateTime, IANAZone } from 'luxon';
import { parseDollarsToCents } from './money';
import { normalizePlate } from './plate';
import type { Toll } from './types';

export const REQUIRED_COLUMNS = ['plate', 'datetime', 'plaza', 'amount', 'transaction_id'] as const;
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm';

export type StatementResult =
  | { ok: true; tolls: Toll[] }
  | { ok: false; errors: string[] };

/**
 * Parse a toll statement. Times in the file are local to `timezone` and are stored as UTC.
 * If any row is invalid, nothing is imported and every problem is returned.
 * Row 1 is the header, so the first data row is row 2.
 */
export function parseStatement(csvText: string, timezone: string): StatementResult {
  if (!IANAZone.isValidZone(timezone)) {
    return { ok: false, errors: [`Unknown timezone "${timezone}"`] };
  }

  // Parse as plain arrays (no header mode) so row numbers stay true to the file.
  const rows = Papa.parse<string[]>(csvText.replace(/^﻿/, ''), { header: false }).data;
  const header = (rows[0] ?? []).map((cell) => cell.trim().toLowerCase());

  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`] };
  }
  const col = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<
    (typeof REQUIRED_COLUMNS)[number],
    number
  >;

  const tolls: Toll[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every((cell) => cell.trim() === '')) return; // blank line

    const cell = (name: keyof typeof col) => (cells[col[name]] ?? '').trim();
    const rowErrors: string[] = [];

    const plate = cell('plate');
    if (normalizePlate(plate) === '') rowErrors.push('missing plate');

    const rawDate = cell('datetime');
    const local = DateTime.fromFormat(rawDate, DATETIME_FORMAT, { zone: timezone });
    if (!local.isValid) {
      rowErrors.push(`unreadable date "${rawDate}" (expected YYYY-MM-DD HH:mm)`);
    }

    const rawAmount = cell('amount');
    const amountCents = parseDollarsToCents(rawAmount);
    if (amountCents === null) {
      rowErrors.push(`unreadable amount "${rawAmount}"`);
    } else if (amountCents <= 0) {
      rowErrors.push(`amount must be greater than $0 (got "${rawAmount}")`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors.map((problem) => `Row ${rowNumber}: ${problem}`));
      return;
    }

    const externalId = cell('transaction_id');
    tolls.push({
      plate,
      occurredAt: local.toUTC().toISO()!,
      timezone,
      plaza: cell('plaza'),
      amountCents: amountCents!,
      ...(externalId ? { externalId } : {}),
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (tolls.length === 0) return { ok: false, errors: ['The statement has no toll rows'] };
  return { ok: true, tolls };
}
