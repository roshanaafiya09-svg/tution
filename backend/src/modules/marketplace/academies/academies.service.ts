import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AcademiesRepository } from './academies.repository';
import { AcademyLocationsRepository } from './academy-locations.repository';
import { AcademyPhotosRepository } from './academy-photos.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AcademyContactRequestsRepository } from './academy-contact-requests.repository';
import { AcademyReviewsService } from '../academy-reviews/academy-reviews.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { BookingsService } from '../bookings/bookings.service';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import type { SearchAcademiesDto } from './dto/search-academies.dto';
import type { ContactAcademyDto } from './dto/contact-academy.dto';

/** Rarer entity type than tutors — reusing DiscoveryService's 25-tutor/
 *  250-student gate would stay permanently closed. A small verified-
 *  academy count instead, confirmed with the user as a starting point
 *  (easy to tune later). */
const ACADEMY_DENSITY_GATE = { academies: 3 };
const CANDIDATE_POOL_CAP = 50;
const DEFAULT_RESULT_LIMIT = 20;

/**
 * Public academy discovery search + ranking + the public academy page
 * (blueprint-adjacent "Find an Academy", same shape as DiscoveryService
 * applied to academies instead of tutors). No Proof-of-Teaching
 * equivalent exists for academies, so ranking falls back to rating then
 * teacher count — a judgment call, not a blueprint-specified formula.
 */
