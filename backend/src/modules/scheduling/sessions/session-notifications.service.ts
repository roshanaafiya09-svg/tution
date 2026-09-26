import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { SessionsRepository } from './sessions.repository';
import { BatchesRepository } from '../batches/batches.repository';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { NotificationsService } from '../../notifications/notifications.service';

/** The cancellation actors that are announced the moment they happen (H4).
 *  Holiday and teacher-leave cancellations already have their own
 *  immediate notices (HolidayService / TeacherLeaveService). */
export type ImmediateCancellationReason =
  'teacher_manual' | 'academy_manual' | 'batch_archived';

export const CLASS_CANCELLED_TYPE = 'class_cancelled';
export const CLASS_RESCHEDULED_TYPE = 'class_rescheduled';
export const CLASS_CREATED_TYPE = 'class_created';

interface NoticeSession {
  id: string;
  batch_id: string;
  scheduled_start_utc: Date;
  timezone: string;
}

function when(start: Date, timezone: string): string {
  return DateTime.fromJSDate(start, { zone: 'utc' })
    .setZone(timezone)
    .toFormat('ccc d LLL, h:mm a');
}

function shortHash(parts: string[]): string {
  return createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 32);
}

/**
 * H4: tells a class's students (and their actively-linked parents) about
 * a new class, a cancellation or a reschedule the moment it has been
 * COMMITTED —
 * callers only invoke this after the atomic state change succeeded, never
 * before, so a rejected/raced request never announces anything.
 *
 * Recipients come from the class's own batch roster (active enrollments
 * only), so an Individual class only ever reaches that Individual batch's
 * students and an Academy class only that academy batch's — the batch is
 * the context boundary, nothing here widens it.
 *
 * Delivery is best-effort: the class change itself has already happened
 * and must not be reported as failed because a notification couldn't be
 * written. A cancellation whose notice fails keeps
 * cancellation_notified_at NULL, so the 10-minute cancelled-class sweep
 * (RemindersService) still announces it as a fallback.
 */
