import { types } from 'pg';

const DATE_OID = 1082;
const INT8_OID = 20;
const NUMERIC_OID = 1700;

/**
 * node-postgres parses DATE columns into JS Date objects at local
 * midnight, so serializing back to an ISO string shifts the day for any
 * timezone behind/ahead of UTC — "2026-08-01" round-trips as
 * "2026-07-31T18:30:00.000Z" in IST. Date-only columns
 * (tutor_availability.effective_from, availability exception dates) have
 * no time or zone by definition, so they're kept as plain YYYY-MM-DD
 * strings. Blueprint §12 risk #7 (timezone/DST bugs) is exactly this.
 *
 * int8 is also parsed as a string by default to avoid precision loss;
 * our int8 columns (size_bytes) are far below Number.MAX_SAFE_INTEGER,
 * so returning a real number is safe and keeps the API honest.
 */
export function configurePgTypeParsers(): void {
  types.setTypeParser(DATE_OID, (value: string) => value);
  types.setTypeParser(INT8_OID, (value: string) => Number(value));
  types.setTypeParser(NUMERIC_OID, (value: string) => Number(value));
}
