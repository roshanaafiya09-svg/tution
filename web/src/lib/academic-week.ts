const ASSESSMENT_TIMEZONE = 'Asia/Kolkata';

/**
 * Monday of the Asia/Kolkata ISO week containing `now`, as `yyyy-MM-dd` —
 * the same value the backend stores in `assessments.week_start_date`
 * (backend/src/modules/assessments/academic-week.util.ts), so the two can
 * be compared directly. Reads the Kolkata calendar date regardless of the
 * browser's own timezone.
 */
export function currentAcademicWeekStart(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASSESSMENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA formats as yyyy-MM-dd
  const [year, month, day] = parts.split('-').map(Number);
  // Pure calendar arithmetic in UTC so the browser's DST/timezone can't
  // shift the day.
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoWeekday - 1));
  return date.toISOString().slice(0, 10);
}
