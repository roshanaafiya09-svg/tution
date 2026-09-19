import { DateTime } from 'luxon';

/** Same zone every Academy Owner/Holiday/Teacher Leave/Reminders service
 *  uses for "what day is it" boundaries. */
export const ASSESSMENT_TIMEZONE = 'Asia/Kolkata';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real `yyyy-LL-dd` calendar date — the regex alone lets
 *  "2026-13-45" and "2026-02-30" through, and Postgres then rejects them
 *  with a raw `date/time field value out of range` error (a 500). */
export function isValidCalendarDate(value: string): boolean {
  return (
    DATE_ONLY.test(value) &&
    DateTime.fromFormat(value, 'yyyy-LL-dd', { zone: ASSESSMENT_TIMEZONE })
      .isValid
  );
}

/**
 * Monday of the Asia/Kolkata ISO week containing `date` (defaults to now),
 * as a `yyyy-LL-dd` string for the `assessments.week_start_date` column.
 * `DateTime#weekday` is always ISO (1 = Monday) regardless of locale, so
 * `.set({ weekday: 1 })` reliably lands on Monday — unlike `.startOf('week')`,
 * whose first day depends on locale.
 *
 * A date-only string ("2026-09-15") is read as that Asia/Kolkata calendar
 * day directly. Throws on an unparseable input rather than returning
 * luxon's literal "Invalid DateTime" string, which would otherwise be
 * written into a `date` column.
 */
export function academicWeekStart(date?: Date | string): string {
  let dt: DateTime;
  if (date === undefined) {
    dt = DateTime.now().setZone(ASSESSMENT_TIMEZONE);
  } else if (typeof date === 'string' && DATE_ONLY.test(date)) {
    dt = DateTime.fromISO(date, { zone: ASSESSMENT_TIMEZONE });
  } else {
    dt = DateTime.fromJSDate(typeof date === 'string' ? new Date(date) : date, {
      zone: ASSESSMENT_TIMEZONE,
    });
  }
  if (!dt.isValid) {
    throw new RangeError(`Invalid date for academic week: ${String(date)}`);
  }
  return dt.set({ weekday: 1 }).startOf('day').toFormat('yyyy-LL-dd');
}
