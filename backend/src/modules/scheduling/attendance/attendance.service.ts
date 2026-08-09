import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import type { AttendanceStatus } from './attendance.repository';
import { SessionsService } from '../sessions/sessions.service';
import { BatchesService } from '../batches/batches.service';
import { BatchesRepository } from '../batches/batches.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Repeated-absence alert rule: once a student crosses this many absences
 * in one batch within the trailing window, their active parent(s) get an
 * in-app notification. Tune both constants together — the window is what
 * "recent" means for the count. Documented here rather than left as bare
 * numbers in the code below.
 */
const ABSENCE_ALERT_THRESHOLD = 3;
const ABSENCE_ALERT_WINDOW_DAYS = 30;
const ABSENCE_ALERT_TYPE = 'attendance_absence_alert';

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
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
    private readonly analytics: AnalyticsService,
    private readonly notificationsService: NotificationsService,
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
    const session = await this.sessionsService.getOwnedSession(
      tutorId,
      sessionId,
    );

    // A tutor can only mark students actually enrolled in this session's
    // batch — mirrors the same check joinSession() already enforces on
    // the student's own self-check-in path below.
    const enrollment = await this.batchesRepository.findEnrollment(
      session.batch_id,
      studentId,
    );
    if (!enrollment || enrollment.status !== 'active') {
      throw new BadRequestException(
        'This student is not enrolled in this batch',
      );
    }

    const result = await this.repository.upsert(
      sessionId,
      studentId,
      status,
      'manual',
      tutorId,
      status === 'absent' ? null : new Date(),
    );

    this.analytics.capture(tutorId, 'attendance_marked_manually', {
      sessionId,
      studentId,
      status,
    });

    if (status === 'absent') {
      await this.maybeAlertOnRepeatedAbsence(
        studentId,
        session.batch_id,
        session.scheduled_start_utc,
      );
    }

    return result;
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

    this.analytics.capture(studentId, 'class_joined', {
      sessionId,
      batchId: session.batch_id,
    });

    return {
      meetingUrl: session.meeting_url,
      scheduledStartUtc: session.scheduled_start_utc,
      durationMin: session.duration_min,
    };
  }

  summaryForStudent(studentId: string, batchId: string) {
    return this.repository.summaryForStudent(studentId, batchId);
  }

  /** Tutor's attendance history across every session in a batch they own. */
  async historyForBatch(tutorId: string, batchId: string) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);
    return this.repository.listForBatch(batchId);
  }

  /** Student's own attendance, across every batch they've ever been in. */
  myHistory(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  /** Student's own all-time attendance summary, across every batch. */
  mySummary(studentId: string) {
    return this.repository.summaryForStudentBetween(
      studentId,
      new Date(0),
      new Date(),
    );
  }

  /** Same active-consent-link gate ProgressService uses for the parent-
   *  facing progress route (there via ParentLinksRepository) — checked
   *  here via AttendanceRepository.hasActiveParentLink instead, see that
   *  method's doc comment for why. */
  private async assertActiveParentLink(
    parentId: string,
    studentId: string,
  ): Promise<void> {
    const hasLink = await this.repository.hasActiveParentLink(
      parentId,
      studentId,
    );
    if (!hasLink) {
      throw new ForbiddenException('No active consented link to this student');
    }
  }

  async historyForParent(parentId: string, studentId: string) {
    await this.assertActiveParentLink(parentId, studentId);
    return this.repository.listForStudent(studentId);
  }

  async summaryForParent(parentId: string, studentId: string) {
    await this.assertActiveParentLink(parentId, studentId);
    return this.repository.summaryForStudentBetween(
      studentId,
      new Date(0),
      new Date(),
    );
  }

  /**
   * Notifies a student's actively-linked parent(s) once they cross
   * ABSENCE_ALERT_THRESHOLD absences in this batch within the trailing
   * ABSENCE_ALERT_WINDOW_DAYS — but never more than once per pattern: if
   * an alert for this exact student+batch was already sent within the
   * window, a later absence in the same window doesn't re-notify. A
   * fresh alert becomes possible again only once that window passes.
   */
  private async maybeAlertOnRepeatedAbsence(
    studentId: string,
    batchId: string,
    asOf: Date,
  ): Promise<void> {
    const windowStart = new Date(
      asOf.getTime() - ABSENCE_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const absenceCount = await this.repository.countAbsencesForStudentInBatch(
      studentId,
      batchId,
      windowStart,
    );
    if (absenceCount < ABSENCE_ALERT_THRESHOLD) return;

    const parentIds =
      await this.repository.listActiveParentIdsForStudent(studentId);
    if (parentIds.length === 0) return;

    const recipientIds: string[] = [];
    for (const parentId of parentIds) {
      const recent = await this.notificationsService.listRecentForUserByType(
        parentId,
        ABSENCE_ALERT_TYPE,
        windowStart,
      );
      const alreadyAlerted = recent.some((n) => {
        const payload = n.payload as { studentId?: string; batchId?: string };
        return payload.studentId === studentId && payload.batchId === batchId;
      });
      if (!alreadyAlerted) recipientIds.push(parentId);
    }
    if (recipientIds.length === 0) return;

    await this.notificationsService.notify({
      userIds: recipientIds,
      type: ABSENCE_ALERT_TYPE,
      title: 'Repeated absences',
      body: `Your child has been marked absent ${absenceCount} times in the last ${ABSENCE_ALERT_WINDOW_DAYS} days.`,
      payload: {
        studentId,
        batchId,
        absenceCount,
        windowDays: ABSENCE_ALERT_WINDOW_DAYS,
      },
    });
  }
}