@Injectable()
export class AcademiesService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyLocationsRepository: AcademyLocationsRepository,
    private readonly academyPhotosRepository: AcademyPhotosRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academyContactRequestsRepository: AcademyContactRequestsRepository,
    private readonly academyReviewsService: AcademyReviewsService,
    private readonly batchesRepository: BatchesRepository,
    private readonly bookingsService: BookingsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async isGateOpen(): Promise<boolean> {
    const verifiedCount = await this.academiesRepository.countVerified();
    return verifiedCount >= ACADEMY_DENSITY_GATE.academies;
  }

  async searchAcademies(query: SearchAcademiesDto) {
    const gateOpen = await this.isGateOpen();

    const offerings = await this.academiesRepository.searchAcademyOfferings({
      subjectId: gateOpen ? query.subjectId : undefined,
      curriculumId: gateOpen ? query.curriculumId : undefined,
      grade: gateOpen ? query.grade : undefined,
      teachingMode: gateOpen ? query.teachingMode : undefined,
      limit: CANDIDATE_POOL_CAP,
    });

    const offeringsByAcademy = new Map<string, typeof offerings>();
    for (const offering of offerings) {
      const bucket = offeringsByAcademy.get(offering.academy_id);
      if (bucket) bucket.push(offering);
      else offeringsByAcademy.set(offering.academy_id, [offering]);
    }

    const ranked = await Promise.all(
      [...offeringsByAcademy.entries()].map(
        async ([academyId, academyOfferings]) => {
          const first = academyOfferings[0];
          const tutorIds = [
            ...new Set(academyOfferings.map((o) => o.tutor_id)),
          ];
          const subjects = [
            ...new Set(academyOfferings.map((o) => o.subject_name_i18n.en)),
          ];
          const gradeMins = academyOfferings.map((o) => o.grade_min);
          const gradeMaxes = academyOfferings.map((o) => o.grade_max);

          const [teachers, { summary }, location, studentsCount] =
            await Promise.all([
              this.academyMembershipsRepository.listActiveForAcademy(academyId),
              this.academyReviewsService.listForAcademy(academyId),
              this.academyLocationsRepository.findByAcademyId(academyId),
              this.countStudentsForTutors(tutorIds),
            ]);

          return {
            academyId,
            name: first.name,
            slug: first.academy_slug,
            tagline: first.tagline,
            logoUrl: first.logo_object_key
              ? await this.storage.createDownloadUrl(first.logo_object_key)
              : null,
            verificationStatus: first.verification_status,
            teachingMode: first.teaching_mode,
            location: location
              ? { city: location.city, areaLabel: location.area_label }
              : null,
            subjects,
            grades: {
              min: Math.min(...gradeMins),
              max: Math.max(...gradeMaxes),
            },
            teacherCount: teachers.length,
            studentsCount,
            rating: summary,
          };
        },
      ),
    );

    const filtered =
      gateOpen && query.minRating != null
        ? ranked.filter((r) => (r.rating.average ?? 0) >= query.minRating!)
        : ranked;

    filtered.sort(
      (a, b) =>
        (b.rating.average ?? 0) - (a.rating.average ?? 0) ||
        b.teacherCount - a.teacherCount,
    );

    return {
      gateOpen,
      curated: !gateOpen,
      results: filtered.slice(0, query.limit ?? DEFAULT_RESULT_LIMIT),
    };
  }

  /** Public academy page. "Our Teachers" links back to the SAME
   *  Teacher Profile Find a Teacher uses (tutor slug), never a
   *  duplicate — see AcademyMembershipsRepository.listActiveForAcademy. */
  async getPublicAcademyPage(slug: string) {
    const academy = await this.academiesRepository.findBySlug(slug);
    if (!academy) {
      throw new NotFoundException('Academy not found');
    }

    const teachersRaw =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const tutorIds = teachersRaw.map((t) => t.tutor_id);

    const [
      location,
      photosRaw,
      offeringsRaw,
      openBatches,
      reviews,
      studentsCount,
      teachers,
      logoUrl,
      coverUrl,
    ] = await Promise.all([
      this.academyLocationsRepository.findByAcademyId(academy.id),
      this.academyPhotosRepository.listForAcademy(academy.id),
      this.academiesRepository.listOfferingsForAcademy(academy.id),
      this.batchesRepository.listOpenWithSeatsForTutors(tutorIds),
      this.academyReviewsService.listForAcademy(academy.id),
      this.countStudentsForTutors(tutorIds),
      Promise.all(
        teachersRaw.map(async (t) => ({
          tutorId: t.tutor_id,
          displayName: t.display_name,
          slug: t.tutor_slug,
          headline: t.headline,
          avatarUrl: t.avatar_object_key
            ? await this.storage.createDownloadUrl(t.avatar_object_key)
            : null,
          yearsExperience: t.years_experience,
          verificationStatus: t.verification_status,
        })),
      ),
      academy.logo_object_key
        ? this.storage.createDownloadUrl(academy.logo_object_key)
        : Promise.resolve(null),
      academy.cover_object_key
        ? this.storage.createDownloadUrl(academy.cover_object_key)
        : Promise.resolve(null),
    ]);

    const photos = await Promise.all(
      photosRaw.map(async (p) => ({
        id: p.id,
        url: await this.storage.createDownloadUrl(p.object_key),
        caption: p.caption,
      })),
    );

    const teacherNameById = new Map(
      teachers.map((t) => [t.tutorId, t.displayName]),
    );

    return {
      academy: {
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
        logoUrl,
        coverUrl,
      },
      location: location
        ? { city: location.city, areaLabel: location.area_label }
        : null,
      teachers,
      photos,
      offerings: offeringsRaw.map((o) => ({
        tutorSubjectId: o.tutor_subject_id,
        tutorId: o.tutor_id,
        tutorDisplayName: o.tutor_display_name,
        tutorSlug: o.tutor_slug,
        subjectId: o.subject_id,
        subjectName: o.subject_name_i18n,
        subjectSlug: o.subject_slug,
        curriculumId: o.curriculum_id,
        gradeMin: o.grade_min,
        gradeMax: o.grade_max,
        hourlyRateMinor: o.hourly_rate_minor,
      })),
      availableBatches: openBatches.map((b) => ({
        id: b.id,
        tutorId: b.tutor_id,
        tutorDisplayName: teacherNameById.get(b.tutor_id) ?? null,
        title: b.title,
        subjectId: b.subject_id,
        gradeLevelId: b.grade_level_id,
        feeMinor: b.fee_minor,
        currency: b.currency,
        feePeriod: b.fee_period,
        capacity: b.capacity,
        seatsRemaining: Math.max(0, b.capacity - Number(b.enrolled_count)),
      })),
      studentsCount,
      reviews,
    };
  }

  /** A student or parent reaching out before any relationship exists —
   *  mirrors DiscoveryService.contactTutor, but does NOT call
   *  NotificationsService.notify(): no academy-owner user exists yet to
   *  notify (see migration 0030's doc comment). Leads are visible to
   *  superadmin only, via AcademyAdminController. */
  async contactAcademy(
    slug: string,
    requesterId: string,
    requesterRole: 'student' | 'parent',
    dto: ContactAcademyDto,
  ) {
    const academy = await this.academiesRepository.findBySlug(slug);
    if (!academy) {
      throw new NotFoundException('Academy not found');
    }
    await this.academyContactRequestsRepository.create({
      academyId: academy.id,
      requesterId,
      requesterRole,
      message: dto.message ?? null,
    });
  }

  /** A teacher's own "Teaching under" list — used by their profile page
   *  and by DiscoveryService.getPublicTutorPage's bidirectional badge. */
  async listMembershipsForTutor(tutorId: string) {
    const rows =
      await this.academyMembershipsRepository.listActiveForTutor(tutorId);
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        logoUrl: r.logo_object_key
          ? await this.storage.createDownloadUrl(r.logo_object_key)
          : null,
      })),
    );
  }

  /** Distinct students across every active member tutor of an academy —
   *  multi-tutor sibling of ProofOfTeachingService.countStudentsTaught,
   *  which is hard-wired to one tutor id and can't be reused directly. */
  private async countStudentsForTutors(tutorIds: string[]): Promise<number> {
    const [batchStudentIds, bookingStudentIds] = await Promise.all([
      this.batchesRepository.listDistinctStudentIdsForTutors(tutorIds),
      this.bookingsService.listDistinctCompletedStudentIdsForTutors(tutorIds),
    ]);
    return new Set([...batchStudentIds, ...bookingStudentIds]).size;
  }
}
