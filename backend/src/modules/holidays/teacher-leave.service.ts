import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { TeacherLeaveRepository } from './teacher-leave.repository';
import { AcademyMembershipsRepository } from '../marketplace/academy-memberships/academy-memberships.repository';
import { AcademiesRepository } from '../marketplace/academies/academies.repository';
import { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

const DEFAULT_TIMEZONE = 'Asia/Kolkata'; // see holiday.service.ts's identical constant

function dayRangeUtc(startDate: string, endDate: string) {
  const from = DateTime.fromISO(startDate, { zone: DEFAULT_TIMEZONE })
    .startOf('day')
    .toUTC()
    .toJSDate();
  const to = DateTime.fromISO(endDate, { zone: DEFAULT_TIMEZONE })
    .endOf('day')
    .toUTC()
    .toJSDate();
  return { from, to };
}

/**
 * Teacher Leave workflow (spec §2–5). Deliberately never notifies
 * "the whole academy" — only the academy owner (on submission, so the
 * Academy Dashboard Notifications page has a real destination — see
 * create()) and the tutor themself, and (once approved) exactly the
 * students/parents of the classes actually affected, per the spec's
 * recipient rules. Mirrors AcademyMembershipRequests' pending/accepted/
 * rejected shape and AcademyOwnerBatchesService's "services take
 * resolved ids as plain parameters, never assume the caller" convention
 * — academyId here is already resolved by the caller
 * (AcademyOwnerLeaveService), same as tutorId always is.
 */
@Injectable()
export class TeacherLeaveService {
  private readonly logger = new Logger(TeacherLeaveService.name);

  constructor(
    private readonly repository: TeacherLeaveRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academiesRepository: AcademiesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Academies a teacher can file a leave request against — only their
   *  active memberships, so the create form never offers an academy
   *  they've since left. */
  listAcademiesForTutor(tutorId: string) {
    return this.academyMembershipsRepository.listActiveForTutor(tutorId);
  }

  async create(tutorId: string, dto: CreateLeaveRequestDto) {
    const membership =
      await this.academyMembershipsRepository.findActiveMembership(
        dto.academyId,
        tutorId,
      );
    if (!membership) {
      throw new ForbiddenException(
        "You aren't an active member of that academy",
      );
    }

    const endDate = dto.endDate ?? dto.startDate;
    if (endDate < dto.startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const { from, to } = dayRangeUtc(dto.startDate, endDate);
    const candidateSessions =
      await this.sessionsRepository.listScheduledForTutorsBetween(
        [tutorId],
        from,
        to,
      );

    let sessionIds: string[];
    if (dto.leaveType === 'full_day') {
      sessionIds = candidateSessions.map((s) => s.id);
    } else {
      if (!dto.sessionIds || dto.sessionIds.length === 0) {
        throw new BadRequestException(
          'Select at least one class for a specific-classes leave request',
        );
      }
      const candidateIds = new Set(candidateSessions.map((s) => s.id));
      sessionIds = dto.sessionIds.filter((id) => candidateIds.has(id));
      if (sessionIds.length === 0) {
        throw new BadRequestException(
          'None of the selected classes are scheduled in that date range',
        );
      }
    }

    const request = await this.repository.create({
      tutorId,
      academyId: dto.academyId,
      startDate: dto.startDate,
      endDate,
      leaveType: dto.leaveType,
      reason: dto.reason ?? null,
    });
    await this.repository.snapshotSessions(request.id, sessionIds);

    // Best-effort — a notification-delivery failure must never fail a
    // leave request that's already been created (see contactAcademy's
    // identical guard in academies.service.ts).
    try {
      const academy = await this.academiesRepository.findById(dto.academyId);
      if (academy?.owner_user_id) {
        await this.notificationsService.notify({
          userIds: [academy.owner_user_id],
          type: 'teacher_leave_requested',
          title: 'New leave request',
          body: 'A teacher has requested leave at your academy.',
          payload: { leaveRequestId: request.id, tutorId },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to notify academy owner of leave request ${request.id}: ${err}`,
      );
    }

    return request;
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  async getOwnedForTutor(tutorId: string, id: string) {
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.tutor_id !== tutorId)
      throw new ForbiddenException('Not your leave request');
    return request;
  }

  async listSessionsForRequest(requestId: string) {
    return this.repository.listSessionsWithBatchForRequest(requestId);
  }

  async withdraw(tutorId: string, id: string) {
    const request = await this.getOwnedForTutor(tutorId, id);
    if (request.status !== 'pending') {
      throw new BadRequestException('Only a pending request can be withdrawn');
    }
    return this.repository.setStatus(id, 'cancelled', null);
  }

  // --- Academy admin side (academyId already resolved by the caller) ---

  listPendingForAcademy(academyId: string) {
    return this.repository
      .listForAcademyWithTutor(academyId)
      .then((rows) => rows.filter((r) => r.status === 'pending'));
  }

  listAllForAcademy(academyId: string) {
    return this.repository.listForAcademyWithTutor(academyId);
  }

  private async getPendingForAcademy(academyId: string, id: string) {
    const request = await this.repository.findForAcademy(id, academyId);
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been decided');
    }
    return request;
  }

  async reject(academyId: string, id: string, decidedBy: string) {
    const request = await this.getPendingForAcademy(academyId, id);
    await this.repository.setStatus(id, 'rejected', decidedBy);

    const dateLabel = this.formatDateLabel(
      request.start_date,
      request.end_date,
    );
    await this.notificationsService.notify({
      userIds: [request.tutor_id],
      type: 'teacher_leave_rejected',
      title: 'Leave request rejected',
      body: `Your leave request for ${dateLabel} has been rejected by the academy.`,
      payload: { leaveRequestId: id },
    });
    return { ...request, status: 'rejected' as const };
  }

  async approve(
    academyId: string,
    id: string,
    decidedBy: string,
    substituteTutorId?: string,
  ) {
    const request = await this.getPendingForAcademy(academyId, id);
    const sessionIds = await this.repository.listSessionIdsForRequest(id);
    const sessions = await this.sessionsRepository.findByIds(sessionIds);

    if (substituteTutorId) {
      await this.applySubstitute(
        academyId,
        id,
        request.tutor_id,
        sessions,
        substituteTutorId,
      );
    } else {
      for (const session of sessions) {
        await this.sessionsRepository.setHolidayOrLeaveCancellation(
          session.id,
          'teacher_leave',
          {
            teacherLeaveRequestId: id,
          },
        );
      }
    }

    await this.repository.setStatus(id, 'approved', decidedBy);

    const dateLabel = this.formatDateLabel(
      request.start_date,
      request.end_date,
    );
    await this.notificationsService.notify({
      userIds: [request.tutor_id],
      type: 'teacher_leave_approved',
      title: 'Leave approved',
      body: `Your leave request for ${dateLabel} has been approved.`,
      payload: { leaveRequestId: id },
    });

    await this.notifyAffectedClasses(
      academyId,
      sessions,
      substituteTutorId ?? null,
      id,
    );
    return { ...request, status: 'approved' as const };
  }

  /** Assigns (or changes) a substitute for an already-approved leave
   *  request — covers the spec's "if no substitute assigned [yet],
   *  later assigning one" case, un-cancelling the affected sessions. */
  async assignSubstitute(
    academyId: string,
    id: string,
    substituteTutorId: string,
  ) {
    const request = await this.repository.findForAcademy(id, academyId);
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'approved') {
      throw new BadRequestException(
        'Only an approved leave request can get a substitute',
      );
    }
    const sessionIds = await this.repository.listSessionIdsForRequest(id);
    const sessions = await this.sessionsRepository.findByIds(sessionIds);
    await this.applySubstitute(
      academyId,
      id,
      request.tutor_id,
      sessions,
      substituteTutorId,
    );
    await this.notifyAffectedClasses(
      academyId,
      sessions,
      substituteTutorId,
      id,
    );
    return { ok: true };
  }

  private async applySubstitute(
    academyId: string,
    leaveRequestId: string,
    originalTutorId: string,
    sessions: Array<{
      id: string;
      scheduled_start_utc: Date;
      duration_min: number;
    }>,
    substituteTutorId: string,
  ) {
    const membership =
      await this.academyMembershipsRepository.findActiveMembership(
        academyId,
        substituteTutorId,
      );
    if (!membership) {
      throw new BadRequestException(
        "The substitute isn't an active teacher at this academy",
      );
    }
    if (substituteTutorId === originalTutorId) {
      throw new BadRequestException(
        "The substitute can't be the teacher who's on leave",
      );
    }

    for (const session of sessions) {
      const end = new Date(
        session.scheduled_start_utc.getTime() + session.duration_min * 60_000,
      );
      const overlap = await this.sessionsRepository.hasScheduledOverlapForTutor(
        substituteTutorId,
        session.scheduled_start_utc,
        end,
      );
      if (overlap) {
        throw new BadRequestException(
          'The chosen substitute already has a class at one of the affected times',
        );
      }
    }

    for (const session of sessions) {
      await this.sessionsRepository.assignSubstitute(
        session.id,
        substituteTutorId,
        leaveRequestId,
      );
    }
  }

  private async notifyAffectedClasses(
    academyId: string,
    sessions: Array<{
      id: string;
      batch_id: string;
      scheduled_start_utc: Date;
      timezone: string;
    }>,
    substituteTutorId: string | null,
    leaveRequestId: string,
  ) {
    if (sessions.length === 0) return;

    const batches = await Promise.all(
      [...new Set(sessions.map((s) => s.batch_id))].map((batchId) =>
        this.batchesRepository.findById(batchId),
      ),
    );
    const batchTitleById = new Map(batches.map((b) => [b!.id, b!.title]));

    let substituteName: string | null = null;
    if (substituteTutorId) {
      // Best-effort display name — fine if it stays null (the copy still
      // reads correctly without a name, just less personal).
      const members =
        await this.academyMembershipsRepository.listActiveForAcademy(academyId);
      substituteName =
        members.find((m) => m.tutor_id === substituteTutorId)?.display_name ??
        null;
    }

    for (const session of sessions) {
      const time = DateTime.fromJSDate(session.scheduled_start_utc, {
        zone: 'utc',
      })
        .setZone(session.timezone)
        .toFormat('h:mm a');
      const batchTitle = batchTitleById.get(session.batch_id) ?? 'class';

      const studentIds =
        await this.batchesRepository.listDistinctStudentIdsForBatches([
          session.batch_id,
        ]);
      const parentIds =
        await this.attendanceRepository.listActiveParentIdsForStudents(
          studentIds,
        );
      const recipientIds = [...new Set([...studentIds, ...parentIds])];
      if (recipientIds.length === 0) continue;

      const body = substituteTutorId
        ? `Today's ${batchTitle} class at ${time} will be conducted by ${substituteName ?? 'a substitute teacher'} instead of the usual teacher.`
        : `Today's ${batchTitle} class at ${time} has been cancelled because your teacher is on approved leave.`;

      await this.notificationsService.notify({
        userIds: recipientIds,
        type: substituteTutorId ? 'class_substitute' : 'class_cancelled_leave',
        title: '🔔 Class Update',
        body,
        payload: {
          leaveRequestId,
          sessionId: session.id,
          substituteTutorId,
        },
      });
    }
  }

  private formatDateLabel(startDate: string, endDate: string): string {
    return startDate === endDate
      ? DateTime.fromISO(startDate).toFormat('d LLL yyyy')
      : `${DateTime.fromISO(startDate).toFormat('d LLL')} – ${DateTime.fromISO(endDate).toFormat('d LLL yyyy')}`;
  }
}
