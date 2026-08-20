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
import type { CreateBatchDto } from '../../scheduling/batches/dto/create-batch.dto';
import type { UpdateBatchDto } from '../../scheduling/batches/dto/update-batch.dto';
import type { CreateSessionDto } from '../../scheduling/sessions/dto/create-session.dto';
import type { CreateInviteDto } from '../../scheduling/invites/dto/create-invite.dto';

/**
 * Academy-scoped delegation over a member tutor's batches/sessions/
 * invites — NOT a new ownership model. A batch is still owned by exactly
 * one `tutor_id`; this service only adds a permission layer that lets the
 * academy owner act on a batch belonging to one of their *active* member
 * tutors, by resolving the target tutor and calling the exact same
 * BatchesService/SessionsService/InvitesService methods a tutor calls for
 * themselves (those services take `tutorId` as a plain parameter, never
 * assume it's the caller — see this feature's plan doc). Every method
 * re-validates active membership even when a batchId already implies it,
 * mirroring the existing "belongs to another academy" 403 pattern used
 * throughout AcademyOwnerService.
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

  /** Loads a batch and confirms its owning tutor is currently an active
   *  member of this academy — the shared guard every batchId-based
   *  endpoint below starts with. */
  private async resolveMemberBatch(academyId: string, batchId: string) {
    const batch = await this.batchesRepository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    await this.assertActiveMember(academyId, batch.tutor_id);
    return batch;
  }

  async listBatches(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const teacherNames = new Map(
      activeTeachers.map((t) => [t.tutor_id, t.display_name]),
    );
    const batches = await this.batchesRepository.listForTutors(
      activeTeachers.map((t) => t.tutor_id),
    );
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
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const teacher = activeTeachers.find((t) => t.tutor_id === batch.tutor_id);
    return {
      id: batch.id,
      tutorId: batch.tutor_id,
      tutorDisplayName: teacher?.display_name ?? null,
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
    return this.batchesService.create(tutorId, dto);
  }

  async updateBatch(ownerUserId: string, batchId: string, dto: UpdateBatchDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.batchesService.update(batch.tutor_id, batchId, dto);
  }

  async archiveBatch(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.batchesService.archive(batch.tutor_id, batchId);
  }

  async listStudents(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.batchesService.listEnrollments(batch.tutor_id, batchId);
  }

  async removeStudent(ownerUserId: string, batchId: string, studentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.batchesService.removeStudent(
      batch.tutor_id,
      batchId,
      studentId,
    );
  }

  async listSessions(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.sessionsService.listForBatch(batch.tutor_id, batchId);
  }

  async createSession(ownerUserId: string, dto: CreateSessionDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, dto.batchId);
    return this.sessionsService.create(batch.tutor_id, dto);
  }

  async cancelSession(
    ownerUserId: string,
    batchId: string,
    sessionId: string,
    wholeSeries: boolean,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.sessionsService.cancel(batch.tutor_id, sessionId, wholeSeries);
  }

  async listInvites(ownerUserId: string, batchId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.invitesService.listForBatch(batch.tutor_id, batchId);
  }

  async createInvite(
    ownerUserId: string,
    batchId: string,
    dto: CreateInviteDto,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const batch = await this.resolveMemberBatch(academy.id, batchId);
    return this.invitesService.create(batch.tutor_id, batchId, dto);
  }

  /** Every scheduled class across the academy's active teachers in a
   *  window — backs Today's "Classes happening today"/"Upcoming Classes". */
  async listSessionsAcrossAcademy(ownerUserId: string, from: Date, to: Date) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const teacherNames = new Map(
      activeTeachers.map((t) => [t.tutor_id, t.display_name]),
    );
    const rows = await this.sessionsRepository.listForTutorsBetween(
      activeTeachers.map((t) => t.tutor_id),
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
    }));
  }

  async listStudentsAcrossAcademy(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const teacherNames = new Map(
      activeTeachers.map((t) => [t.tutor_id, t.display_name]),
    );
    const rows = await this.batchesRepository.listEnrollmentsForTutors(
      activeTeachers.map((t) => t.tutor_id),
    );
    return rows.map((r) => ({
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
    }));
  }
}
