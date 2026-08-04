import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

export interface OfferingSearchFilters {
  subjectId?: string;
  curriculumId?: string;
  grade?: number;
  tutorIds?: string[];
  limit: number;
}

/** No table of its own — composes tutor_subjects/profiles_tutor/subjects,
 *  same "derived signal" pattern as ProofOfTeachingModule. */
@Injectable()
export class DiscoveryRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** Candidate pool for search — only verified tutors are discoverable
   *  (blueprint §9's verified badge is the trust gate for public
   *  listing, not just a profile decoration). */
  searchOfferings(filters: OfferingSearchFilters) {
    let query = this.db
      .selectFrom('tutor_subjects')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'tutor_subjects.tutor_id',
      )
      .innerJoin('subjects', 'subjects.id', 'tutor_subjects.subject_id')
      .select([
        'tutor_subjects.id as tutor_subject_id',
        'tutor_subjects.tutor_id',
        'tutor_subjects.hourly_rate_minor',
        'tutor_subjects.grade_min',
        'tutor_subjects.grade_max',
        'tutor_subjects.curriculum_id',
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
        'profiles_tutor.display_name',
        'profiles_tutor.slug as tutor_slug',
        'profiles_tutor.headline',
      ])
      .where('profiles_tutor.verification_status', '=', 'verified');

    if (filters.subjectId) {
      query = query.where('tutor_subjects.subject_id', '=', filters.subjectId);
    }
    if (filters.curriculumId) {
      query = query.where(
        'tutor_subjects.curriculum_id',
        '=',
        filters.curriculumId,
      );
    }
    if (filters.grade != null) {
      query = query
        .where('tutor_subjects.grade_min', '<=', filters.grade)
        .where('tutor_subjects.grade_max', '>=', filters.grade);
    }
    if (filters.tutorIds) {
      query = query.where(
        'tutor_subjects.tutor_id',
        'in',
        filters.tutorIds.length
          ? filters.tutorIds
          : ['00000000-0000-0000-0000-000000000000'],
      );
    }

    return query
      .orderBy('tutor_subjects.created_at')
      .limit(filters.limit)
      .execute();
  }

  listOfferingsForTutor(tutorId: string) {
    return this.db
      .selectFrom('tutor_subjects')
      .innerJoin('subjects', 'subjects.id', 'tutor_subjects.subject_id')
      .select([
        'tutor_subjects.id as tutor_subject_id',
        'tutor_subjects.hourly_rate_minor',
        'tutor_subjects.grade_min',
        'tutor_subjects.grade_max',
        'tutor_subjects.curriculum_id',
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
      ])
      .where('tutor_subjects.tutor_id', '=', tutorId)
      .execute();
  }
}
