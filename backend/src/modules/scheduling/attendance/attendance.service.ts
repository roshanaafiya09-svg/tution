import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import type { AttendanceStatus } from './attendance.repository';
import { SessionsService } from '../sessions/sessions.service';
import { BatchesRepository } from '../batches/batches.repository';

/**
 * A student tapping "Join" is what makes attendance real without the
 * tutor doing clerical work (blueprint §4), and it's the source of the
 * pilot's verdict metric — "% of scheduled classes actually run in the
 * app". Tutors can always override manually.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly repository: AttendanceRepository,
    private readonly sessionsService: SessionsService,
    private readonly batchesRepository: BatchesRepository,
  ) {}

  async listForSession(tutorId: string, sessionId: string) {
    await this.sessionsService.getOwnedSession(tutorId, sessionId);
    return this.repository.listForSession(sessionId);
  }

  async markManually(
    tutorId: string,
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
  ) {
    await this.sessionsService.getOwnedSession(tutorId, sessionId);
    return this.repository.upsert(
      sessionId,
      studentId,
      status,
      'manual',
      tutorId,
      status === 'absent' ? null : new Date(),
    );
  }

  /** Student-initiated: records attendance and hands back the meeting link. */
  async joinSession(studentId: string, sessionId: string) {
    const session = await this.sessionsService.findByIdOrThrow(sessionId);

    const enrollment = await this.batchesRepository.findEnrollment(
      session.batch_id,
      studentId,
    );
    if (!enrollment || enrollment.status !== 'active') {
      throw new BadRequestException('You are not enrolled in this batch');
    }
    if (session.status === 'cancelled') {
      throw new BadRequestException('This class has been cancelled');
    }

    await this.repository.upsert(
      sessionId,
      studentId,
      'present',
      'join_tap',
      null,
      new Date(),
    );

    return {
      meetingUrl: session.meeting_url,
      scheduledStartUtc: session.scheduled_start_utc,
      durationMin: session.duration_min,
    };
  }

  summaryForStudent(studentId: string, batchId: string) {
    return this.repository.summaryForStudent(studentId, batchId);
  }
}
