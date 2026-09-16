import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyLocationsRepository } from '../academies/academy-locations.repository';
import { AcademyPhotosRepository } from '../academies/academy-photos.repository';
import { AcademyContactRequestsRepository } from '../academies/academy-contact-requests.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AcademyMembershipRequestsRepository } from '../academy-memberships/academy-membership-requests.repository';
import { AcademyReviewsService } from '../academy-reviews/academy-reviews.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TutorSubjectsRepository } from '../../catalog/tutor-subjects/tutor-subjects.repository';
import { TeacherLeaveRepository } from '../../holidays/teacher-leave.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { randomSlugSuffix, slugify } from '../../identity/profiles/slug.util';
import type { UpsertAcademyDto } from '../academies/dto/upsert-academy.dto';
import type { AcademyContactRequestStatus } from '../../../database/types';
import {
  AcademyImageUploadUrlDto,
  MAX_ACADEMY_IMAGE_BYTES,
} from '../academies/dto/academy-image-upload-url.dto';

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Self-serve Academy Dashboard — the gap migration 0030 explicitly left
 * open. Every method resolves "my academy" from `owner_user_id` keyed
 * off the caller's own JWT `sub` (never a client-supplied academy id),
 * which is what makes cross-academy access impossible even if the
 * frontend nav were bypassed: an academy user simply has no way to name
 * another academy's id in any request this service accepts.
 *
 * Deliberately reuses AcademiesRepository/AcademyLocationsRepository/
 * AcademyPhotosRepository/AcademyContactRequestsRepository/
 * AcademyMembershipsRepository (same instances AcademiesModule and
 * AcademyAdminService already use) rather than duplicating queries —
 * see AcademiesModule's doc comment for why those are exported.
 *
 * Joining/leaving an academy never touches a tutor's own account,
 * profile, batches, students, reviews, or bookings — accept only ever
 * inserts an academy_memberships row (existing repository method,
 * reused as-is) and remove only ever flips that row's status
 * (markLeft). See this feature's plan doc, "hard invariant" section.
 */
