import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Selectable } from 'kysely';
import { DateTime } from 'luxon';
import { SessionsRepository } from './sessions.repository';
import { BatchesService } from '../batches/batches.service';
import { TeachingContextService } from '../../teaching-context/teaching-context.service';
import {
  academyIdOf,
  currentTeachingContext,
  type TeachingContext,
} from '../../teaching-context/teaching-context';
import { expandRecurrence } from './recurrence';
import {
  SessionNotificationsService,
  type RescheduleActor,
} from './session-notifications.service';
import type { CreateSessionDto } from './dto/create-session.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';
import type { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { ErrorCode } from '../../../common/http/error-codes';
import type { ClassSessionsTable } from '../../../database/types';
import {
  AcademyHolidayCalendar,
  holidayDateOf,
} from '../../holidays/holiday-calendar';
import { TeacherLeaveCalendar } from '../../holidays/teacher-leave-calendar';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function formatHolidayDate(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat('ccc d LLL yyyy');
}

type SessionRow = Selectable<ClassSessionsTable>;

@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly batchesService: BatchesService,
    private readonly teachingContext: TeachingContextService,
    private readonly notices: SessionNotificationsService,
    private readonly holidayCalendar: AcademyHolidayCalendar,
    private readonly leaveCalendar: TeacherLeaveCalendar,
  ) {}

  /** Teacher path: the tutor must own the batch AND (via the request's
   *  verified teaching context) be operating in the batch's own context —
   *  an Academy profile cannot schedule a class on a private Individual
   *  batch. */
  async create(tutorId: string, dto: CreateSessionDto) {
    const batch = await this.batchesService.getOwnedBatch(tutorId, dto.batchId);
    this.assertBatchActive(batch);
    return this.createSeries(tutorId, batch, dto);
  }

  /** Academy path: the batch must be owned by THIS academy (not merely
   *  taught by one of its members) and its teacher must still be an
   *  active member. */
  async createForAcademy(academyId: string, dto: CreateSessionDto) {
    const batch = await this.batchesService.getAcademyBatch(
      academyId,
      dto.batchId,
    );
    this.assertBatchActive(batch);
    await this.teachingContext.assertActiveMember(academyId, batch.tutor_id);
    return this.createSeries(batch.tutor_id, batch, dto);
  }

  /** H11: nothing stops a NEW session being scheduled on an archived
   *  batch without this — archive's own cascade (BatchesRepository.
   *  archive) only cancels what already existed at that moment. */
  private assertBatchActive(batch: { status: string }) {
    if (batch.status !== 'active') {
      throw new ConflictException({
        code: ErrorCode.BATCH_ARCHIVED,
        message: 'This batch is archived and can no longer be scheduled.',
      });
    }
  }

  /**
   * The ONLY path that creates class_sessions rows (teacher POST /sessions,
   * academy POST /academy/me/batches/:id/sessions, and the mobile app all
   * land here), so the holiday rule and the class-created notice below
   * cover every caller.
   *
   * Academy holidays: `batch` is the row the caller's ownership check
   * already loaded from the database (getOwnedBatch/getAcademyBatch), so
   * its academy_id is trusted — never a client-supplied value. An
   * occurrence falling on a holiday of that academy batch is never
   * created as a normal scheduled class:
   *  - a single class on a holiday is rejected (409 ACADEMY_HOLIDAY);
   *  - a recurring series skips its holiday occurrences and creates the
   *    rest — the same end state the existing holiday model produces
   *    when a holiday is declared after a series exists (only that one
   *    occurrence stops running). The whole series is rejected only if
   *    every occurrence is a holiday. The skipped dates are returned in
   *    `skipped_holiday_occurrences` so the UI can say so.
   * Unlike a teacher/batch time conflict (which rejects the whole series
   * because the teacher can pick another time), a holiday is the
   * academy's decision, not something the teacher can resolve.
   *
   * Nothing is written and nobody is notified unless every check passes;
   * the insert itself is one transaction (SessionsRepository.createSeries)
   * and the notice is only sent after it commits.
   */
  private async createSeries(
    tutorId: string,
    batch: { id: string; academy_id: string | null },
    dto: CreateSessionDto,
  ) {
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    const occurrences = expandRecurrence(
      dto.startLocal,
      timezone,
      dto.recurrenceRule ?? null,
    );

    const holidays = await this.holidayCalendar.holidaysFor(batch, occurrences);
    const kept = occurrences.filter((_, i) => holidays[i] === null);
    const skipped = occurrences.flatMap((start, i) => {
      const holiday = holidays[i];
      return holiday
        ? [
            {
              scheduled_start_utc: start,
              date: holidayDateOf(start),
              holiday_name: holiday.name,
            },
          ]
        : [];
    });
    if (kept.length === 0) {
      const first = skipped[0];
      throw new ConflictException({
        code: ErrorCode.ACADEMY_HOLIDAY,
        message:
          occurrences.length === 1
            ? `This date is an Academy holiday (${first.holiday_name}, ${formatHolidayDate(first.date)}). Classes cannot be scheduled on it.`
            : `Every class in this series falls on an Academy holiday (from ${first.holiday_name}, ${formatHolidayDate(first.date)}). No classes were scheduled.`,
      });
    }

    await this.assertNoApprovedLeave(batch, tutorId, kept, dto.durationMin);
    await this.assertNoConflicts(tutorId, dto.batchId, kept, dto.durationMin);

    const parent = await this.repository.createSeries(
      kept.map((scheduledStartUtc) => ({
        batchId: dto.batchId,
        tutorId,
        scheduledStartUtc,
        timezone,
        durationMin: dto.durationMin,
        meetingUrl: dto.meetingUrl ?? null,
        recurrenceRule: dto.recurrenceRule ?? null,
        recurrenceParentId: null,
      })),
    );

    await this.notices.notifyCreated(parent, kept);
    return { ...parent, skipped_holiday_occurrences: skipped };
  }

  /**
   * Approved-leave guard for NEW classes. Runs only after the teaching
   * context has been resolved to an Academy batch (`batch.academy_id` is
   * the row's own value, never client-supplied): an Individual batch has
   * no academy and so no academy leave, and the lookup is keyed by
   * (this academy, this teacher), so another academy's leave or another
   * teacher's leave can never block anything here. Every occurrence of a
   * recurring series is checked — one colliding occurrence rejects the
   * whole series (same as a teacher time conflict), so a series can't
   * smuggle a class into leave. This is the only place class_sessions
   * are created from, so teacher, academy-admin and mobile callers are
   * all covered.
   */
  private async assertNoApprovedLeave(
    batch: { academy_id: string | null },
    tutorId: string,
    occurrences: Date[],
    durationMin: number,
  ): Promise<void> {
    if (batch.academy_id === null) return;
    const conflicts = await this.leaveCalendar.conflictsFor(
      batch.academy_id,
      tutorId,
      occurrences.map((start) => ({
        start,
        end: new Date(start.getTime() + durationMin * 60_000),
      })),
    );
    const at = conflicts.findIndex((c) => c !== null);
    if (at === -1) return;
    throw new ConflictException({
      code: ErrorCode.TEACHER_ON_APPROVED_LEAVE,
      message:
        occurrences.length === 1
          ? `This teacher is on approved leave during this time (${formatHolidayDate(holidayDateOf(occurrences[at]))}).`
          : `This teacher is on approved leave during one of these classes (${formatHolidayDate(holidayDateOf(occurrences[at]))}). No classes were scheduled.`,
    });
  }

  /** Checked before creating a session (or every occurrence of a
   *  recurring series) — a scheduled class must not overlap another
   *  scheduled class for the same tutor, nor another scheduled class for
   *  the same batch. Sequential per-occurrence checks (rather than one
   *  batched query) mirror the existing per-session loop
   *  TeacherLeaveService.applySubstitute already uses for the same kind
   *  of overlap check. */
  private async assertNoConflicts(
    tutorId: string,
    batchId: string,
    occurrences: Date[],
    durationMin: number,
  ): Promise<void> {
    for (const start of occurrences) {
      const end = new Date(start.getTime() + durationMin * 60_000);
      const [tutorConflict, batchConflict] = await Promise.all([
        this.repository.hasScheduledOverlapForTutor(tutorId, start, end),
        this.repository.hasScheduledOverlapForBatch(batchId, start, end),
      ]);
      if (tutorConflict) {
        throw new BadRequestException(
          `This teacher already has a class scheduled at ${start.toISOString()}`,
        );
      }
      if (batchConflict) {
        throw new BadRequestException(
          `This batch already has a class scheduled at ${start.toISOString()}`,
        );
      }
    }
  }

  async listForBatch(tutorId: string, batchId: string) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);
    return this.repository.listForBatch(batchId);
  }

  /** H6: each row says whether the caller is its teacher ('owner') or is
   *  covering it as the assigned substitute ('substitute') — the UI must
   *  not offer a substitute cancel/complete/reschedule/edit (the API
   *  rejects those with 403 anyway, see getOwnedSession), and must label
   *  the class "Covering for <original teacher>", not "Covered by <me>". */
  async listForTutorBetween(
    tutorId: string,
    ctx: TeachingContext,
    from: Date,
    to: Date,
  ) {
    const rows = await this.repository.listForTutorBetween(
      tutorId,
      academyIdOf(ctx),
      from,
      to,
    );
    return rows.map((row) => ({
      ...row,
      viewer_role:
        row.tutor_id === tutorId ? ('owner' as const) : ('substitute' as const),
    }));
  }

  async listForBatchInAcademy(academyId: string, batchId: string) {
    await this.batchesService.getAcademyBatch(academyId, batchId);
    return this.repository.listForBatch(batchId);
  }

  listForStudentBetween(studentId: string, from: Date, to: Date) {
    return this.repository.listForStudentBetween(studentId, from, to);
  }

  /** Parent's view of a consented child's schedule — same active-link
   *  gate ProgressService/AttendanceService use for their parent-facing
   *  routes. */
  async forParent(parentId: string, studentId: string, from: Date, to: Date) {
    const hasLink = await this.repository.hasActiveParentLink(
      parentId,
      studentId,
    );
    if (!hasLink) {
      throw new ForbiddenException('No active consented link to this student');
    }
    return this.repository.listForStudentBetweenWithTutor(studentId, from, to);
  }

  /** Loads a session without an ownership check — for students joining. */
  async findByIdOrThrow(sessionId: string) {
    const session = await this.repository.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async getOwnedSession(tutorId: string, sessionId: string) {
    const session = await this.repository.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (session.tutor_id !== tutorId)
      throw new ForbiddenException('Not your session');
    // Same context rules as the batch it belongs to (active membership for
    // an Academy class, and the request must be in that class's context).
    await this.batchesService.getOwnedBatch(tutorId, session.batch_id);
    return session;
  }

  /**
   * H6: view + attendance-marking access (never cancel/complete/
   * reschedule/edit — those stay on getOwnedSession, tutor_id only).
   * Accepts either the original teacher OR the session's assigned
   * substitute. The owner path reuses getOwnedBatch unchanged; the
   * substitute path can't (a substitute is never the batch's own
   * tutor_id, so getOwnedBatch would always reject it) and instead
   * applies the same context-match rule directly via
   * BatchesService.findByIdUnchecked. A caller who is neither is
   * rejected exactly like getOwnedSession — same "Not your session",
   * so a random teacher probing by session id learns nothing.
   */
  async getViewableSession(tutorId: string, sessionId: string) {
    const session = await this.repository.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    if (session.tutor_id === tutorId) {
      await this.batchesService.getOwnedBatch(tutorId, session.batch_id);
      return session;
    }

    if (session.substitute_tutor_id === tutorId) {
      const batch = await this.batchesService.findByIdUnchecked(
        session.batch_id,
      );
      const active = currentTeachingContext();
      if (active && academyIdOf(active) !== batch.academy_id) {
        throw new ForbiddenException({
          code: ErrorCode.TEACHING_CONTEXT_MISMATCH,
          message: batch.academy_id
            ? 'This is an Academy class. Switch to that academy profile to view it.'
            : 'This is an Individual class. Switch to your Individual profile to view it.',
        });
      }
      return session;
    }

    throw new ForbiddenException('Not your session');
  }

  /** Academy-side lookup: the session must belong to a batch this academy
   *  owns. An Individual class or another academy's is "not found". */
  async getAcademySession(academyId: string, sessionId: string) {
    const session = await this.repository.findByIdInAcademy(
      sessionId,
      academyId,
    );
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async cancel(tutorId: string, sessionId: string, wholeSeries: boolean) {
    const session = await this.getOwnedSession(tutorId, sessionId);
    return this.cancelSession(session, wholeSeries, 'teacher_manual');
  }

  /** The academy cancels a class it owns — works even if the teacher has
   *  since left (the academy keeps authority over its own classes). */
  async cancelForAcademy(
    academyId: string,
    sessionId: string,
    wholeSeries: boolean,
  ) {
    const session = await this.getAcademySession(academyId, sessionId);
    return this.cancelSession(
      session,
      wholeSeries,
      'academy_manual',
      academyId,
    );
  }

  /**
   * Session lifecycle guards (H2). Both cancel and complete follow the
   * same shape:
   *   1. reject outright if the session isn't currently 'scheduled' —
   *      distinguishing "already in the state you asked for" from "in the
   *      other terminal state" so the caller gets a precise error instead
   *      of a generic 409/500;
   *   2. enforce the time rule for that action (see assertCancellable/
   *      assertCompletable — scheduled_start_utc is set once at creation
   *      and never rescheduled, so it's safe to read from the row already
   *      loaded above rather than re-querying);
   *   3. apply the transition with a single atomic
   *      `UPDATE ... WHERE status = 'scheduled'` (SessionsRepository.
   *      cancelIfScheduled/completeIfScheduled). If a concurrent request
   *      won the race between step 1 and here, this affects zero rows —
   *      resolved the same way as step 1, against the now-current status.
   *
   * Side effects run only after the transition has committed: once
   * step 3 (and, for a series, its sibling update) succeeded, the
   * affected students/parents — and, when the ACADEMY cancelled, the
   * class's teacher — are told immediately (H4, see
   * SessionNotificationsService) — a rejected or raced cancel never
   * announces anything, and a repeated series cancel only announces the
   * classes it newly cancelled (none). Completion still has no side
   * effects.
   */
  private async cancelSession(
    session: SessionRow,
    wholeSeries: boolean,
    reason: 'teacher_manual' | 'academy_manual' | 'batch_archived',
    academyId?: string,
  ) {
    if (session.status !== 'scheduled') {
      return this.rejectTransition(session.status, 'cancelled');
    }
    this.assertCancellable(session);

    const cancelled = await this.repository.cancelIfScheduled(
      session.id,
      reason,
    );
    if (!cancelled) {
      return this.rejectTransition(
        await this.currentStatus(session.id),
        'cancelled',
      );
    }

    if (wholeSeries) {
      const parentId = session.recurrence_parent_id ?? session.id;
      // Only reaches still-scheduled siblings (see cancelSeries's doc
      // comment) — a completed occurrence in the series is left alone.
      const siblings = await this.repository.cancelSeries(parentId, reason);
      await this.notices.notifyCancelled(
        [session.id, ...siblings],
        reason,
        academyId,
      );
      return { cancelled: 'series' as const };
    }
    await this.notices.notifyCancelled([session.id], reason, academyId);
    return { cancelled: 'single' as const };
  }

  async complete(tutorId: string, sessionId: string) {
    const session = await this.getOwnedSession(tutorId, sessionId);
    if (session.status !== 'scheduled') {
      return this.rejectTransition(session.status, 'completed');
    }
    this.assertCompletable(session);

    const completed = await this.repository.completeIfScheduled(session.id);
    if (!completed) {
      return this.rejectTransition(
        await this.currentStatus(session.id),
        'completed',
      );
    }
    return completed;
  }

  /** H4 "edit": today, the only field this can change is meetingUrl —
   *  see UpdateSessionDto. Only allowed while still 'scheduled', same as
   *  cancel/complete/reschedule: a cancelled or completed class's
   *  details are frozen, not silently editable. */
  async updateMeetingUrl(
    tutorId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const session = await this.getOwnedSession(tutorId, sessionId);
    return this.applyMeetingUrlUpdate(session, dto);
  }

  async updateMeetingUrlForAcademy(
    academyId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const session = await this.getAcademySession(academyId, sessionId);
    return this.applyMeetingUrlUpdate(session, dto);
  }

  private async applyMeetingUrlUpdate(
    session: SessionRow,
    dto: UpdateSessionDto,
  ) {
    if (session.status !== 'scheduled') {
      throw new ConflictException({
        code:
          session.status === 'cancelled'
            ? ErrorCode.SESSION_ALREADY_CANCELLED
            : ErrorCode.SESSION_ALREADY_COMPLETED,
        message: `This class is ${session.status}; its details can no longer be edited.`,
      });
    }
    if (dto.meetingUrl === undefined) return session; // nothing to change
    return this.repository.updateMeetingUrl(session.id, dto.meetingUrl);
  }

  async reschedule(
    tutorId: string,
    sessionId: string,
    dto: RescheduleSessionDto,
  ) {
    const session = await this.getOwnedSession(tutorId, sessionId);
    return this.rescheduleSession(session, dto, { kind: 'teacher' });
  }

  /** getAcademySession only returns a session of a batch this academy
   *  owns, so the `academy` actor below is always the real owner — the
   *  teacher notice is then resolved from that persisted session. */
  async rescheduleForAcademy(
    academyId: string,
    sessionId: string,
    dto: RescheduleSessionDto,
  ) {
    const session = await this.getAcademySession(academyId, sessionId);
    return this.rescheduleSession(session, dto, { kind: 'academy', academyId });
  }

  /**
   * H4 reschedule — follows the same shape as H2's cancel/complete:
   *   1. reject outright if not currently 'scheduled';
   *   2. the same time rule as cancel (assertCancellable) — a class
   *      whose original time already passed is done rescheduling, same
   *      reasoning as why it can no longer be cancelled either;
   *   3. reject a new time that's also in the past, and a new time that
   *      conflicts with another scheduled class for this tutor or batch
   *      (excluding this session's own current slot);
   *   4. apply with the same atomic `UPDATE ... WHERE status =
   *      'scheduled'` pattern (rescheduleIfScheduled), additionally
   *      guarded on the time it read — a reschedule racing a concurrent
   *      cancel/complete/reschedule resolves to exactly one winner;
   *   5. only then tell the students/parents (H4) — and, when the ACADEMY
   *      moved it (`actor`), the class's teacher too. Asking for the time
   *      the class already has is a no-op: nothing changes, nothing is
   *      announced, so a double-submitted reschedule notifies once.
   */
  private async rescheduleSession(
    session: SessionRow,
    dto: RescheduleSessionDto,
    actor: RescheduleActor,
  ) {
    if (session.status !== 'scheduled') {
      return this.rejectRescheduleTransition(session.status);
    }
    this.assertCancellable(session);

    const timezone = dto.timezone ?? session.timezone;
    const [newStart] = expandRecurrence(dto.newStartLocal, timezone, null);
    const durationMin = dto.durationMin ?? session.duration_min;

    if (newStart.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ErrorCode.SESSION_RESCHEDULE_IN_PAST,
        message: 'The new class time must be in the future.',
      });
    }

    if (
      newStart.getTime() === session.scheduled_start_utc.getTime() &&
      durationMin === session.duration_min
    ) {
      return session;
    }

    const newEnd = new Date(newStart.getTime() + durationMin * 60_000);
    const [tutorConflict, batchConflict] = await Promise.all([
      this.repository.hasScheduledOverlapForTutor(
        session.tutor_id,
        newStart,
        newEnd,
        session.id,
      ),
      this.repository.hasScheduledOverlapForBatch(
        session.batch_id,
        newStart,
        newEnd,
        session.id,
      ),
    ]);
    if (tutorConflict || batchConflict) {
      throw new ConflictException({
        code: ErrorCode.SESSION_RESCHEDULE_CONFLICT,
        message: tutorConflict
          ? 'This teacher already has a class scheduled at that time.'
          : 'This batch already has a class scheduled at that time.',
      });
    }

    const rescheduled = await this.repository.rescheduleIfScheduled(
      session.id,
      newStart,
      durationMin,
      {
        scheduledStartUtc: session.scheduled_start_utc,
        durationMin: session.duration_min,
      },
    );
    if (!rescheduled) {
      const fresh = await this.repository.findById(session.id);
      if (!fresh) throw new NotFoundException('Session not found');
      if (fresh.status !== 'scheduled') {
        return this.rejectRescheduleTransition(fresh.status);
      }
      // A concurrent request already moved it — to exactly this time (a
      // duplicate submit: same outcome, already announced by the winner)
      // or somewhere else (a genuine conflict the caller must see).
      if (
        fresh.scheduled_start_utc.getTime() === newStart.getTime() &&
        fresh.duration_min === durationMin
      ) {
        return fresh;
      }
      throw new ConflictException({
        code: ErrorCode.SESSION_RESCHEDULE_CONFLICT,
        message:
          'This class was just changed by someone else. Refresh and try again.',
      });
    }
    await this.notices.notifyRescheduled(session, rescheduled, actor);
    return rescheduled;
  }

  /** Reschedule's own version of rejectTransition — same error codes
   *  (a caller branches on `code`, not message text), reschedule-
   *  specific wording. */
  private rejectRescheduleTransition(
    currentStatus: SessionRow['status'],
  ): never {
    throw new ConflictException({
      code:
        currentStatus === 'cancelled'
          ? ErrorCode.SESSION_ALREADY_CANCELLED
          : ErrorCode.SESSION_ALREADY_COMPLETED,
      message: `This class is ${currentStatus} and can no longer be rescheduled.`,
    });
  }

  /** A class can only be cancelled before it was due to start — once its
   *  scheduled time has passed, the class either ran (mark it complete)
   *  or didn't (that's a no-show, not a cancellation to record after the
   *  fact). Mirrors the dashboard's own "overdue → mark attendance"
   *  prompt, which already assumes a past `scheduled` session is headed
   *  for completion, not cancellation. */
  private assertCancellable(session: Pick<SessionRow, 'scheduled_start_utc'>) {
    if (session.scheduled_start_utc.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ErrorCode.SESSION_ALREADY_STARTED,
        message:
          'This class has already started and can no longer be cancelled. Mark it complete instead.',
      });
    }
  }

  /** The mirror image: a class can only be completed at or after its
   *  scheduled start — completing a class that hasn't happened yet would
   *  corrupt attendance/hour tallies that assume `completed` means "this
   *  class ran". No upper bound: a teacher may complete an overdue class
   *  any time after it started. */
  private assertCompletable(session: Pick<SessionRow, 'scheduled_start_utc'>) {
    if (session.scheduled_start_utc.getTime() > Date.now()) {
      throw new BadRequestException({
        code: ErrorCode.SESSION_NOT_STARTED,
        message:
          'This class cannot be marked complete before its scheduled start time.',
      });
    }
  }

  private async currentStatus(
    sessionId: string,
  ): Promise<SessionRow['status']> {
    const fresh = await this.repository.findById(sessionId);
    // The row can't vanish (sessions are never deleted) — this only runs
    // right after an UPDATE targeting this same id found it, or after the
    // caller's own load found it moments earlier.
    if (!fresh) throw new NotFoundException('Session not found');
    return fresh.status;
  }

  private rejectTransition(
    currentStatus: SessionRow['status'],
    attempted: 'cancelled' | 'completed',
  ): never {
    if (currentStatus === attempted) {
      throw new ConflictException({
        code:
          attempted === 'cancelled'
            ? ErrorCode.SESSION_ALREADY_CANCELLED
            : ErrorCode.SESSION_ALREADY_COMPLETED,
        message: `This class is already ${attempted}.`,
      });
    }
    throw new ConflictException({
      code: ErrorCode.INVALID_SESSION_TRANSITION,
      message:
        attempted === 'cancelled'
          ? `This class is ${currentStatus} and can no longer be cancelled.`
          : `This class is ${currentStatus} and can no longer be marked complete.`,
    });
  }
}
