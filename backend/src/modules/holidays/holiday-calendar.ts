import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Selectable } from 'kysely';
import { HolidaysRepository } from './holidays.repository';
import type { HolidaysTable } from '../../database/types';

/**
 * The single definition of "which calendar day is this class on, for
 * holiday purposes" and "is that day a holiday for this academy class".
 *
 * Holiday dates are plain calendar dates resolved in one zone. V1 only
 * schedules classes in Asia/Kolkata and academies carry no timezone of
 * their own, so this is the zone HolidayService has always used to cancel
 * classes when a holiday is declared. Class creation uses the same zone
 * so a class and a holiday can never disagree about which day the class
 * falls on (a 00:15 IST class belongs to that IST date, not the previous
 * UTC date).
 */
export const HOLIDAY_TIMEZONE = 'Asia/Kolkata';

/** UTC instant range covering whole holiday days [startDate, endDate]. */
export function holidayDayRangeUtc(startDate: string, endDate: string) {
  const from = DateTime.fromISO(startDate, { zone: HOLIDAY_TIMEZONE })
    .startOf('day')
    .toUTC()
    .toJSDate();
  const to = DateTime.fromISO(endDate, { zone: HOLIDAY_TIMEZONE })
    .endOf('day')
    .toUTC()
    .toJSDate();
  return { from, to };
}

/** The holiday calendar date (YYYY-MM-DD) a class starting at `instant`
 *  falls on. */
export function holidayDateOf(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' })
    .setZone(HOLIDAY_TIMEZONE)
    .toISODate()!;
}

export type Holiday = Selectable<HolidaysTable>;

/**
 * Answers "is this academy class on a holiday?" for class creation. Only
 * Academy classes are ever checked — an Individual batch (academy_id
 * null) has no academy and therefore no academy holidays, and one
 * academy's holidays never reach another academy's classes: the lookup
 * is keyed by the batch's own academy_id, never by the teacher.
 */
@Injectable()
export class AcademyHolidayCalendar {
  constructor(private readonly holidays: HolidaysRepository) {}

  /** For each start instant, the holiday it falls on (or null). */
  async holidaysFor(
    batch: { id: string; academy_id: string | null },
    starts: Date[],
  ): Promise<Array<Holiday | null>> {
    if (batch.academy_id === null || starts.length === 0) {
      return starts.map(() => null);
    }
    const dates = starts.map(holidayDateOf);
    const sorted = [...dates].sort();
    const holidays = await this.holidays.listEffectiveForAcademyBatch(
      batch.academy_id,
      batch.id,
      sorted[0],
      sorted[sorted.length - 1],
    );
    return dates.map(
      (date) =>
        holidays.find((h) => h.start_date <= date && h.end_date >= date) ??
        null,
    );
  }
}