@Injectable()
export class AcademyOwnerService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyLocationsRepository: AcademyLocationsRepository,
    private readonly academyPhotosRepository: AcademyPhotosRepository,
    private readonly academyContactRequestsRepository: AcademyContactRequestsRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academyMembershipRequestsRepository: AcademyMembershipRequestsRepository,
    private readonly academyReviewsService: AcademyReviewsService,
    private readonly batchesRepository: BatchesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly bookingsService: BookingsService,
    private readonly notificationsService: NotificationsService,
    private readonly tutorSubjectsRepository: TutorSubjectsRepository,
    private readonly teacherLeaveRepository: TeacherLeaveRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Every other method starts here. Throws 404 (not 403) when no
   *  academy is linked yet — from the caller's point of view "you have
   *  no academy" and "that academy doesn't exist" are the same thing. */
  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /**
   * Self-serve signup's bootstrap step (see login-form.tsx's
   * 'academy'-role signup): `/auth/otp/verify` grants the `academy` role
   * and creates the user, but never touches `academies` — this is the
   * one endpoint on this controller allowed to run with no academy
   * linked yet, and the only one that creates rather than reads/mutates
   * an existing row. One owner can never have two academies (also
   * enforced by the DB's `academies_owner_user_id_uq` partial index) —
   * checked here first for a clean 400 instead of a raw constraint
   * error.
   */
  async createMyAcademy(ownerUserId: string, dto: UpsertAcademyDto) {
    const existing =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (existing) {
      throw new BadRequestException('You already have an academy.');
    }
    const slug = await this.generateUniqueSlug(dto.name);
    const academy = await this.academiesRepository.create(slug, dto);
    return this.academiesRepository.setOwnerUserId(academy.id, ownerUserId);
  }

  async getMe(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const [location, logoUrl, coverUrl] = await Promise.all([
      this.academyLocationsRepository.findByAcademyId(academy.id),
      academy.logo_object_key
        ? this.storage.createDownloadUrl(academy.logo_object_key)
        : Promise.resolve(null),
      academy.cover_object_key
        ? this.storage.createDownloadUrl(academy.cover_object_key)
        : Promise.resolve(null),
    ]);

    return {
      id: academy.id,
      name: academy.name,
      slug: academy.slug,
      tagline: academy.tagline,
      description: academy.description,
      methodology: academy.methodology,
      yearsEstablished: academy.years_established,
      achievements: academy.achievements,
      certifications: academy.certifications,
      teachingMode: academy.teaching_mode,
      verificationStatus: academy.verification_status,
      contactPhone: academy.contact_phone,
      contactEmail: academy.contact_email,
      websiteUrl: academy.website_url,
      logoUrl,
      coverUrl,
      location: location
        ? {
            city: location.city,
            areaLabel: location.area_label,
            lat: location.lat,
            lng: location.lng,
          }
        : null,
      countryCode: academy.country_code,
      stateCode: academy.state_code,
      autoObserveGovtHolidays: academy.auto_observe_govt_holidays,
    };
  }

  /** Holiday & Teacher Leave Management's Academy Setting (spec §8) —
   *  the only setting on this dashboard today, hence its own small
   *  method rather than folding into updateProfile's broader
   *  UpsertAcademyDto shape. */
  async updateSettings(ownerUserId: string, autoObserveGovtHolidays: boolean) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const updated = await this.academiesRepository.setAutoObserveGovtHolidays(
      academy.id,
      autoObserveGovtHolidays,
    );
    return {
      countryCode: updated.country_code,
      stateCode: updated.state_code,
      autoObserveGovtHolidays: updated.auto_observe_govt_holidays,
    };
  }

  async getStats(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);

    const [activeTeachers, pendingRequests, contactRequests, { summary }] =
      await Promise.all([
        this.academyMembershipsRepository.listActiveForAcademy(academy.id),
        this.academyMembershipRequestsRepository.listPendingForAcademy(
          academy.id,
        ),
        this.academyContactRequestsRepository.listForAcademy(academy.id),
        this.academyReviewsService.listForAcademy(academy.id),
      ]);

    const tutorIds = activeTeachers.map((t) => t.tutor_id);
    const [openBatches, studentsCount] = await Promise.all([
      this.batchesRepository.listOpenWithSeatsForTutors(tutorIds),
      this.countStudentsForTutors(tutorIds),
    ]);

    return {
      verificationStatus: academy.verification_status,
      teacherCount: activeTeachers.length,
      studentsCount,
      openBatchesCount: openBatches.length,
      pendingRequestCount: pendingRequests.length,
      unreadContactRequestCount: contactRequests.filter((r) => !r.read_at)
        .length,
      rating: summary,
    };
  }

  /** Read-only, derived from active members' tutor_subjects — per
   *  migration 0030's own doc comment, "subjects/classes offered by an
   *  academy are deliberately NOT a table", same pattern used for public
   *  academy search. Backs Academy Profile's "Academic Information"
   *  panel; there is no editable academy-level subjects field. */
  async getAcademicInfo(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const rows = await this.tutorSubjectsRepository.listForTutors(
      activeTeachers.map((t) => t.tutor_id),
    );

    const bySubject = new Map<
      string,
      { subjectId: string; name: string; gradeMin: number; gradeMax: number }
    >();
    for (const row of rows) {
      const name = row.subject_name_i18n.en;
      const existing = bySubject.get(row.subject_id);
      if (existing) {
        existing.gradeMin = Math.min(existing.gradeMin, row.grade_min);
        existing.gradeMax = Math.max(existing.gradeMax, row.grade_max);
      } else {
        bySubject.set(row.subject_id, {
          subjectId: row.subject_id,
          name,
          gradeMin: row.grade_min,
          gradeMax: row.grade_max,
        });
      }
    }

    return { subjects: Array.from(bySubject.values()) };
  }

  async updateProfile(ownerUserId: string, dto: UpsertAcademyDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const updated = await this.academiesRepository.update(academy.id, dto);
    if (dto.city && dto.lat != null && dto.lng != null) {
      await this.academyLocationsRepository.upsert(
        academy.id,
        dto.city,
        dto.areaLabel ?? null,
        dto.lat,
        dto.lng,
      );
    }
    return updated;
  }

  async createLogoUploadUrl(
    ownerUserId: string,
    dto: AcademyImageUploadUrlDto,
  ) {
    this.assertSize(dto.sizeBytes);
    const academy = await this.resolveOwnAcademy(ownerUserId);
    if (academy.logo_object_key) {
      await this.storage.delete(academy.logo_object_key);
    }
    const objectKey = `academies/${academy.id}/logo-${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    await this.academiesRepository.setLogoObjectKey(academy.id, objectKey);
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload };
  }

  async createCoverUploadUrl(
    ownerUserId: string,
    dto: AcademyImageUploadUrlDto,
  ) {
    this.assertSize(dto.sizeBytes);
    const academy = await this.resolveOwnAcademy(ownerUserId);
    if (academy.cover_object_key) {
      await this.storage.delete(academy.cover_object_key);
    }
    const objectKey = `academies/${academy.id}/cover-${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    await this.academiesRepository.setCoverObjectKey(academy.id, objectKey);
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload };
  }

  async listPhotos(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const photos = await this.academyPhotosRepository.listForAcademy(
      academy.id,
    );
    return Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        url: await this.storage.createDownloadUrl(p.object_key),
        caption: p.caption,
        sortOrder: p.sort_order,
      })),
    );
  }

  async addPhoto(ownerUserId: string, dto: AcademyImageUploadUrlDto) {
    this.assertSize(dto.sizeBytes);
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const objectKey = `academies/${academy.id}/photos/${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    const existing = await this.academyPhotosRepository.listForAcademy(
      academy.id,
    );
    const photo = await this.academyPhotosRepository.add(
      academy.id,
      objectKey,
      dto.caption ?? null,
      existing.length,
    );
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload, photoId: photo.id };
  }

  /** Reorders the academy's photo gallery — `photoIds` is the complete
   *  new order (index 0 becomes the cover photo). Validates every id
   *  belongs to this academy and that the set is unchanged before writing
   *  anything, so a partial/mismatched list never leaves sort_order in a
   *  half-applied state. */
  async reorderPhotos(ownerUserId: string, photoIds: string[]) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const existing = await this.academyPhotosRepository.listForAcademy(
      academy.id,
    );
    const existingIds = new Set(existing.map((p) => p.id));
    if (
      photoIds.length !== existing.length ||
      !photoIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        "The photo list does not match your academy's current photos",
      );
    }
    await Promise.all(
      photoIds.map((id, index) =>
        this.academyPhotosRepository.setSortOrder(id, index),
      ),
    );
    return this.listPhotos(ownerUserId);
  }

  async removePhoto(ownerUserId: string, photoId: string): Promise<void> {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const photo = await this.academyPhotosRepository.findById(photoId);
    if (!photo) throw new NotFoundException('Photo not found');
    if (photo.academy_id !== academy.id) {
      throw new ForbiddenException('That photo belongs to another academy');
    }
    await this.storage.delete(photo.object_key);
    await this.academyPhotosRepository.remove(photoId);
  }

  async listActiveTeachers(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    return Promise.all(
      teachers.map(async (t) => ({
        membershipId: t.membership_id,
        tutorId: t.tutor_id,
        displayName: t.display_name,
        slug: t.tutor_slug,
        headline: t.headline,
        avatarUrl: t.avatar_object_key
          ? await this.storage.createDownloadUrl(t.avatar_object_key)
          : null,
        yearsExperience: t.years_experience,
        verificationStatus: t.verification_status,
        joinedAt: t.joined_at,
      })),
    );
  }

  async listPendingRequests(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const requests =
      await this.academyMembershipRequestsRepository.listPendingForAcademy(
        academy.id,
      );
    return Promise.all(
      requests.map(async (r) => ({
        requestId: r.id,
        tutorId: r.tutor_id,
        displayName: r.display_name,
        slug: r.tutor_slug,
        headline: r.headline,
        avatarUrl: r.avatar_object_key
          ? await this.storage.createDownloadUrl(r.avatar_object_key)
          : null,
        yearsExperience: r.years_experience,
        verificationStatus: r.verification_status,
        message: r.message,
        requestedAt: r.created_at,
      })),
    );
  }

  async listRemovedTeachers(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const teachers = await this.academyMembershipsRepository.listLeftForAcademy(
      academy.id,
    );
    return Promise.all(
      teachers.map(async (t) => ({
        membershipId: t.membership_id,
        tutorId: t.tutor_id,
        displayName: t.display_name,
        slug: t.tutor_slug,
        headline: t.headline,
        avatarUrl: t.avatar_object_key
          ? await this.storage.createDownloadUrl(t.avatar_object_key)
          : null,
        joinedAt: t.joined_at,
        leftAt: t.left_at,
      })),
    );
  }

  /** Academy Dashboard > Teachers > :id. Composes the full profile
   *  (findActiveWithProfile), this academy's batches for the teacher
   *  (BatchesRepository.listForTutors, filtered to one tutor — same method
   *  the roster views use), the next 14 days of classes
   *  (SessionsRepository.listForTutorsBetween), subjects
   *  (TutorSubjectsRepository, same as getAcademicInfo), and this
   *  academy's leave history for the teacher. Deliberately never selects
   *  salary/commission/fee fields — out of scope. */
  async getTeacherDetail(ownerUserId: string, tutorId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const member =
      await this.academyMembershipsRepository.findActiveWithProfile(
        academy.id,
        tutorId,
      );
    if (!member) {
      throw new NotFoundException(
        "That teacher isn't an active member of your academy",
      );
    }

    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const [avatarUrl, batches, upcomingSessions, subjects, leaveRequests] =
      await Promise.all([
        member.avatar_object_key
          ? this.storage.createDownloadUrl(member.avatar_object_key)
          : Promise.resolve(null),
        this.batchesRepository.listForTutors([tutorId]),
        this.sessionsRepository.listForTutorsBetween(
          [tutorId],
          now,
          twoWeeksOut,
        ),
        this.tutorSubjectsRepository.listForTutors([tutorId]),
        this.teacherLeaveRepository
          .listForTutor(tutorId)
          .then((rows) => rows.filter((r) => r.academy_id === academy.id)),
      ]);

    return {
      tutorId: member.tutor_id,
      displayName: member.display_name,
      slug: member.tutor_slug,
      headline: member.headline,
      bio: member.bio,
      avatarUrl,
      yearsExperience: member.years_experience,
      verificationStatus: member.verification_status,
      qualifications: member.qualifications,
      languages: member.languages,
      teachingMode: member.teaching_mode,
      methodology: member.methodology,
      achievements: member.achievements,
      certifications: member.certifications,
      joinedAt: member.joined_at,
      active: member.membership_status === 'active',
      subjects: subjects.map((s) => ({
        subjectId: s.subject_id,
        name: s.subject_name_i18n.en,
        gradeMin: s.grade_min,
        gradeMax: s.grade_max,
      })),
      batches: batches.map((b) => ({
        id: b.id,
        title: b.title,
        subjectId: b.subject_id,
        gradeLevelId: b.grade_level_id,
        status: b.status,
        enrolledCount: Number(b.enrolled_count),
      })),
      upcomingClasses: upcomingSessions.map((s) => ({
        id: s.id,
        batchId: s.batch_id,
        batchTitle: s.batch_title,
        subjectId: s.subject_id,
        scheduledStartUtc: s.scheduled_start_utc,
        timezone: s.timezone,
        durationMin: s.duration_min,
        status: s.status,
      })),
      leaveHistory: leaveRequests.map((r) => ({
        id: r.id,
        startDate: r.start_date,
        endDate: r.end_date,
        leaveType: r.leave_type,
        status: r.status,
        reason: r.reason,
      })),
    };
  }

  async acceptRequest(ownerUserId: string, requestId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const request =
      await this.academyMembershipRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.academy_id !== academy.id) {
      throw new ForbiddenException('That request belongs to another academy');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('That request has already been decided');
    }

    const existingMembership =
      await this.academyMembershipsRepository.findActiveMembership(
        academy.id,
        request.tutor_id,
      );
    if (!existingMembership) {
      await this.academyMembershipsRepository.create(
        academy.id,
        request.tutor_id,
      );
    }
    const decided =
      await this.academyMembershipRequestsRepository.markAccepted(requestId);

    await this.notificationsService.notify({
      userIds: [request.tutor_id],
      type: 'academy_join_accepted',
      title: 'Join request accepted',
      body: `${academy.name} accepted your request to join.`,
      payload: { academyId: academy.id, membershipId: existingMembership?.id },
    });

    return decided;
  }

  async rejectRequest(ownerUserId: string, requestId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const request =
      await this.academyMembershipRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.academy_id !== academy.id) {
      throw new ForbiddenException('That request belongs to another academy');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('That request has already been decided');
    }

    const decided =
      await this.academyMembershipRequestsRepository.markRejected(requestId);

    await this.notificationsService.notify({
      userIds: [request.tutor_id],
      type: 'academy_join_rejected',
      title: 'Join request declined',
      body: `Your request to join ${academy.name} was declined.`,
      payload: { academyId: academy.id, requestId },
    });

    return decided;
  }

  /** Deactivates the membership only — see this method's guarantees in
   *  the class doc comment above. Never deletes or modifies the
   *  teacher's user row, profile, batches, students, reviews, or
   *  bookings, and never revokes their login. */
  async removeTeacher(ownerUserId: string, membershipId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const membership =
      await this.academyMembershipsRepository.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.academy_id !== academy.id) {
      throw new ForbiddenException(
        'That membership belongs to another academy',
      );
    }
    return this.academyMembershipsRepository.markLeft(membershipId);
  }

  async listContactRequests(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.academyContactRequestsRepository.listForAcademy(academy.id);
  }

  async markContactRequestRead(ownerUserId: string, requestId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const request =
      await this.academyContactRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundException('Contact request not found');
    if (request.academy_id !== academy.id) {
      throw new ForbiddenException(
        'That contact request belongs to another academy',
      );
    }
    return this.academyContactRequestsRepository.markRead(requestId);
  }

  /** Minimal status pipeline (migration 0036), additive to markContactRequestRead
   *  above — read_at still powers the unread badge, status is the admin's
   *  own New/Contacted/Interested/Joined/Not Interested tracking. */
  async updateContactRequestStatus(
    ownerUserId: string,
    requestId: string,
    status: AcademyContactRequestStatus,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const request =
      await this.academyContactRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundException('Contact request not found');
    if (request.academy_id !== academy.id) {
      throw new ForbiddenException(
        'That contact request belongs to another academy',
      );
    }
    return this.academyContactRequestsRepository.updateStatus(
      requestId,
      status,
    );
  }

  private assertSize(sizeBytes: number): void {
    if (sizeBytes > MAX_ACADEMY_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image is too large (max ${Math.floor(MAX_ACADEMY_IMAGE_BYTES / 1024 / 1024)}MB)`,
      );
    }
  }

  /** Same slug-generation loop as AcademyAdminService.generateUniqueSlug
   *  — small precedented duplication rather than exporting a private
   *  method across modules (see countStudentsForTutors below). */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'academy';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomSlugSuffix()}`;
      if (!(await this.academiesRepository.slugExists(candidate))) {
        return candidate;
      }
    }
    return `${base}-${randomSlugSuffix()}-${Date.now()}`;
  }

  /** Same union-of-batch-and-booking-students logic as
   *  AcademiesService.countStudentsForTutors — small precedented
   *  duplication rather than exporting a private method across modules,
   *  see this feature's plan doc §5. */
  private async countStudentsForTutors(tutorIds: string[]): Promise<number> {
    const [batchStudentIds, bookingStudentIds] = await Promise.all([
      this.batchesRepository.listDistinctStudentIdsForTutors(tutorIds),
      this.bookingsService.listDistinctCompletedStudentIdsForTutors(tutorIds),
    ]);
    return new Set([...batchStudentIds, ...bookingStudentIds]).size;
  }
}
