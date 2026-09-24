import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { BatchesService } from '../../scheduling/batches/batches.service';
import { SessionsService } from '../../scheduling/sessions/sessions.service';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { InvitesService } from '../../scheduling/invites/invites.service';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { AcademySubscriptionsService } from '../../billing/subscriptions/academy-subscriptions.service';
import { AcademyOwnerParentsRepository } from './academy-owner-parents.repository';
import type { CreateBatchDto } from '../../scheduling/batches/dto/create-batch.dto';
import type { UpdateBatchDto } from '../../scheduling/batches/dto/update-batch.dto';
import type { CreateSessionDto } from '../../scheduling/sessions/dto/create-session.dto';
import type { UpdateSessionDto } from '../../scheduling/sessions/dto/update-session.dto';
import type { RescheduleSessionDto } from '../../scheduling/sessions/dto/reschedule-session.dto';
import type { CreateInviteDto } from '../../scheduling/invites/dto/create-invite.dto';

/**
 * The Academy's own batches/sessions/invites/students. A batch created here
 * (or by a member teacher while working in that academy's profile) is owned
 * by the academy: `batches.academy_id = <this academy>`, with `tutor_id` the
 * teacher who runs it. Every read and write below is keyed by that
 * academy_id — never by "batches of my active teachers" — so a member
 * teacher's private Individual batches are unreachable here, even by
 * direct id (a foreign or Individual batch id is simply "not found"). The
 * academy keeps authority over its own batches after a teacher leaves.
 */
