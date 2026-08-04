import { Injectable } from '@nestjs/common';
import { DiscoveryRepository } from './discovery.repository';
import { UsersRepository } from '../../identity/users/users.repository';
import { ProfilesService } from '../../identity/profiles/profiles.service';
import { TutorLocationsRepository } from '../locations/tutor-locations.repository';
import { ProofOfTeachingService } from '../proof-of-teaching/proof-of-teaching.service';
import { ReviewsService } from '../reviews/reviews.service';
import type { SearchTutorsDto } from './dto/search-tutors.dto';

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
        const [pot, { summary }] = await Promise.all([
          this.proofOfTeachingService.scoreForTutor(tutorId),
          this.reviewsService.listForTutor(tutorId),
        ]);
        const first = tutorOfferings[0];
        return {
          tutorId,
          displayName: first.display_name,
          slug: first.tutor_slug,
          headline: first.headline,
          proofOfTeachingScore: pot.score,
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

    ranked.sort((a, b) => b.proofOfTeachingScore - a.proofOfTeachingScore);

    return {
      gateOpen,
      curated: !gateOpen,
      results: ranked.slice(0, query.limit ?? DEFAULT_RESULT_LIMIT),
    };
  }

  /** Public SEO tutor page (blueprint §10 Phase 4) — open to search
   *  engines, so it's keyed by the public slug, not the user id, and
   *  exposes only city/area (never precise lat/lng). */
  async getPublicTutorPage(slug: string) {
    const profile = await this.profilesService.getPublicTutorProfile(slug);

    const [offerings, proofOfTeaching, reviews, location] = await Promise.all([
      this.discoveryRepository.listOfferingsForTutor(profile.user_id),
      this.proofOfTeachingService.scoreForTutor(profile.user_id),
      this.reviewsService.listForTutor(profile.user_id),
      this.tutorLocationsRepository.findByTutorId(profile.user_id),
    ]);

    return {
      profile: {
        displayName: profile.display_name,
        slug: profile.slug,
        headline: profile.headline,
        bio: profile.bio,
        yearsExperience: profile.years_experience,
        verificationStatus: profile.verification_status,
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
      proofOfTeaching,
      reviews,
    };
  }
}
