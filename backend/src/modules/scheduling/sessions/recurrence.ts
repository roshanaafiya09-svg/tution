import { RRule } from 'rrule';
import { DateTime } from 'luxon';

export const MAX_OCCURRENCES = 200;

/**
 * Expands an RRULE into concrete UTC session start times.
 *
 * DST correctness (blueprint §12 risk #7) is the whole point of this
 * function. rrule operates on "wall clock" values only, so the sequence
 * is deliberately: take the tutor's local wall-clock time -> expand the
 * recurrence in wall-clock space -> convert each occurrence back to UTC
 * *individually* in the tutor's IANA zone. Adding fixed 24h/7d offsets
 * to a UTC instant instead would silently drift by an hour across a DST
 * boundary, so a "4pm Monday class" would become 3pm or 5pm.
 *
 * India has no DST today, but the launch market widening is a stated
 * goal and this is cheap insurance — the blueprint asks for a DST
 * regression suite even in a single-timezone launch.
 */
export function expandRecurrence(
  firstStartLocal: string,
  timezone: string,
  recurrenceRule: string | null,
  count = MAX_OCCURRENCES,
): Date[] {
  const first = DateTime.fromISO(firstStartLocal, { zone: timezone });
  if (!first.isValid) {
    throw new Error(
      `Invalid start time "${firstStartLocal}" for zone "${timezone}"`,
    );
  }

  if (!recurrenceRule) {
    return [first.toUTC().toJSDate()];
  }

  // rrule's dtstart must be a "floating" UTC date carrying the local
  // wall-clock fields, so expansion happens in wall-clock space.
  const dtstart = new Date(
    Date.UTC(
      first.year,
      first.month - 1,
      first.day,
      first.hour,
      first.minute,
      first.second,
    ),
  );

  const rule = RRule.fromString(
    recurrenceRule.startsWith('RRULE:')
      ? recurrenceRule
      : `RRULE:${recurrenceRule}`,
  );
  const withStart = new RRule({ ...rule.origOptions, dtstart });

  return withStart
    .all((_, index) => index < count)
    .map((occurrence) =>
      DateTime.fromObject(
        {
          year: occurrence.getUTCFullYear(),
          month: occurrence.getUTCMonth() + 1,
          day: occurrence.getUTCDate(),
          hour: occurrence.getUTCHours(),
          minute: occurrence.getUTCMinutes(),
          second: occurrence.getUTCSeconds(),
        },
        { zone: timezone },
      )
        .toUTC()
        .toJSDate(),
    );
}
