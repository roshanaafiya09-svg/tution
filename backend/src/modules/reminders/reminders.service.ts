import { createHash } from 'node:crypto';
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
import {
  CLASS_CANCELLED_TYPE,
  cancellationDedupeKey,
} from '../scheduling/sessions/session-notifications.service';

const REMINDER_LEAD_MINUTES = 10;
const REMINDER_TYPE = 'class_reminder';
const CANCELLED_REMINDER_TYPE = 'class_cancelled_reminder';
const HOLIDAY_REMINDER_TYPE = 'holiday_class_reminder';
const DEDUPE_LOOKBACK_MS = 60 * 60_000;

interface ScheduledReminderRow {
  id: string;
  batch_id: string;
  batch_title: string;
  scheduled_start_utc: Date;
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
  cancellation_notified_at: Date | null;
}

/** Cancellations by a person or an archive, rather than by leave or a
 *  holiday. These are announced the moment they happen
 *  (SessionNotificationsService); this sweep is only their fallback. */
const ACTOR_CANCELLATION_REASONS = new Set<string>([
  'teacher_manual',
  'academy_manual',
  'batch_archived',
  'manual', // legacy rows predating the H4 reason split
]);

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
 * A teacher/academy/archive cancellation is announced immediately when
 * it happens (H4) and is NOT re-announced here; this sweep only covers
 * one whose immediate notice never went out (cancelled before that
 * existed, or its delivery failed), under the SAME type + dedupe key the
 * immediate notice uses, so the two can never both land.
 *
 * DEPLOYMENT ASSUMPTION — SINGLE INSTANCE (H7). These @Cron jobs run
 * in-process in every API instance; there is no distributed lock or
 * leader election. Production today runs exactly one instance
 * (render.yaml: one web service, no separate worker/cron service), so
 * each tick runs once. Duplicate *processing* (a restart re-running a
 * tick, an overlapping slow tick, or a second instance) is still made
 * safe at the data layer: every notification sent from here carries a
 * deterministic dedupe key, and notifications(user_id, type, dedupe_key)
 * has a partial unique index (migration 0043) inserted with ON CONFLICT
 * DO NOTHING — so a duplicate run writes and pushes nothing new. What that
 * does NOT give is "each job runs on one instance": with several
 * instances every one of them would still do the work (and race on the
 * index). Scaling beyond one instance should move these jobs to a single
 * scheduler (a dedicated worker/cron service, or a lock such as a
 * Postgres advisory lock / Redis lease) — that infrastructure does not
 * exist today.
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
    // The class may have been cancelled or moved since the sweep's query
    // ran — a cancelled class must never get a "starts in 10 minutes".
    const current = await this.sessionsRepository.findById(session.id);
    if (
      !current ||
      current.status !== 'scheduled' ||
      current.scheduled_start_utc.getTime() !==
        session.scheduled_start_utc.getTime()
    ) {
      return;
    }
    const startIso = session.scheduled_start_utc.toISOString();

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
      // Keyed on the class's start time too: a class rescheduled after its
      // reminder went out still gets a reminder for its new time.
      const alreadySent = recent.some((n) => {
        const payload = n.payload as {
          sessionId?: string;
          scheduledStartUtc?: string;
        };
        return (
          payload.sessionId === session.id &&
          (payload.scheduledStartUtc === undefined ||
            payload.scheduledStartUtc === startIso)
        );
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
      payload: { sessionId: session.id, scheduledStartUtc: startIso },
      // H7: DB-backed backstop on top of the app-level check above — see
      // NotificationsRepository.createMany's doc comment.
      dedupeKey: `reminder:${session.id}:upcoming:${startIso}`,
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
        (s.cancellation_reason !== null &&
          ACTOR_CANCELLATION_REASONS.has(s.cancellation_reason) &&
          // Already announced the moment it was cancelled (H4).
          s.cancellation_notified_at === null),
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

    // An actor cancellation (teacher/academy/archive) shares the type and
    // dedupe key of the immediate notice, so if that notice did go out
    // after all, this is a no-op; teacher leave keeps its own day-of
    // reminder type (its immediate notice is a different event).
    const isActorCancellation = ACTOR_CANCELLATION_REASONS.has(
      session.cancellation_reason ?? '',
    );
    const type = isActorCancellation
      ? CLASS_CANCELLED_TYPE
      : CANCELLED_REMINDER_TYPE;

    const since = new Date(Date.now() - DEDUPE_LOOKBACK_MS);
    const recipientIds: string[] = [];
    for (const userId of candidateIds) {
      const recent = await this.notificationsService.listRecentForUserByType(
        userId,
        type,
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
      type,
      title: '🔔 Class Cancelled',
      body,
      payload: { sessionId: session.id, reason: session.cancellation_reason },
      // H7: DB-backed backstop — see remindOne's identical use.
      dedupeKey: isActorCancellation
        ? cancellationDedupeKey(session.id)
        : `reminder:${session.id}:cancelled`,
    });
    if (isActorCancellation) {
      await this.sessionsRepository.markCancellationNotified([session.id]);
    }
  }

  /** government_holiday / academy_holiday — grouped per recipient AND
   *  per holiday, so a student with several classes cancelled by the
   *  *same* holiday in this *same* reminder tick gets one message, not
   *  one per class (spec: "do not spam a student ... use appropriate
   *  deduplication"). Two different holidays are never merged into one
   *  message (H7 — the copy names one holiday, so merging used to
   *  attribute the second holiday's classes to the first). */
  private async remindHolidayCancelledGroup(
    sessions: CancelledReminderRow[],
  ): Promise<void> {
    const byHoliday = new Map<string, CancelledReminderRow[]>();
    for (const session of sessions) {
      const key = session.holiday_id ?? '-';
      byHoliday.set(key, [...(byHoliday.get(key) ?? []), session]);
    }
    for (const holidaySessions of byHoliday.values()) {
      await this.remindOneHolidayGroup(holidaySessions);
    }
  }

  private async remindOneHolidayGroup(
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
        // H7: this used to rely only on the read-then-write check above,
        // which two overlapping runs can both pass. The key is the exact
        // set of holiday-cancelled classes this message covers (ids are
        // unique per class, and each class carries its own holiday_id), so
        // a re-run or a concurrent run for the same classes collides on
        // the unique index, while different holidays / different classes
        // always produce different keys and are never merged.
        dedupeKey: holidayGroupDedupeKey(newSessions),
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

/** Deterministic key for one grouped holiday reminder — see its use in
 *  remindHolidayCancelledGroup. */
export function holidayGroupDedupeKey(
  sessions: Array<{ id: string; holiday_id: string | null }>,
): string {
  const parts = sessions.map((s) => `${s.holiday_id ?? '-'}:${s.id}`).sort();
  const digest = createHash('sha256').update(parts.join('|')).digest('hex');
  return `holiday-reminder:${digest.slice(0, 32)}`;
}
