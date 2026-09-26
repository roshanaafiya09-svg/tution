import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { holidayDateOf, holidayDayRangeUtc } from './holiday-calendar';

export interface LeaveInterval {
  start: Date;
  end: Date;
}

export interface LeaveConflict {
  leaveRequestId: string;
  leaveType: 'full_day' | 'specific_classes';
}

/**
 * Answers "is this teacher on APPROVED leave at this academy during this
 * time?" for class creation, so a new class can't be scheduled into leave
 * the academy already approved. Only ever consulted for Academy classes:
 * a leave request belongs to one (teacher, academy) pair, the lookup is
 * keyed by BOTH, so it can never reach the teacher's Individual classes,
 * another academy's classes, or another teacher.
 *
 * What "the leave's time" means follows the leave model itself (requests
 * carry dates and, for specific-classes leave, a set of classes — never
 * clock times):
 *  - full_day: every instant of the IST calendar days start_date..end_date
 *    (the same zone the leave workflow uses to find the affected classes);
 *  - specific_classes: the time slots of the classes that leave covers.
 * A class collides when its interval overlaps that time using the same
 * half-open convention as the scheduling conflict checks
 * (start < otherEnd AND end > otherStart), so back-to-back is fine.
 *
 * Split out like AcademyHolidayCalendar: it depends only on the (global)
 * database connection, so SchedulingModule can import it without the
 * HolidaysModule <-> SchedulingModule cycle.
 */
@Injectable()
export class TeacherLeaveCalendar {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** For each interval, the approved leave it collides with (or null). */
  async conflictsFor(
    academyId: string | null,
    tutorId: string,
    intervals: LeaveInterval[],
  ): Promise<Array<LeaveConflict | null>> {
    if (academyId === null || intervals.length === 0) {
      return intervals.map(() => null);
    }
    const minStart = new Date(
      Math.min(...intervals.map((i) => i.start.getTime())),
    );
    const maxEnd = new Date(Math.max(...intervals.map((i) => i.end.getTime())));

    const fullDay = await this.db
      .selectFrom('teacher_leave_requests')
      .select(['id', 'start_date', 'end_date'])
      .where('academy_id', '=', academyId)
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'approved')
      .where('leave_type', '=', 'full_day')
      .where('start_date', '<=', holidayDateOf(maxEnd))
      .where('end_date', '>=', holidayDateOf(minStart))
      .execute();

    const specific = await this.db
      .selectFrom('teacher_leave_requests as r')
      .innerJoin(
        'teacher_leave_request_sessions as s',
        's.leave_request_id',
        'r.id',
      )
      .innerJoin('class_sessions as cs', 'cs.id', 's.session_id')
      .select([
        'r.id as leave_request_id',
        'cs.scheduled_start_utc',
        'cs.duration_min',
      ])
      .where('r.academy_id', '=', academyId)
      .where('r.tutor_id', '=', tutorId)
      .where('r.status', '=', 'approved')
      .where('r.leave_type', '=', 'specific_classes')
      .where('cs.scheduled_start_utc', '<', maxEnd)
      .where(
        sql<boolean>`cs.scheduled_start_utc + (cs.duration_min * interval '1 minute') > ${minStart}`,
      )
      .execute();

    const overlaps = (a: LeaveInterval, from: Date, to: Date) =>
      a.start.getTime() < to.getTime() && a.end.getTime() > from.getTime();

    return intervals.map((interval): LeaveConflict | null => {
      for (const leave of fullDay) {
        const { from, to } = holidayDayRangeUtc(
          leave.start_date,
          leave.end_date,
        );
        if (overlaps(interval, from, to)) {
          return { leaveRequestId: leave.id, leaveType: 'full_day' };
        }
      }
      for (const row of specific) {
        const from = row.scheduled_start_utc;
        const to = new Date(from.getTime() + row.duration_min * 60_000);
        if (overlaps(interval, from, to)) {
          return {
            leaveRequestId: row.leave_request_id,
            leaveType: 'specific_classes',
          };
        }
      }
      return null;
    });
  }
}
