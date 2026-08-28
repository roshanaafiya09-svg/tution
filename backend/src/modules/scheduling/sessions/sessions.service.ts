import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionsRepository } from './sessions.repository';
import { BatchesService } from '../batches/batches.service';
import { expandRecurrence } from './recurrence';
import type { CreateSessionDto } from './dto/create-session.dto';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly batchesService: BatchesService,
  ) {}

  async create(tutorId: string, dto: CreateSessionDto) {
    await this.batchesService.getOwnedBatch(tutorId, dto.batchId);

    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    const occurrences = expandRecurrence(
      dto.startLocal,
      timezone,
      dto.recurrenceRule ?? null,
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

  async listForBatch(tutorId: string, batchId: string) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);
    return this.repository.listForBatch(batchId);
  }

  listForTutorBetween(tutorId: string, from: Date, to: Date) {
    return this.repository.listForTutorBetween(tutorId, from, to);
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
    return session;
  }

  async cancel(tutorId: string, sessionId: string, wholeSeries: boolean) {
    const session = await this.getOwnedSession(tutorId, sessionId);

    if (wholeSeries) {
      const parentId = session.recurrence_parent_id ?? session.id;
      await this.repository.cancelSeries(parentId);
      return { cancelled: 'series' as const };
    }

    await this.repository.updateStatus(sessionId, 'cancelled');
    return { cancelled: 'single' as const };
  }

  async complete(tutorId: string, sessionId: string) {
    await this.getOwnedSession(tutorId, sessionId);
    return this.repository.updateStatus(sessionId, 'completed');
  }
}
