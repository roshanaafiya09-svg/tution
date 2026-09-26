import { DateTime } from 'luxon';

/**
 * Wording for WHEN a class is, relative to now, computed in the class's
 * own timezone (never UTC): "today at 5:00 PM", "tomorrow at 5:00 PM", or
 * an explicit "on Monday, 28 September at 5:00 PM" for any other day —
 * including past days, which never read as "today".
 */
export function classWhen(
  start: Date,
  timezone: string,
  now: Date = new Date(),
): string {
  const local = DateTime.fromJSDate(start, { zone: 'utc' }).setZone(timezone);
  const today = DateTime.fromJSDate(now, { zone: 'utc' })
    .setZone(timezone)
    .startOf('day');
  const days = Math.round(local.startOf('day').diff(today, 'days').days);
  const time = local.toFormat('h:mm a');
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `on ${local.toFormat('cccc, d LLLL')} at ${time}`;
}

/** Sentence subject for a class notice: "Today's Mathematics class at
 *  5:00 PM" / "Tomorrow's Mathematics class at 5:00 PM" / "Your
 *  Mathematics class on Monday, 28 September at 5:00 PM". */
export function classSubject(
  title: string,
  start: Date,
  timezone: string,
  now: Date = new Date(),
): string {
  const when = classWhen(start, timezone, now);
  if (when.startsWith('today ')) {
    return `Today's ${title} class ${when.slice('today '.length)}`;
  }
  if (when.startsWith('tomorrow ')) {
    return `Tomorrow's ${title} class ${when.slice('tomorrow '.length)}`;
  }
  return `Your ${title} class ${when}`;
}
