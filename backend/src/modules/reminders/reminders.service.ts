import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { HolidayService } from '../holidays/holiday.service';
import { HolidaysRepository } from '../holidays/holidays.repository';
import type { ClassSessionCancellationReason } from '../../database/types';

const REMINDER_LEAD_MINUTES = 10;
const REMINDER_TYPE = 'class_reminder';
const CANCELLED_REMINDER_TYPE = 'class_cancelled_reminder';
const HOLIDAY_REMINDER_TYPE = 'holiday_class_reminder';
const DEDUPE_LOOKBACK_MS = 60 * 60_000;

interface ScheduledReminderRow {
  id: string;
  batch_id: string;
  batch_title: string;
  substitute_display_name: string | null;
}

interface CancelledReminderRow {
  id: string;
  batch_id: string;
  batch_title: string;
  scheduled_start_utc: Date;
  timezone: string;
  cancellation_reason: ClassSessionCancellationReason | null;
  holiday_id: string | null;
  teacher_leave_request_id: string | null;
}

function classTime(row: {
  scheduled_start_utc: Date;
  timezone: string;
}): string {
  return DateTime.fromJSDate(row.scheduled_start_utc, { zone: 'utc' })
    .setZone(row.timezone)
    .toFormat('h:mm a');
}

/**
 * The 10-minute class reminder (spec §9), its sibling cancelled-class /
 * holiday reminders (a later addition — see the two new methods below),
 * and the daily government-holiday sweep (spec §7/§18) — all riding the
 * same @nestjs/schedule in-process cron introduced for this feature.
 *
 * There are now three distinct 10-minutes-before notification paths,
 * each with its own `type` (so idempotency dedupe never crosses paths)
 * and each targeting the exact same recipients an unaffected class's
 * reminder would have gone to:
 *  - REMINDER_TYPE: a `scheduled` class — the original, unchanged.
 *  - CANCELLED_REMINDER_TYPE: a class cancelled by teacher leave or a
 *    plain manual cancel — one notification per session, naming that
 *    specific class.
 *  - HOLIDAY_REMINDER_TYPE: a class cancelled by a government or academy
 *    holiday — grouped per recipient so a student with several classes
 *    cancelled by the *same* holiday in the *same* reminder tick gets
 *    one message, not one per class.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly notificationsService: NotificationsService,
    private readonly holidayService: HolidayService,
    private readonly holidaysRepository: HolidaysRepository,
  ) {}

  /**
   * Every minute, looks 10 minutes ahead (a ±30s window keyed to the
   * exact target instant, since this runs once a minute) and drives all
   * three reminder paths off the same window — a cancelled class's
   * `scheduled_start_utc` never changes when it's cancelled, so "10
   * minutes before the class that would have run" is exactly this same
   * window applied to `status = 'cancelled'` rows instead.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendUpcomingClassReminders(): Promise<void> {
    const target = new Date(Date.now() + REMINDER_LEAD_MINUTES * 60_000);
    const windowStart = new Date(target.getTime() - 30_000);
    const windowEnd = new Date(target.getTime() + 30_000);

    const scheduled =
      await this.sessionsRepository.listScheduledRemindersBetween(
        windowStart,
        windowEnd,
      );
    for (const session of scheduled) {
      try {
        await this.remindOne(session);
      } catch (err) {
        this.logger.error(
          `Reminder failed for session ${session.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    try {
      await this.remindCancelled(windowStart, windowEnd);
    } catch (err) {
      this.logger.error(
        'Cancelled-class reminder sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private async remindOne(session: ScheduledReminderRow): Promise<void> {
    const studentIds =
      await this.batchesRepository.listDistinctStudentIdsForBatches([
        session.batch_id,
      ]);
    const parentIds =
      await this.attendanceRepository.listActiveParentIdsForStudents(
        studentIds,
      );
    const candidateIds = [...new Set([...studentIds, ...parentIds])];
    if (candidateIds.length === 0) return;

    // Same recent-notification-by-type-and-payload dedupe used throughout
    // this feature — a restart mid-minute re-running this tick must never
    // send the same reminder twice (spec §18's idempotency requirement).
    const since = new Date(Date.now() - DEDUPE_LOOKBACK_MS);
    const recipientIds: string[] = [];
    for (const userId of candidateIds) {
      const recent = await this.notificationsService.listRecentForUserByType(
        userId,
        REMINDER_TYPE,
        since,
      );
      const alreadySent = recent.some((n) => {
        const payload = n.payload as { sessionId?: string };
        return payload.sessionId === session.id;
      });
      if (!alreadySent) recipientIds.push(userId);
    }
    if (recipientIds.length === 0) return;

    const substituteNote = session.substitute_display_name
      ? ` (conducted by ${session.substitute_display_name})`
      : '';
    await this.notificationsService.notify({
      userIds: recipientIds,
      type: REMINDER_TYPE,
      title: '📚 Class reminder',
      body: `Your ${session.batch_title} class starts in ${REMINDER_LEAD_MINUTES} minutes${substituteNote}.`,
      payload: { sessionId: session.id },
      // H7: DB-backed backstop on top of the app-level check above — see
      // NotificationsRepository.createMany's doc comment.
      dedupeKey: `reminder:${session.id}:upcoming`,
    });
  }

  /**
   * The cancelled-class/holiday reminder sweep — deliberately separate
   * from remindOne rather than folded into the same query, since it
   * targets `status = 'cancelled'` rows (remindOne's query only ever
   * returns `scheduled` ones) and has its own per-reason copy and its
   * own grouped-by-recipient dedupe for the holiday case.
   */
  private async remindCancelled(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    const cancelled =
      await this.sessionsRepository.listCancelledRemindersBetween(
        windowStart,
        windowEnd,
      );
    if (cancelled.length === 0) return;

    const individual = cancelled.filter(
      (s) =>
        s.cancellation_reason === 'teacher_leave' ||
        s.cancellation_reason === 'teacher_manual' ||
        s.cancellation_reason === 'academy_manual' ||
        s.cancellation_reason === 'batch_archived' ||
        s.cancellation_reason === 'manual', // legacy rows predating the H4 reason split
    );
    const holidayCaused = cancelled.filter(
      (s) =>
        s.cancellation_reason === 'government_holiday' ||
        s.cancellation_reason === 'academy_holiday',
    );

    for (const session of individual) {
      try {
        await this.remindOneCancelled(session);
      } catch (err) {
        this.logger.error(
          `Cancelled-class reminder failed for session ${session.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    if (holidayCaused.length > 0) {
      try {
        await this.remindHolidayCancelledGroup(holidayCaused);
      } catch (err) {
        this.logger.error(
          'Holiday reminder group failed',
          err instanceof Error ? err.stack : err,
        );
      }
    }
  }

  /** teacher_leave / manual — one notification per session, naming that
   *  specific class, matching the spec's per-class copy examples. */
  private async remindOneCancelled(
    session: CancelledReminderRow,
  ): Promise<void> {
    const studentIds =
      await this.batchesRepository.listDistinctStudentIdsForBatches([
        session.batch_id,
      ]);
    const parentIds =
      await this.attendanceRepository.listActiveParentIdsForStudents(
        studentIds,
      );
    const candidateIds = [...new Set([...studentIds, ...parentIds])];
    if (candidateIds.length === 0) return;

    const since = new Date(Date.now() - DEDUPE_LOOKBACK_MS);
    const recipientIds: string[] = [];
    for (const userId of candidateIds) {
      const recent = await this.notificationsService.listRecentForUserByType(
        userId,
        CANCELLED_REMINDER_TYPE,
        since,
      );
      const alreadySent = recent.some((n) => {
        const payload = n.payload as { sessionId?: string };
        return payload.sessionId === session.id;
      });
      if (!alreadySent) recipientIds.push(userId);
    }
    if (recipientIds.length === 0) return;

    const time = classTime(session);
    // H4: cancellation_reason now distinguishes WHO cancelled — every
    // manual cancel used to be tagged the same 'manual' value, so this
    // used to say "cancelled by the academy" even for a teacher's own
    // cancel of a private Individual class. A legacy 'manual' row
    // (cancelled before this reason split shipped) falls back to a
    // neutral message rather than guessing which actor it was.
    const body = (() => {
      switch (session.cancellation_reason) {
        case 'teacher_leave':
          return `Your ${session.batch_title} class at ${time} today has been cancelled because your teacher is on approved leave.`;
        case 'teacher_manual':
          return `Your ${session.batch_title} class at ${time} today has been cancelled by your teacher.`;
        case 'academy_manual':
          return `Your ${session.batch_title} class at ${time} today has been cancelled by the academy.`;
        case 'batch_archived':
          return `Your ${session.batch_title} class at ${time} today has been cancelled — this batch is no longer active.`;
        default:
          return `Your ${session.batch_title} class at ${time} today has been cancelled.`;
      }
    })();

    await this.notificationsService.notify({
      userIds: recipientIds,
      type: CANCELLED_REMINDER_TYPE,
      title: '🔔 Class Cancelled',
      body,
      payload: { sessionId: session.id, reason: session.cancellation_reason },
      // H7: DB-backed backstop — see remindOneUpcoming's identical use.
      dedupeKey: `reminder:${session.id}:cancelled`,
    });
  }

  /** government_holiday / academy_holiday — grouped per recipient so a
   *  student with several classes cancelled by the *same* holiday in
   *  this *same* reminder tick gets one message, not one per class
   *  (spec: "do not spam a student ... use appropriate deduplication"). */
  private async remindHolidayCancelledGroup(
    sessions: CancelledReminderRow[],
  ): Promise<void> {
    const recipientSessions = new Map<string, CancelledReminderRow[]>();
    for (const session of sessions) {
      const studentIds =
        await this.batchesRepository.listDistinctStudentIdsForBatches([
          session.batch_id,
        ]);
      const parentIds =
        await this.attendanceRepository.listActiveParentIdsForStudents(
          studentIds,
        );
      for (const userId of [...new Set([...studentIds, ...parentIds])]) {
        const list = recipientSessions.get(userId) ?? [];
        list.push(session);
        recipientSessions.set(userId, list);
      }
    }
    if (recipientSessions.size === 0) return;

    // Holiday names are looked up once per distinct holiday in this
    // batch, not once per session — the group is usually all one holiday.
    const holidayNames = new Map<string, string>();
    for (const holidayId of new Set(
      sessions.map((s) => s.holiday_id).filter((id): id is string => !!id),
    )) {
      const holiday = await this.holidaysRepository.findById(holidayId);
      if (holiday) holidayNames.set(holidayId, holiday.name);
    }

    const since = new Date(Date.now() - DEDUPE_LOOKBACK_MS);
    for (const [userId, userSessions] of recipientSessions) {
      const recent = await this.notificationsService.listRecentForUserByType(
        userId,
        HOLIDAY_REMINDER_TYPE,
        since,
      );
      const alreadyNotifiedSessionIds = new Set<string>();
      for (const n of recent) {
        const payload = n.payload as { sessionIds?: string[] };
        for (const id of payload.sessionIds ?? [])
          alreadyNotifiedSessionIds.add(id);
      }
      const newSessions = userSessions.filter(
        (s) => !alreadyNotifiedSessionIds.has(s.id),
      );
      if (newSessions.length === 0) continue;

      const { title, body } = this.holidayReminderCopy(
        newSessions,
        holidayNames,
      );
      await this.notificationsService.notify({
        userIds: [userId],
        type: HOLIDAY_REMINDER_TYPE,
        title,
        body,
        payload: { sessionIds: newSessions.map((s) => s.id) },
      });
    }
  }

  private holidayReminderCopy(
    sessions: CancelledReminderRow[],
    holidayNames: Map<string, string>,
  ): { title: string; body: string } {
    const isGovernment =
      sessions[0].cancellation_reason === 'government_holiday';
    const title = isGovernment ? '🇮🇳 Holiday Reminder' : '🔔 Holiday Reminder';
    const holidayName = sessions[0].holiday_id
      ? (holidayNames.get(sessions[0].holiday_id) ?? 'a holiday')
      : 'a holiday';

    if (sessions.length === 1) {
      const time = classTime(sessions[0]);
      const body = isGovernment
        ? `There is no ${sessions[0].batch_title} class at ${time} today because today is ${holidayName === 'a holiday' ? 'a government holiday' : `${holidayName}, a government holiday`}.`
        : `There is no ${sessions[0].batch_title} class at ${time} today because the academy is closed for ${holidayName}.`;
      return { title, body };
    }

    const classList = sessions
      .map((s) => `${s.batch_title} at ${classTime(s)}`)
      .join(', ');
    const body = isGovernment
      ? `Your classes today (${classList}) will not take place because today is ${holidayName === 'a holiday' ? 'a government holiday' : `${holidayName}, a government holiday`}.`
      : `Your classes today (${classList}) will not take place because the academy is closed for ${holidayName}.`;
    return { title, body };
  }

  /** Once a day, sweeps every academy that has opted into automatic
   *  government-holiday observance — see HolidayService.
   *  applyGovernmentHolidaysForToday's doc comment for the idempotency
   *  guarantee that makes running this daily (rather than only once per
   *  holiday) safe. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Asia/Kolkata' })
  async applyGovernmentHolidays(): Promise<void> {
    try {
      await this.holidayService.applyGovernmentHolidaysForToday();
    } catch (err) {
      this.logger.error(
        'Government holiday sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
