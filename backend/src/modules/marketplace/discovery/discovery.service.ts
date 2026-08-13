import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiscoveryRepository } from './discovery.repository';
import { UsersRepository } from '../../identity/users/users.repository';
import { ProfilesService } from '../../identity/profiles/profiles.service';
import { TutorLocationsRepository } from '../locations/tutor-locations.repository';
import { ProofOfTeachingService } from '../proof-of-teaching/proof-of-teaching.service';
import { ReviewsService } from '../reviews/reviews.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { NotificationsService } from '../../notifications/notifications.service';
import { ContactRequestsRepository } from './contact-requests.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { SearchTutorsDto } from './dto/search-tutors.dto';
import type { ContactTeacherDto } from './dto/contact-teacher.dto';

const DENSITY_GATE = { tutors: 25, students: 250 };
const CANDIDATE_POOL_CAP = 50;
const DEFAULT_RESULT_LIMIT = 20;
const DEFAULT_RADIUS_KM = 15;

/**
 * Discovery search + ranking + the public SEO tutor page (blueprint §10
 * Phase 4). Ranks by the Proof-of-Teaching score built in an earlier
 * commit — no separate ranking model. Below the density gate, search
 * ignores filters and returns a small curated pool instead ("Discover
 * shows curated/waitlist state, never an empty search" — blueprint §10).
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly discoveryRepository: DiscoveryRepository,
    private readonly usersRepository: UsersRepository,
    private readonly profilesService: ProfilesService,
    private readonly tutorLocationsRepository: TutorLocationsRepository,
    private readonly proofOfTeachingService: ProofOfTeachingService,
    private readonly reviewsService: ReviewsService,
    private readonly batchesRepository: BatchesRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly contactRequestsRepository: ContactRequestsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
  ) {}

  async isGateOpen(): Promise<boolean> {
    const [tutors, students] = await Promise.all([
      this.usersRepository.countActiveByRole('tutor'),
      this.usersRepository.countActiveByRole('student'),
    ]);
    return tutors >= DENSITY_GATE.tutors && students >= DENSITY_GATE.students;
  }

  async searchTutors(query: SearchTutorsDto) {
    const gateOpen = await this.isGateOpen();

    let tutorIds: string[] | undefined;
    if (gateOpen && query.lat != null && query.lng != null) {
      const nearby = await this.tutorLocationsRepository.searchNear(
        query.lat,
        query.lng,
        query.radiusKm ?? DEFAULT_RADIUS_KM,
        CANDIDATE_POOL_CAP,
      );
      tutorIds = nearby.map((r) => r.tutor_id);
    }

    const offerings = await this.discoveryRepository.searchOfferings({
      subjectId: gateOpen ? query.subjectId : undefined,
      curriculumId: gateOpen ? query.curriculumId : undefined,
      grade: gateOpen ? query.grade : undefined,
      tutorIds: gateOpen ? tutorIds : undefined,
      teachingMode: gateOpen ? query.teachingMode : undefined,
      minExperience: gateOpen ? query.minExperience : undefined,
      feeMaxMinor: gateOpen ? query.feeMaxMinor : undefined,
      language: gateOpen ? query.language : undefined,
      limit: CANDIDATE_POOL_CAP,
    });

    const offeringsByTutor = new Map<string, typeof offerings>();
    for (const offering of offerings) {
      const bucket = offeringsByTutor.get(offering.tutor_id);
      if (bucket) bucket.push(offering);
      else offeringsByTutor.set(offering.tutor_id, [offering]);
    }

    const ranked = await Promise.all(
      [...offeringsByTutor.entries()].map(async ([tutorId, tutorOfferings]) => {
        const [pot, { summary }, location] = await Promise.all([
          this.proofOfTeachingService.scoreForTutor(tutorId),
          this.reviewsService.listForTutor(tutorId),
          this.tutorLocationsRepository.findByTutorId(tutorId),
        ]);
        const first = tutorOfferings[0];
        return {
          tutorId,
          displayName: first.display_name,
          slug: first.tutor_slug,
          headline: first.headline,
          avatarUrl: first.avatar_object_key
            ? await this.storage.createDownloadUrl(first.avatar_object_key)
            : null,
          teachingMode: first.teaching_mode,
          languages: first.languages ?? [],
          location: location
            ? { city: location.city, areaLabel: location.area_label }
            : null,
          proofOfTeachingScore: pot.score,
          studentsTaught: pot.studentsTaught,
          rating: summary,
          offerings: tutorOfferings.map((o) => ({
            tutorSubjectId: o.tutor_subject_id,
            subjectId: o.subject_id,
            subjectName: o.subject_name_i18n,
            subjectSlug: o.subject_slug,
            curriculumId: o.curriculum_id,
            gradeMin: o.grade_min,
            gradeMax: o.grade_max,
            hourlyRateMinor: o.hourly_rate_minor,
          })),
        };
      }),
    );

    const filtered =
      gateOpen && query.minRating != null
        ? ranked.filter((r) => (r.rating.average ?? 0) >= query.minRating!)
        : ranked;

    filtered.sort((a, b) => b.proofOfTeachingScore - a.proofOfTeachingScore);

    return {
      gateOpen,
      curated: !gateOpen,
      results: filtered.slice(0, query.limit ?? DEFAULT_RESULT_LIMIT),
    };
  }

  /** Public SEO tutor page (blueprint §10 Phase 4) — open to search
   *  engines, so it's keyed by the public slug, not the user id, and
   *  exposes only city/area (never precise lat/lng). */
  async getPublicTutorPage(slug: string) {
    const profile = await this.profilesService.getPublicTutorProfile(slug);

    const [
      offerings,
      proofOfTeaching,
      reviews,
      location,
      openBatches,
      academies,
    ] = await Promise.all([
      this.discoveryRepository.listOfferingsForTutor(profile.user_id),
      this.proofOfTeachingService.scoreForTutor(profile.user_id),
      this.reviewsService.listForTutor(profile.user_id),
      this.tutorLocationsRepository.findByTutorId(profile.user_id),
      this.batchesRepository.listOpenWithSeatsForTutor(profile.user_id),
      this.academyMembershipsRepository.listActiveForTutor(profile.user_id),
    ]);

    return {
      profile: {
        displayName: profile.display_name,
        slug: profile.slug,
        headline: profile.headline,
        bio: profile.bio,
        yearsExperience: profile.years_experience,
        verificationStatus: profile.verification_status,
        avatarUrl: profile.avatarUrl,
        qualifications: profile.qualifications,
        languages: profile.languages ?? [],
        teachingMode: profile.teaching_mode,
        methodology: profile.methodology,
        achievements: profile.achievements,
        certifications: profile.certifications,
        feeNote: profile.fee_note,
      },
      location: location
        ? { city: location.city, areaLabel: location.area_label }
        : null,
      offerings: offerings.map((o) => ({
        tutorSubjectId: o.tutor_subject_id,
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
        title: b.title,
        subjectId: b.subject_id,
        gradeLevelId: b.grade_level_id,
        feeMinor: b.fee_minor,
        currency: b.currency,
        feePeriod: b.fee_period,
        capacity: b.capacity,
        seatsRemaining: Math.max(0, b.capacity - Number(b.enrolled_count)),
      })),
      proofOfTeaching,
      reviews,
      /** Bidirectional link into Find an Academy — Path 1 of the
       *  requirement (Find a Teacher -> Teacher Profile -> "Teaching
       *  under" -> View Academy). */
      academies: await Promise.all(
        academies.map(async (a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          logoUrl: a.logo_object_key
            ? await this.storage.createDownloadUrl(a.logo_object_key)
            : null,
        })),
      ),
    };
  }

  /** A student or parent reaching out before any booking/enrollment
   *  exists — the messaging module can't be reused here since its
   *  threads require an active enrollment (see MessagesService's own
   *  doc comment). Persists a lead the tutor sees on their Marketplace
   *  page, and notifies them via the existing NotificationsService. */
  async contactTutor(
    slug: string,
    requesterId: string,
    requesterRole: 'student' | 'parent',
    dto: ContactTeacherDto,
  ) {
    const profile = await this.profilesService.getPublicTutorProfile(slug);
    await this.contactRequestsRepository.create({
      tutorId: profile.user_id,
      requesterId,
      requesterRole,
      message: dto.message ?? null,
    });

    const requesterLabel =
      requesterRole === 'student' ? 'A student' : 'A parent';
    await this.notificationsService.notify({
      userIds: [profile.user_id],
      type: 'teacher_contact_request',
      title: 'New contact request',
      body: `${requesterLabel} wants to connect with you on Find a Teacher.`,
      payload: { requesterId, requesterRole, message: dto.message ?? null },
    });
  }

  listContactRequestsForTutor(tutorId: string) {
    return this.contactRequestsRepository.listForTutor(tutorId);
  }

  async markContactRequestRead(tutorId: string, id: string) {
    const request = await this.contactRequestsRepository.findById(id);
    if (!request) throw new NotFoundException('Contact request not found');
    if (request.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your contact request');
    }
    return this.contactRequestsRepository.markRead(id);
  }
}
