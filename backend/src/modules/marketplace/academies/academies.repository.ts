import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface UpsertAcademyInput {
  name: string;
  tagline?: string | null;
  description?: string | null;
  methodology?: string | null;
  yearsEstablished?: number | null;
  achievements?: string | null;
  certifications?: string | null;
  teachingMode?: 'online' | 'offline' | 'both' | null;
}

export interface AcademyOfferingSearchFilters {
  subjectId?: string;
  curriculumId?: string;
  grade?: number;
  teachingMode?: 'online' | 'offline' | 'both';
  limit: number;
}

/** No table of its own beyond `academies` itself — subjects/classes an
 *  academy offers are derived from active memberships -> tutor_subjects
 *  (same "derived signal, no table of its own" pattern as
 *  DiscoveryRepository), never duplicated into a parallel table. */
@Injectable()
export class AcademiesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findBySlug(slug: string) {
    return this.db
      .selectFrom('academies')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academies')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Resolves "my academy" for the self-serve Academy Dashboard — every
   *  /academy/* endpoint keys off the caller's own id via this lookup,
   *  never a client-supplied academy id, so an academy user can never
   *  reach another academy's data. */
  findByOwnerUserId(ownerUserId: string) {
    return this.db
      .selectFrom('academies')
      .selectAll()
      .where('owner_user_id', '=', ownerUserId)
      .executeTakeFirst();
  }

  setOwnerUserId(id: string, ownerUserId: string) {
    return this.db
      .updateTable('academies')
      .set({ owner_user_id: ownerUserId })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async slugExists(slug: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('academies')
      .select('id')
      .where('slug', '=', slug)
      .executeTakeFirst();
    return !!row;
  }

  create(slug: string, input: UpsertAcademyInput) {
    return this.db
      .insertInto('academies')
      .values({
        id: newId(),
        slug,
        name: input.name,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        methodology: input.methodology ?? null,
        years_established: input.yearsEstablished ?? null,
        achievements: input.achievements ?? null,
        certifications: input.certifications ?? null,
        teaching_mode: input.teachingMode ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  update(id: string, input: UpsertAcademyInput) {
    return this.db
      .updateTable('academies')
      .set({
        name: input.name,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        methodology: input.methodology ?? null,
        years_established: input.yearsEstablished ?? null,
        achievements: input.achievements ?? null,
        certifications: input.certifications ?? null,
        teaching_mode: input.teachingMode ?? null,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setLogoObjectKey(id: string, objectKey: string | null) {
    return this.db
      .updateTable('academies')
      .set({ logo_object_key: objectKey })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setCoverObjectKey(id: string, objectKey: string | null) {
    return this.db
      .updateTable('academies')
      .set({ cover_object_key: objectKey })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setVerificationStatus(
    id: string,
    status: 'pending' | 'verified' | 'rejected',
  ) {
    return this.db
      .updateTable('academies')
      .set({ verification_status: status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Superadmin list/search — mirrors AdminRepository.listTeachers'
   *  optional-`q` shape. */
  listAll(q?: string) {
    let query = this.db
      .selectFrom('academies')
      .selectAll()
      .orderBy('created_at', 'desc');
    if (q) {
      query = query.where('name', 'ilike', `%${q}%`);
    }
    return query.execute();
  }

  async countVerified(): Promise<number> {
    const row = await this.db
      .selectFrom('academies')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('verification_status', '=', 'verified')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Candidate pool for search — mirrors
   *  DiscoveryRepository.searchOfferings exactly, rooted at
   *  academy_memberships instead of tutor_subjects directly. Only
   *  verified academies with at least one active member offering the
   *  matched subject are discoverable. */
  searchAcademyOfferings(filters: AcademyOfferingSearchFilters) {
    let query = this.db
      .selectFrom('academy_memberships')
      .innerJoin('academies', 'academies.id', 'academy_memberships.academy_id')
      .innerJoin(
        'tutor_subjects',
        'tutor_subjects.tutor_id',
        'academy_memberships.tutor_id',
      )
      .innerJoin('subjects', 'subjects.id', 'tutor_subjects.subject_id')
      .select([
        'academies.id as academy_id',
        'academies.name',
        'academies.slug as academy_slug',
        'academies.tagline',
        'academies.teaching_mode',
        'academies.logo_object_key',
        'academies.verification_status',
        'academies.created_at as academy_created_at',
        'tutor_subjects.id as tutor_subject_id',
        'tutor_subjects.tutor_id',
        'tutor_subjects.hourly_rate_minor',
        'tutor_subjects.grade_min',
        'tutor_subjects.grade_max',
        'tutor_subjects.curriculum_id',
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
      ])
      .where('academy_memberships.status', '=', 'active')
      .where('academies.verification_status', '=', 'verified');

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
    if (filters.teachingMode) {
      query = query.where('academies.teaching_mode', '=', filters.teachingMode);
    }

    return query.orderBy('academies.created_at').limit(filters.limit).execute();
  }

  /** Single-academy variant of the above, for the public academy page's
   *  "Subjects & classes" section — every row also carries which tutor
   *  offers it, so the UI can attribute it and link to that teacher. */
  listOfferingsForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'tutor_subjects',
        'tutor_subjects.tutor_id',
        'academy_memberships.tutor_id',
      )
      .innerJoin('subjects', 'subjects.id', 'tutor_subjects.subject_id')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .select([
        'tutor_subjects.id as tutor_subject_id',
        'tutor_subjects.tutor_id',
        'profiles_tutor.display_name as tutor_display_name',
        'profiles_tutor.slug as tutor_slug',
        'tutor_subjects.hourly_rate_minor',
        'tutor_subjects.grade_min',
        'tutor_subjects.grade_max',
        'tutor_subjects.curriculum_id',
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
      ])
      .where('academy_memberships.academy_id', '=', academyId)
      .where('academy_memberships.status', '=', 'active')
      .execute();
  }
}
