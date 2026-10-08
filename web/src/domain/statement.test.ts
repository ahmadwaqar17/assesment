import { describe, expect, it } from 'vitest';
import { parseStatement } from './statement';

const HEADER = 'plate,datetime,plaza,amount,transaction_id';
const NY = 'America/New_York';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseStatement', () => {
  it('parses a valid row into a toll with UTC time and integer cents', () => {
    const result = parseStatement(csv('FLX-4821,2026-10-02 14:12,I-95 Express Lanes,4.75,TX-1001'), NY);
    expect(result).toEqual({
      ok: true,
      tolls: [
        {
          plate: 'FLX-4821',
          occurredAt: '2026-10-02T18:12:00.000Z',
          timezone: NY,
          plaza: 'I-95 Express Lanes',
          amountCents: 475,
          externalId: 'TX-1001',
        },
      ],
    });
  });

  describe('timezone conversion', () => {
    it('attaches the statement timezone, then converts to UTC (23:45 EDT is 03:45 UTC the next day)', () => {
      const result = parseStatement(csv('EVT-1180,2026-10-02 23:45,GWB,17.63,TX-1008'), NY);
      expect(result.ok && result.tolls[0].occurredAt).toBe('2026-10-03T03:45:00.000Z');
    });

    it('uses the chosen timezone, not UTC or the machine timezone', () => {
      const la = parseStatement(csv('EVT-1180,2026-10-02 23:45,GWB,17.63,TX-1008'), 'America/Los_Angeles');
      expect(la.ok && la.tolls[0].occurredAt).toBe('2026-10-03T06:45:00.000Z');
      const utc = parseStatement(csv('EVT-1180,2026-10-02 23:45,GWB,17.63,TX-1008'), 'UTC');
      expect(utc.ok && utc.tolls[0].occurredAt).toBe('2026-10-02T23:45:00.000Z');
    });

    it('handles standard time after the DST change (EST is UTC−5)', () => {
      const result = parseStatement(csv('EVT-1180,2026-12-01 09:00,GWB,17.63,'), NY);
      expect(result.ok && result.tolls[0].occurredAt).toBe('2026-12-01T14:00:00.000Z');
    });

    it('rejects an unknown timezone', () => {
      expect(parseStatement(csv('EVT-1180,2026-10-02 23:45,GWB,17.63,'), 'Mars/Olympus')).toEqual({
        ok: false,
        errors: ['Unknown timezone "Mars/Olympus"'],
      });
    });
  });

  it('accepts a leading $ on the amount', () => {
    const result = parseStatement(csv('FLX-4821,2026-10-02 14:12,Plaza,$4.75,TX-1'), NY);
    expect(result.ok && result.tolls[0].amountCents).toBe(475);
  });

  it('allows an empty transaction_id (no externalId)', () => {
    const result = parseStatement(csv('FLX-4821,2026-10-02 14:12,Plaza,4.75,'), NY);
    expect(result.ok && result.tolls[0]).not.toHaveProperty('externalId');
  });

  it('keeps the plate as written; matching normalizes it later', () => {
    const result = parseStatement(csv('flx 4821,2026-10-02 14:12,Plaza,4.75,'), NY);
    expect(result.ok && result.tolls[0].plate).toBe('flx 4821');
  });

  it('matches column names regardless of case, order and extra columns', () => {
    const text = ['Amount,Plaza,Transaction_ID,Notes,Plate,DateTime', '4.75,Plaza,TX-1,hi,FLX-4821,2026-10-02 14:12'].join('\n');
    const result = parseStatement(text, NY);
    expect(result.ok && result.tolls[0]).toMatchObject({ plate: 'FLX-4821', amountCents: 475, externalId: 'TX-1' });
  });

  it('ignores blank lines, including a trailing newline', () => {
    const result = parseStatement(csv('FLX-4821,2026-10-02 14:12,Plaza,4.75,TX-1', '', 'FLX-4821,2026-10-02 15:12,Plaza,4.75,TX-2') + '\n', NY);
    expect(result.ok && result.tolls).toHaveLength(2);
  });

  describe('validation', () => {
    it('reports missing required columns', () => {
      expect(parseStatement('plate,datetime,amount\nFLX-4821,2026-10-02 14:12,4.75', NY)).toEqual({
        ok: false,
        errors: ['Missing columns: plaza, transaction_id'],
      });
    });

    it('rejects a missing plate, counting the header as row 1', () => {
      expect(parseStatement(csv(',2026-10-02 14:12,Plaza,4.75,TX-1'), NY)).toEqual({
        ok: false,
        errors: ['Row 2: missing plate'],
      });
    });

    it.each(['2026-10-02', '10/02/2026 14:12', '2026-13-02 14:12', '2026-10-02 25:00', ''])(
      'rejects an unreadable date %j',
      (date) => {
        const result = parseStatement(csv(`FLX-4821,${date},Plaza,4.75,TX-1`), NY);
        expect(result).toEqual({
          ok: false,
          errors: [`Row 2: unreadable date "${date}" (expected YYYY-MM-DD HH:mm)`],
        });
      },
    );

    it.each(['abc', '', '4.755'])('rejects an unreadable amount %j', (amount) => {
      expect(parseStatement(csv(`FLX-4821,2026-10-02 14:12,Plaza,${amount},TX-1`), NY)).toEqual({
        ok: false,
        errors: [`Row 2: unreadable amount "${amount}"`],
      });
    });

    it.each(['0', '0.00', '-4.75', '$-1'])('rejects an amount ≤ 0: %j', (amount) => {
      expect(parseStatement(csv(`FLX-4821,2026-10-02 14:12,Plaza,${amount},TX-1`), NY)).toEqual({
        ok: false,
        errors: [`Row 2: amount must be greater than $0 (got "${amount}")`],
      });
    });

    it('imports nothing and lists every problem on every row when any row is invalid', () => {
      const result = parseStatement(
        csv(
          'FLX-4821,2026-10-02 14:12,Plaza,4.75,TX-1', // row 2, fine
          ',yesterday,Plaza,4.75,TX-2', // row 3, two problems
          'FLX-4821,2026-10-02 14:12,Plaza,0,TX-3', // row 4
        ),
        NY,
      );
      expect(result).toEqual({
        ok: false,
        errors: [
          'Row 3: missing plate',
          'Row 3: unreadable date "yesterday" (expected YYYY-MM-DD HH:mm)',
          'Row 4: amount must be greater than $0 (got "0")',
        ],
      });
    });

    it('keeps true file row numbers when there are blank lines', () => {
      const result = parseStatement(csv('FLX-4821,2026-10-02 14:12,Plaza,4.75,TX-1', '', ',2026-10-02 14:12,Plaza,4.75,TX-2'), NY);
      expect(result).toEqual({ ok: false, errors: ['Row 4: missing plate'] });
    });

    it('rejects a statement with no toll rows', () => {
      expect(parseStatement(HEADER + '\n', NY)).toEqual({ ok: false, errors: ['The statement has no toll rows'] });
    });
  });
});
