import { DateTime } from 'luxon';

/** Same zone every Academy Owner/Holiday/Teacher Leave/Reminders service
 *  uses for "what day is it" boundaries. */
export const ASSESSMENT_TIMEZONE = 'Asia/Kolkata';

/**
 * Monday of the Asia/Kolkata ISO week containing `date` (defaults to now),
 * as a `yyyy-LL-dd` string for the `assessments.week_start_date` column.
 * `DateTime#weekday` is always ISO (1 = Monday) regardless of locale, so
 * `.set({ weekday: 1 })` reliably lands on Monday — unlike `.startOf('week')`,
 * whose first day depends on locale.
 */
export function academicWeekStart(date?: Date | string): string {
  const dt = date
    ? DateTime.fromJSDate(typeof date === 'string' ? new Date(date) : date, {
        zone: ASSESSMENT_TIMEZONE,
      })
    : DateTime.now().setZone(ASSESSMENT_TIMEZONE);
  return dt.set({ weekday: 1 }).startOf('day').toFormat('yyyy-LL-dd');
}