@Injectable()
export class SessionNotificationsService {
  private readonly logger = new Logger(SessionNotificationsService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async recipientsForBatch(batchId: string): Promise<string[]> {
    const studentIds =
      await this.batchesRepository.listDistinctStudentIdsForBatches([batchId]);
    const parentIds =
      await this.attendanceRepository.listActiveParentIdsForStudents(
        studentIds,
      );
    return [...new Set([...studentIds, ...parentIds])];
  }

  /**
   * One notice per recipient per cancellation event. A single-class
   * cancel is keyed on the session (`cancelled:<id>`, the same key the
   * 10-minute sweep uses, so the two can never both land); a series /
   * archive cancel is ONE summarised notice keyed on exactly the set of
   * sessions this event cancelled — a repeat of the same request cancels
   * nothing new and so announces nothing.
   */
  async notifyCancelled(
    sessionIds: string[],
    reason: ImmediateCancellationReason,
  ): Promise<void> {
    if (sessionIds.length === 0) return;
    try {
      const sessions = (await this.sessionsRepository.findByIds(sessionIds))
        .filter((s) => s.status === 'cancelled')
        .sort(
          (a, b) =>
            a.scheduled_start_utc.getTime() - b.scheduled_start_utc.getTime(),
        );
      if (sessions.length === 0) return;

      const batchIds = [...new Set(sessions.map((s) => s.batch_id))];
      for (const batchId of batchIds) {
        const batchSessions = sessions.filter((s) => s.batch_id === batchId);
        await this.notifyBatchCancelled(batchId, batchSessions, reason);
      }
      await this.sessionsRepository.markCancellationNotified(
        sessions.map((s) => s.id),
      );
    } catch (err) {
      this.logger.error(
        `Immediate cancellation notice failed for ${sessionIds.length} session(s)`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private async notifyBatchCancelled(
    batchId: string,
    sessions: NoticeSession[],
    reason: ImmediateCancellationReason,
  ): Promise<void> {
    const batch = await this.batchesRepository.findById(batchId);
    const recipients = await this.recipientsForBatch(batchId);
    if (!batch || recipients.length === 0) return;

    const actor = {
      teacher_manual: 'by your teacher',
      academy_manual: 'by the academy',
      batch_archived: '— this batch is no longer active',
    }[reason];
    const first = sessions[0];
    const body =
      sessions.length === 1
        ? `Your ${batch.title} class on ${when(first.scheduled_start_utc, first.timezone)} has been cancelled ${actor}.`
        : `${sessions.length} upcoming ${batch.title} classes (from ${when(first.scheduled_start_utc, first.timezone)}) have been cancelled ${actor}.`;

    await this.notificationsService.notify({
      userIds: recipients,
      type: CLASS_CANCELLED_TYPE,
      title: '🔔 Class Cancelled',
      body,
      payload: {
        sessionIds: sessions.map((s) => s.id),
        ...(sessions.length === 1 ? { sessionId: first.id } : {}),
        batchId,
        reason,
      },
      dedupeKey:
        sessions.length === 1
          ? cancellationDedupeKey(first.id)
          : `cancelled-set:${shortHash(sessions.map((s) => s.id).sort())}`,
    });
  }

  /**
   * A class (or a recurring series) was just created — called only after
   * SessionsRepository.createSeries committed, so a rejected creation
   * (400/403/404/409) never announces anything.
   *
   * Same shape as a cancellation: one notice for a single class, one
   * summarised notice for a series (never one per occurrence). Only
   * occurrences still in the future are announced — a class back-filled
   * into the past isn't "scheduled" news. Recipients are the batch's
   * active roster and their actively-linked parents (the batch is the
   * Individual/Academy boundary, as for every other session notice),
   * minus deleted accounts.
   *
   * Dedupe key `created:<id>` is the created session (or the series'
   * parent session) — the unique (user_id, type, dedupe_key) index makes
   * it one row and one push per recipient however often this runs.
   */
  async notifyCreated(
    parent: NoticeSession & { tutor_id: string; duration_min: number },
    starts: Date[],
  ): Promise<void> {
    try {
      const now = Date.now();
      const upcoming = starts
        .filter((s) => s.getTime() > now)
        .sort((a, b) => a.getTime() - b.getTime());
      if (upcoming.length === 0) return;

      const context = await this.sessionsRepository.findCreationNoticeContext(
        parent.batch_id,
      );
      if (!context) return;
      const recipients = await this.sessionsRepository.filterLiveUserIds(
        await this.recipientsForBatch(parent.batch_id),
      );
      if (recipients.length === 0) return;

      const teacher = context.tutor_display_name
        ? ` with ${context.tutor_display_name}`
        : '';
      const where = context.academy_name ? ` at ${context.academy_name}` : '';
      const first = when(upcoming[0], parent.timezone);
      const body =
        upcoming.length === 1
          ? `Your ${context.batch_title} class${teacher}${where} is scheduled for ${first} (${parent.duration_min} min).`
          : `${upcoming.length} ${context.batch_title} classes${teacher}${where} have been scheduled, starting ${first} (${parent.duration_min} min each).`;

      await this.notificationsService.notify({
        userIds: recipients,
        type: CLASS_CREATED_TYPE,
        title: '🗓️ New class scheduled',
        body,
        payload: {
          sessionId: parent.id,
          batchId: parent.batch_id,
          academyId: context.academy_id,
          scheduledStartUtc: upcoming[0].toISOString(),
          occurrenceCount: upcoming.length,
        },
        dedupeKey: `created:${parent.id}`,
      });
    } catch (err) {
      this.logger.error(
        `Class-created notice failed for session ${parent.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /**
   * Keyed on the session's pre-change version (its updated_at), so the
   * same reschedule retried or raced produces one notice, while a later,
   * genuinely new reschedule of the same class (even back to an earlier
   * time) is a new event with a new key.
   */
  async notifyRescheduled(
    before: NoticeSession & { updated_at: Date; duration_min: number },
    after: NoticeSession & { duration_min: number },
  ): Promise<void> {
    try {
      const batch = await this.batchesRepository.findById(after.batch_id);
      const recipients = await this.recipientsForBatch(after.batch_id);
      if (!batch || recipients.length === 0) return;

      await this.notificationsService.notify({
        userIds: recipients,
        type: CLASS_RESCHEDULED_TYPE,
        title: '📅 Class Rescheduled',
        body: `Your ${batch.title} class on ${when(before.scheduled_start_utc, before.timezone)} has moved to ${when(after.scheduled_start_utc, after.timezone)} (${after.duration_min} min).`,
        payload: {
          sessionId: after.id,
          batchId: after.batch_id,
          previousStartUtc: before.scheduled_start_utc.toISOString(),
          newStartUtc: after.scheduled_start_utc.toISOString(),
          durationMin: after.duration_min,
        },
        dedupeKey: `rescheduled:${after.id}:${before.updated_at.getTime()}`,
      });
    } catch (err) {
      this.logger.error(
        `Reschedule notice failed for session ${after.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}

/** Shared with RemindersService's cancelled-class sweep — same type +
 *  key means an immediate notice and a later sweep can never both land
 *  for the same single-class cancellation. */
export function cancellationDedupeKey(sessionId: string): string {
  return `cancelled:${sessionId}`;
}
