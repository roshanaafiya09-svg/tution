import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { AcademyAnnouncementsRepository } from './academy-announcements.repository';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import type { AcademyAnnouncementAudience } from '../../../database/types';

interface AudienceTargets {
  audienceBatchId: string | null;
  audienceTeacherId: string | null;
  audienceStudentId: string | null;
}

/**
 * Academy Dashboard > Communication > Announcements. Deliberately a
 * separate concept from the existing batch-scoped `announcements` table
 * — see migration 0037's doc comment. Follows the same
 * resolveOwnAcademy/ownership-check shape as every other academy-owner
 * service (AcademyOwnerLeaveService, AcademyOwnerBatchesService): every
 * method resolves "my academy" from the caller's own JWT subject first,
 * then validates any client-supplied batch/teacher/student id actually
 * belongs to THIS academy before it's ever persisted or used to resolve
 * recipients.
 *
 * Recipient resolution (resolveRecipients) only ever runs from publish()
 * — it's a pure read, computed into a Set so overlapping audience paths
 * (e.g. a student who's both in a targeted batch and reachable via a
 * separate 'students' broadcast) naturally dedupe to one notification
 * each. Publishing itself is guarded against a concurrent double-publish
 * by AcademyAnnouncementsRepository.publish's atomic
 * `where status = 'draft'` UPDATE — see that method's doc comment for
 * why a plain read-then-write status check isn't safe here (unlike
 * TeacherLeaveRepository.setStatus's equivalent, unguarded transition,
 * where the consequence of a race is much smaller).
 */