@Injectable()
export class AcademyOwnerBatchesService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly batchesService: BatchesService,
    private readonly sessionsService: SessionsService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly invitesService: InvitesService,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly academyOwnerParentsRepository: AcademyOwnerParentsRepository,
    private readonly academySubscriptions: AcademySubscriptionsService,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  private async assertActiveMember(
    academyId: string,
    tutorId: string,
  ): Promise<void> {
    const membership =
      await this.academyMembershipsRepository.findActiveMembership(
        academyId,
        tutorId,
      );
    if (!membership) {
      throw new ForbiddenException(
        "That teacher isn't a member of your academy",
      );
    }
  }

  /** Loads a batch that THIS academy owns (batches.academy_id) — the
   *  shared guard every batchId-based endpoint below starts with. An
   *  Individual batch or another academy's batch is "not found". */
  private resolveAcademyBatch(academyId: string, batchId: string) {
    return this.batchesService.getAcademyBatch(academyId, batchId);
  }

  async listBatches(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );
    const batches = await this.batchesRepository.listForAcademy(academy.id);
    return batches.map((b) => ({
      id: b.id,
      tutorId: b.tutor_id,
      tutorDisplayName: teacherNames.get(b.tutor_id) ?? null,
      title: b.title,
      subjectId: b.subject_id,
      gradeLevelId: b.grade_level_id,
      capacity: b.capacity,
      feeMinor: b.fee_minor,
      currency: b.currency,
      feePeriod: b.fee_period,
      status: b.status,
      enrolledCount: Number(b.enrolled_count),
      createdAt: b.created_at,
    }));
  }

  async getBatch(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveAcademyBatch(academy.id, batchId);
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );
    return {
      id: batch.id,
      tutorId: batch.tutor_id,
      tutorDisplayName: teacherNames.get(batch.tutor_id) ?? null,
      title: batch.title,
      subjectId: batch.subject_id,
      gradeLevelId: batch.grade_level_id,
      capacity: batch.capacity,
      feeMinor: batch.fee_minor,
      currency: batch.currency,
      feePeriod: batch.fee_period,
      status: batch.status,
      createdAt: batch.created_at,
    };
  }

  async createBatch(ownerUserId: string, tutorId: string, dto: CreateBatchDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    await this.assertActiveMember(academy.id, tutorId);
    // Academy activity is paid for by the ACADEMY's plan.
    await this.academySubscriptions.assertActive(academy.id);
    // Created IN this academy's context: the batch belongs to the academy.
    return this.batchesService.create(tutorId, dto, {
      kind: 'academy',
      academyId: academy.id,
    });
  }

  async updateBatch(ownerUserId: string, batchId: string, dto: UpdateBatchDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.batchesService.updateForAcademy(academy.id, batchId, dto);
  }

  async archiveBatch(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.batchesService.archiveForAcademy(academy.id, batchId);
  }

  async listStudents(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.batchesService.listEnrollmentsForAcademy(academy.id, batchId);
  }

  async removeStudent(ownerUserId: string, batchId: string, studentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.batchesService.removeStudentForAcademy(
      academy.id,
      batchId,
      studentId,
    );
  }

  async listSessions(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.sessionsService.listForBatchInAcademy(academy.id, batchId);
  }

  async createSession(ownerUserId: string, dto: CreateSessionDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.sessionsService.createForAcademy(academy.id, dto);
  }

  async cancelSession(
    ownerUserId: string,
    batchId: string,
    sessionId: string,
    wholeSeries: boolean,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    await this.resolveAcademyBatch(academy.id, batchId);
    return this.sessionsService.cancelForAcademy(
      academy.id,
      sessionId,
      wholeSeries,
    );
  }

  async updateSession(
    ownerUserId: string,
    batchId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    await this.resolveAcademyBatch(academy.id, batchId);
    return this.sessionsService.updateMeetingUrlForAcademy(
      academy.id,
      sessionId,
      dto,
    );
  }

  async rescheduleSession(
    ownerUserId: string,
    batchId: string,
    sessionId: string,
    dto: RescheduleSessionDto,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    await this.resolveAcademyBatch(academy.id, batchId);
    return this.sessionsService.rescheduleForAcademy(
      academy.id,
      sessionId,
      dto,
    );
  }

  async listInvites(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.invitesService.listForBatchInAcademy(academy.id, batchId);
  }

  async createInvite(
    ownerUserId: string,
    batchId: string,
    dto: CreateInviteDto,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.invitesService.createForAcademy(academy.id, batchId, dto);
  }

  /** Every class the academy owns in a window — backs Today's "Classes
   *  happening today"/"Upcoming Classes". */
  async listSessionsAcrossAcademy(ownerUserId: string, from: Date, to: Date) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );
    const rows = await this.sessionsRepository.listForAcademyBetween(
      academy.id,
      from,
      to,
    );
    return rows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      batchTitle: r.batch_title,
      subjectId: r.subject_id,
      tutorId: r.tutor_id,
      tutorDisplayName: teacherNames.get(r.tutor_id) ?? null,
      scheduledStartUtc: r.scheduled_start_utc,
      timezone: r.timezone,
      durationMin: r.duration_min,
      status: r.status,
      cancellationReason: r.cancellation_reason,
      substituteTutorId: r.substitute_tutor_id,
      substituteDisplayName: r.substitute_display_name,
    }));
  }

  /** Academy-wide student directory (Main > Students). `filters.status`
   *  defaults to 'active' (the page's default view, matching this
   *  endpoint's original behavior); pass status:'left' or omit filters
   *  entirely for the "Inactive" / "All" views. `q`/`batchId`/`tutorId`
   *  narrow the already-fetched rows in-memory — one academy's roster is a
   *  bounded dataset, no need to push filtering into SQL. */
  async listStudentsAcrossAcademy(
    ownerUserId: string,
    filters?: {
      q?: string;
      batchId?: string;
      tutorId?: string;
      status?: string;
    },
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );
    const status =
      filters?.status === 'active' || filters?.status === 'left'
        ? filters.status
        : filters?.status === 'all'
          ? undefined
          : 'active';
    const rows = await this.batchesRepository.listEnrollmentsForAcademy(
      academy.id,
      status,
    );

    const q = filters?.q?.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !(r.display_name ?? '').toLowerCase().includes(q)) return false;
      if (filters?.batchId && r.batch_id !== filters.batchId) return false;
      if (filters?.tutorId && r.tutor_id !== filters.tutorId) return false;
      return true;
    });

    return filtered.map((r) => ({
      enrollmentId: r.enrollment_id,
      studentId: r.student_id,
      displayName: r.display_name,
      phoneE164: r.phone_e164,
      status: r.status,
      joinedAt: r.joined_at,
      batchId: r.batch_id,
      batchTitle: r.batch_title,
      tutorId: r.tutor_id,
      tutorDisplayName: teacherNames.get(r.tutor_id) ?? null,
      subjectId: r.subject_id,
      gradeLevelId: r.grade_level_id,
      gradeLevel: r.grade_level,
    }));
  }

  /** Single student's detail view (Main > Students > :id) — every
   *  enrollment this student has across the academy's active teachers'
   *  batches (any status, so a student who left one batch but is active in
   *  another still shows correctly), plus linked parent(s)
   *  (AcademyOwnerParentsRepository, same table the Parents feature reads)
   *  and a per-batch attendance summary. 404s if the student has no
   *  enrollment anywhere in this academy — the same ownership boundary
   *  listStudentsAcrossAcademy enforces implicitly by only ever listing
   *  this academy's own roster. */
  async getStudentDetail(ownerUserId: string, studentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );
    const rows = await this.batchesRepository.listEnrollmentsForAcademy(
      academy.id,
    );
    const enrollments = rows.filter((r) => r.student_id === studentId);
    if (enrollments.length === 0) {
      throw new NotFoundException(
        "That student isn't enrolled with your academy",
      );
    }

    const [links, attendanceSummaries] = await Promise.all([
      this.academyOwnerParentsRepository.listActiveLinksForStudents([
        studentId,
      ]),
      Promise.all(
        enrollments.map(async (e) => ({
          batchId: e.batch_id,
          summary: await this.attendanceRepository
            .summaryForStudent(studentId, e.batch_id)
            .catch(() => null),
        })),
      ),
    ]);

    const first = enrollments[0];
    return {
      studentId,
      displayName: first.display_name,
      phoneE164: first.phone_e164,
      gradeLevel: first.grade_level,
      enrollments: enrollments.map((e) => ({
        enrollmentId: e.enrollment_id,
        batchId: e.batch_id,
        batchTitle: e.batch_title,
        subjectId: e.subject_id,
        gradeLevelId: e.grade_level_id,
        tutorId: e.tutor_id,
        tutorDisplayName: teacherNames.get(e.tutor_id) ?? null,
        status: e.status,
        joinedAt: e.joined_at,
        attendance:
          attendanceSummaries.find((a) => a.batchId === e.batch_id)?.summary ??
          null,
      })),
      parents: links.map((l) => ({
        parentId: l.parent_id,
        phoneE164: l.phone_e164,
        email: l.email,
      })),
    };
  }
}
