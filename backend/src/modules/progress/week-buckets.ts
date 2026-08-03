const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Monday-start ISO week, UTC — matches the class_sessions/attendance
 *  scheduling discipline elsewhere in this codebase (UTC storage, IST
 *  wall-clock only where it's user-facing, which a week bucket isn't). */
function isoWeekStartDate(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function weekKey(date: Date): string {
  return isoWeekStartDate(date).toISOString().slice(0, 10);
}

/** The last `weeks` Monday-start dates, oldest first, ending on the
 *  current week — the fixed set of buckets a trend view zero-fills, so
 *  a quiet week shows as zero rather than a gap in the chart. */
export function recentWeekStarts(weeks: number, now = new Date()): Date[] {
  const currentWeekStart = isoWeekStartDate(now);
  const result: Date[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    result.push(new Date(currentWeekStart.getTime() - i * WEEK_MS));
  }
  return result;
}

/** Groups `rows` into a Map keyed by week-start (YYYY-MM-DD), for every
 *  week in `weekStarts` — rows outside that window are dropped, not
 *  bucketed into an edge week. */
export function bucketByWeek<T>(
  rows: T[],
  dateOf: (row: T) => Date,
  weekStarts: Date[],
): Map<string, T[]> {
  const keys = new Set(weekStarts.map((d) => weekKey(d)));
  const buckets = new Map<string, T[]>(weekStarts.map((d) => [weekKey(d), []]));
  for (const row of rows) {
    const key = weekKey(dateOf(row));
    if (keys.has(key)) buckets.get(key)!.push(row);
  }
  return buckets;
}

/** Simple two-half average comparison — not a regression line, just
 *  enough signal to label a metric "up"/"down"/"flat" for a headline
 *  stat tile. Ignores nulls (weeks with no data) rather than treating
 *  them as zero, so quiet weeks don't drag a rate down artificially. */
export function trendDirection(
  values: (number | null)[],
): 'up' | 'down' | 'flat' {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return 'flat';
  const mid = Math.floor(present.length / 2);
  const avg = (arr: number[]) =>
    arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const delta = avg(present.slice(mid)) - avg(present.slice(0, mid));
  if (Math.abs(delta) < 1) return 'flat';
  return delta > 0 ? 'up' : 'down';
}