@Injectable()
export class AcademyOwnerAnnouncementsService {
  private readonly logger = new Logger(AcademyOwnerAnnouncementsService.name);

  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly notificationsService: NotificationsService,
    private readonly repository: AcademyAnnouncementsRepository,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  private async activeTeacherIds(academyId: string): Promise<string[]> {
    const teachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academyId);
    return teachers.map((t) => t.tutor_id);
  }

  async list(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.repository.listForAcademy(academy.id);
  }

  async get(ownerUserId: string, id: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const announcement = await this.repository.findForAcademy(id, academy.id);
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  /** Validates the chosen audience's target id against this academy's
   *  own active teachers/batches/students, and returns the exact three
   *  target-column values to persist — nulling out the two that don't
   *  apply regardless of what the caller sent, so an unused client-
   *  supplied id (e.g. a garbage audienceStudentId alongside
   *  audienceType: 'batch') is never silently persisted (matches the
   *  migration's own cross-column CHECK constraint). */
  private async resolveAudienceTargets(
    academyId: string,
    audienceType: AcademyAnnouncementAudience,
    ids: {
      audienceBatchId?: string;
      audienceTeacherId?: string;
      audienceStudentId?: string;
    },
  ): Promise<AudienceTargets> {
    if (audienceType === 'batch') {
      if (!ids.audienceBatchId) {
        throw new BadRequestException(
          'audienceBatchId is required for a batch announcement',
        );
      }
      const batch = await this.batchesRepository.findById(ids.audienceBatchId);
      if (!batch) throw new NotFoundException('Batch not found');
      const membership =
        await this.academyMembershipsRepository.findActiveMembership(
          academyId,
          batch.tutor_id,
        );
      if (!membership) {
        throw new ForbiddenException('That batch belongs to another academy');
      }
      return {
        audienceBatchId: batch.id,
        audienceTeacherId: null,
        audienceStudentId: null,
      };
    }

    if (audienceType === 'teacher') {
      if (!ids.audienceTeacherId) {
        throw new BadRequestException(
          'audienceTeacherId is required for a teacher announcement',
        );
      }
      const membership =
        await this.academyMembershipsRepository.findActiveMembership(
          academyId,
          ids.audienceTeacherId,
        );
      if (!membership) {
        throw new ForbiddenException('That teacher belongs to another academy');
      }
      return {
        audienceBatchId: null,
        audienceTeacherId: ids.audienceTeacherId,
        audienceStudentId: null,
      };
    }

    if (audienceType === 'student') {
      if (!ids.audienceStudentId) {
        throw new BadRequestException(
          'audienceStudentId is required for a student announcement',
        );
      }
      const tutorIds = await this.activeTeacherIds(academyId);
      const enrollments = await this.batchesRepository.listEnrollmentsForTutors(
        tutorIds,
        'active',
      );
      const belongs = enrollments.some(
        (e) => e.student_id === ids.audienceStudentId,
      );
      if (!belongs) {
        throw new ForbiddenException(
          "That student isn't enrolled with your academy",
        );
      }
      return {
        audienceBatchId: null,
        audienceTeacherId: null,
        audienceStudentId: ids.audienceStudentId,
      };
    }

    // 'academy' | 'teachers' | 'students' | 'parents' — no single target id.
    return {
      audienceBatchId: null,
      audienceTeacherId: null,
      audienceStudentId: null,
    };
  }

  async create(ownerUserId: string, dto: CreateAnnouncementDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const targets = await this.resolveAudienceTargets(
      academy.id,
      dto.audienceType,
      dto,
    );

    const announcement = await this.repository.create({
      academyId: academy.id,
      createdBy: ownerUserId,
      title: dto.title,
      body: dto.body,
      audienceType: dto.audienceType,
      ...targets,
    });

    if (dto.publishNow) {
      return this.publish(ownerUserId, announcement.id);
    }
    return announcement;
  }

  async update(ownerUserId: string, id: string, dto: UpdateAnnouncementDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const existing = await this.repository.findForAcademy(id, academy.id);
    if (!existing) throw new NotFoundException('Announcement not found');
    if (existing.status !== 'draft') {
      throw new BadRequestException('Only a draft announcement can be edited');
    }

    const nextAudienceType = dto.audienceType ?? existing.audience_type;
    const targets = await this.resolveAudienceTargets(
      academy.id,
      nextAudienceType,
      {
        audienceBatchId:
          dto.audienceBatchId ?? existing.audience_batch_id ?? undefined,
        audienceTeacherId:
          dto.audienceTeacherId ?? existing.audience_teacher_id ?? undefined,
        audienceStudentId:
          dto.audienceStudentId ?? existing.audience_student_id ?? undefined,
      },
    );

    const updated = await this.repository.update(id, academy.id, {
      title: dto.title,
      body: dto.body,
      audienceType: nextAudienceType,
      ...targets,
    });
    if (!updated) {
      // Only possible if the announcement was published concurrently
      // between the findForAcademy check above and this write.
      throw new BadRequestException('Only a draft announcement can be edited');
    }
    return updated;
  }

  async delete(ownerUserId: string, id: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const existing = await this.repository.findForAcademy(id, academy.id);
    if (!existing) throw new NotFoundException('Announcement not found');
    const result = await this.repository.deleteDraft(id, academy.id);
    if (!result || Number(result.numDeletedRows) === 0) {
      throw new BadRequestException('Only a draft announcement can be deleted');
    }
    return { ok: true };
  }

  async publish(ownerUserId: string, id: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const existing = await this.repository.findForAcademy(id, academy.id);
    if (!existing) throw new NotFoundException('Announcement not found');
    if (existing.status !== 'draft') {
      throw new ConflictException(
        'This announcement has already been published or archived',
      );
    }

    const recipientIds = await this.resolveRecipients(academy.id, existing);
    const published = await this.repository.publish(
      id,
      academy.id,
      recipientIds.size,
    );
    if (!published) {
      // Lost a race with a concurrent publish/archive between the read
      // above and this atomic write — the other request already fanned
      // out the notification, so this one must not also do it.
      throw new ConflictException(
        'This announcement has already been published or archived',
      );
    }

    if (recipientIds.size > 0) {
      try {
        await this.notificationsService.notify({
          userIds: [...recipientIds],
          type: 'academy_announcement',
          title: published.title,
          body: published.body,
          payload: { announcementId: published.id, academyId: academy.id },
        });
      } catch (err) {
        // The announcement is published either way — a delivery failure
        // here must not roll that back or look like publish() itself
        // failed.
        this.logger.warn(
          `Failed to notify recipients of announcement ${id}: ${err}`,
        );
      }
    }

    return published;
  }

  async archive(ownerUserId: string, id: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const existing = await this.repository.findForAcademy(id, academy.id);
    if (!existing) throw new NotFoundException('Announcement not found');
    const archived = await this.repository.archive(id, academy.id);
    if (!archived) {
      throw new BadRequestException(
        'Only a published announcement can be archived',
      );
    }
    return archived;
  }

  /** Pure read, only ever called from publish(). Returns a Set so
   *  overlapping recipient paths (e.g. 'academy' = teachers ∪ students ∪
   *  parents-of-students) naturally dedupe to one notification per
   *  person. */
  private async resolveRecipients(
    academyId: string,
    announcement: {
      audience_type: AcademyAnnouncementAudience;
      audience_batch_id: string | null;
      audience_teacher_id: string | null;
      audience_student_id: string | null;
    },
  ): Promise<Set<string>> {
    switch (announcement.audience_type) {
      case 'teacher':
        return new Set(
          announcement.audience_teacher_id
            ? [announcement.audience_teacher_id]
            : [],
        );

      case 'student':
        return new Set(
          announcement.audience_student_id
            ? [announcement.audience_student_id]
            : [],
        );

      case 'batch': {
        const batchId = announcement.audience_batch_id;
        if (!batchId) return new Set();
        const studentIds =
          await this.batchesRepository.listDistinctStudentIdsForBatches([
            batchId,
          ]);
        const parentIds =
          await this.attendanceRepository.listActiveParentIdsForStudents(
            studentIds,
          );
        return new Set([...studentIds, ...parentIds]);
      }

      case 'teachers': {
        const teacherIds = await this.activeTeacherIds(academyId);
        return new Set(teacherIds);
      }

      case 'students': {
        const teacherIds = await this.activeTeacherIds(academyId);
        const studentIds =
          await this.batchesRepository.listDistinctStudentIdsForTutors(
            teacherIds,
          );
        return new Set(studentIds);
      }

      case 'parents': {
        const teacherIds = await this.activeTeacherIds(academyId);
        const studentIds =
          await this.batchesRepository.listDistinctStudentIdsForTutors(
            teacherIds,
          );
        const parentIds =
          await this.attendanceRepository.listActiveParentIdsForStudents(
            studentIds,
          );
        return new Set(parentIds);
      }

      case 'academy':
      default: {
        const teacherIds = await this.activeTeacherIds(academyId);
        const studentIds =
          await this.batchesRepository.listDistinctStudentIdsForTutors(
            teacherIds,
          );
        const parentIds =
          await this.attendanceRepository.listActiveParentIdsForStudents(
            studentIds,
          );
        return new Set([...teacherIds, ...studentIds, ...parentIds]);
      }
    }
  }
}
