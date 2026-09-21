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
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
}

export interface AcademyOfferingSearchFilters {
  subjectId?: string;
  curriculumId?: string;
  grade?: number;
  teachingMode?: 'online' | 'offline' | 'both';
  limit: number;
}

/** No table of its own beyond `academies` itself — subjects/classes an
 *  academy offers are derived from the batches it owns (batches.academy_id)
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
        contact_phone: input.contactPhone ?? null,
        contact_email: input.contactEmail ?? null,
        website_url: input.websiteUrl ?? null,
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
        contact_phone: input.contactPhone ?? null,
        contact_email: input.contactEmail ?? null,
        website_url: input.websiteUrl ?? null,
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

  /** Holiday & Teacher Leave Management (migration 0035) — the academy's
   *  "Automatically observe [state] Government Holidays" setting. */
  setAutoObserveGovtHolidays(id: string, enabled: boolean) {
    return this.db
      .updateTable('academies')
      .set({ auto_observe_govt_holidays: enabled })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Every academy currently opted into automatic government-holiday
   *  observance — the daily reminders cron's sweep list. */
  listAutoObservingGovtHolidays() {
    return this.db
      .selectFrom('academies')
      .selectAll()
      .where('auto_observe_govt_holidays', '=', true)
      .execute();
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

  /** Candidate pool for search — one row per ACTIVE batch an academy owns
   *  (batches.academy_id). An academy is discoverable by the subjects/
   *  grades it actually teaches in its own batches — NOT by the
   *  Individual marketplace listings (tutor_subjects, with the teacher's
   *  own hourly rates) of the teachers who happen to be its members. Only
   *  verified academies are discoverable. */
  searchAcademyOfferings(filters: AcademyOfferingSearchFilters) {
    let query = this.db
      .selectFrom('batches')
      .innerJoin('academies', 'academies.id', 'batches.academy_id')
      .innerJoin('subjects', 'subjects.id', 'batches.subject_id')
      .innerJoin('grade_levels', 'grade_levels.id', 'batches.grade_level_id')
      .select([
        'academies.id as academy_id',
        'academies.name',
        'academies.slug as academy_slug',
        'academies.tagline',
        'academies.teaching_mode',
        'academies.logo_object_key',
        'academies.verification_status',
        'academies.created_at as academy_created_at',
        'batches.id as batch_id',
        'batches.tutor_id',
        'grade_levels.curriculum_id',
        'grade_levels.ordinal as grade_min',
        'grade_levels.ordinal as grade_max',
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
      ])
      .where('batches.status', '=', 'active')
      .where('academies.verification_status', '=', 'verified');

    if (filters.subjectId) {
      query = query.where('batches.subject_id', '=', filters.subjectId);
    }
    if (filters.curriculumId) {
      query = query.where(
        'grade_levels.curriculum_id',
        '=',
        filters.curriculumId,
      );
    }
    if (filters.grade != null) {
      query = query.where('grade_levels.ordinal', '=', filters.grade);
    }
    if (filters.teachingMode) {
      query = query.where('academies.teaching_mode', '=', filters.teachingMode);
    }

    return query.orderBy('academies.created_at').limit(filters.limit).execute();
  }

  /** Single-academy variant of the above, for the public academy page's
   *  "Subjects & classes" section — the subjects the academy teaches in
   *  its own active batches, with the grade range, how many batches run
   *  it and the lowest batch fee. Never the members' Individual
   *  tutor_subjects / hourly rates. */
  async listOfferingsForAcademy(academyId: string) {
    const rows = await this.db
      .selectFrom('batches')
      .innerJoin('subjects', 'subjects.id', 'batches.subject_id')
      .innerJoin('grade_levels', 'grade_levels.id', 'batches.grade_level_id')
      .select((eb) => [
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        'subjects.slug as subject_slug',
        eb.fn.min('grade_levels.ordinal').as('grade_min'),
        eb.fn.max('grade_levels.ordinal').as('grade_max'),
        eb.fn.countAll().as('batch_count'),
        eb.fn.min('batches.fee_minor').as('from_fee_minor'),
      ])
      .where('batches.academy_id', '=', academyId)
      .where('batches.status', '=', 'active')
      .groupBy(['subjects.id', 'subjects.name_i18n', 'subjects.slug'])
      .execute();
    return rows.map((r) => ({
      subject_id: r.subject_id,
      subject_name_i18n: r.subject_name_i18n,
      subject_slug: r.subject_slug,
      grade_min: Number(r.grade_min),
      grade_max: Number(r.grade_max),
      batch_count: Number(r.batch_count),
      from_fee_minor: Number(r.from_fee_minor),
    }));
  }
}
