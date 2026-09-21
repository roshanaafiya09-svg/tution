import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionsRepository } from './sessions.repository';
import { BatchesService } from '../batches/batches.service';
import { TeachingContextService } from '../../teaching-context/teaching-context.service';
import {
  academyIdOf,
  type TeachingContext,
} from '../../teaching-context/teaching-context';
import { expandRecurrence } from './recurrence';
import type { CreateSessionDto } from './dto/create-session.dto';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

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

  private async cancelSession(
    session: { id: string; recurrence_parent_id: string | null },
    wholeSeries: boolean,
  ) {
    const sessionId = session.id;

    if (wholeSeries) {
      const parentId = session.recurrence_parent_id ?? session.id;
      await this.repository.cancelSeries(parentId);
      return { cancelled: 'series' as const };
    }

    await this.repository.setHolidayOrLeaveCancellation(sessionId, 'manual');
    return { cancelled: 'single' as const };
  }

  async complete(tutorId: string, sessionId: string) {
    await this.getOwnedSession(tutorId, sessionId);
    return this.repository.updateStatus(sessionId, 'completed');
  }
}
