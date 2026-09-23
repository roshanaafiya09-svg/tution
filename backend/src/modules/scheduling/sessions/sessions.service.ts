import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Selectable } from 'kysely';
import { SessionsRepository } from './sessions.repository';
import { BatchesService } from '../batches/batches.service';
import { TeachingContextService } from '../../teaching-context/teaching-context.service';
import {
  academyIdOf,
  type TeachingContext,
} from '../../teaching-context/teaching-context';
import { expandRecurrence } from './recurrence';
import type { CreateSessionDto } from './dto/create-session.dto';
import { ErrorCode } from '../../../common/http/error-codes';
import type { ClassSessionsTable } from '../../../database/types';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

type SessionRow = Selectable<ClassSessionsTable>;

@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly batchesService: BatchesService,
    private readonly teachingContext: TeachingContextService,
  ) {}

  /** Teacher path: the tutor must own the batch AND (via the request's
   *  verified teaching context) be operating in the batch's own context —
   *  an Academy profile cannot schedule a class on a private Individual
   *  batch. */
  async create(tutorId: string, dto: CreateSessionDto) {
    await this.batchesService.getOwnedBatch(tutorId, dto.batchId);
    return this.createSeries(tutorId, dto);
  }

  /** Academy path: the batch must be owned by THIS academy (not merely
   *  taught by one of its members) and its teacher must still be an
   *  active member. */
  async createForAcademy(academyId: string, dto: CreateSessionDto) {
    const batch = await this.batchesService.getAcademyBatch(
      academyId,
      dto.batchId,
    );
    await this.teachingContext.assertActiveMember(academyId, batch.tutor_id);
    return this.createSeries(batch.tutor_id, dto);
  }

  private async createSeries(tutorId: string, dto: CreateSessionDto) {
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    const occurrences = expandRecurrence(
      dto.startLocal,
      timezone,
      dto.recurrenceRule ?? null,
    );

    await this.assertNoConflicts(
      tutorId,
      dto.batchId,
      occurrences,
      dto.durationMin,
    );

    return this.repository.createSeries(
      occurrences.map((scheduledStartUtc) => ({
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

  listForTutorBetween(
    tutorId: string,
    ctx: TeachingContext,
    from: Date,
    to: Date,
  ) {
    return this.repository.listForTutorBetween(
      tutorId,
      academyIdOf(ctx),
      from,
      to,
    );
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
    return this.cancelSession(session, wholeSeries);
  }

  /** The academy cancels a class it owns — works even if the teacher has
   *  since left (the academy keeps authority over its own classes). */
  async cancelForAcademy(
    academyId: string,
    sessionId: string,
    wholeSeries: boolean,
  ) {
    const session = await this.getAcademySession(academyId, sessionId);
    return this.cancelSession(session, wholeSeries);
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
   * There are no notifications or other side effects on the manual
   * cancel/complete path today (see SCHOLAR_SYSTEM_BULLETIN.md's Flow G —
   * a manual single-class cancellation has no immediate notification, and
   * nothing observes a manual completion synchronously), so "only run
   * side effects after the transition commits" reduces to this atomic
   * update being the whole operation.
   */
  private async cancelSession(session: SessionRow, wholeSeries: boolean) {
    if (session.status !== 'scheduled') {
      return this.rejectTransition(session.status, 'cancelled');
    }
    this.assertCancellable(session);

    const cancelled = await this.repository.cancelIfScheduled(
      session.id,
      'manual',
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
      await this.repository.cancelSeries(parentId);
      return { cancelled: 'series' as const };
    }
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
