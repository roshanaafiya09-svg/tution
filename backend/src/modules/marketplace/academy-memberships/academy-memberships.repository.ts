import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

/**
 * The teacher <-> academy connection. Kept as its own leaf module (no
 * other imports) so both AcademiesModule and AcademyReviewsModule can
 * depend on it without creating a module-level import cycle between
 * them — see AcademiesModule's doc comment.
 */
@Injectable()
export class AcademyMembershipsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findActiveMembership(academyId: string, tutorId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .selectAll()
      .where('academy_id', '=', academyId)
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'active')
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_memberships')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** "Our Teachers" section — real active members only, joined to the
   *  SAME profiles_tutor row Find a Teacher uses (no duplicate teacher
   *  profile data). */
  listActiveForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .select([
        'academy_memberships.id as membership_id',
        'academy_memberships.tutor_id',
        'academy_memberships.joined_at',
        'profiles_tutor.display_name',
        'profiles_tutor.slug as tutor_slug',
        'profiles_tutor.headline',
        'profiles_tutor.avatar_object_key',
        'profiles_tutor.years_experience',
        'profiles_tutor.verification_status',
      ])
      .where('academy_memberships.academy_id', '=', academyId)
      .where('academy_memberships.status', '=', 'active')
      .orderBy('academy_memberships.joined_at')
      .execute();
  }

  /** Single active member with their full profile — the Academy Dashboard's
   *  Teacher Detail page (Main > Teachers > :id). Unlike listActiveForAcademy
   *  (a lean roster-card projection), this selects the whole
   *  profiles_tutor row so the detail page can show qualifications,
   *  languages, methodology, achievements, certifications — no salary/fee
   *  fields are selected, that stays out of scope. */
  findActiveWithProfile(academyId: string, tutorId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .select([
        'academy_memberships.id as membership_id',
        'academy_memberships.tutor_id',
        'academy_memberships.joined_at',
        'academy_memberships.status as membership_status',
        'profiles_tutor.display_name',
        'profiles_tutor.slug as tutor_slug',
        'profiles_tutor.headline',
        'profiles_tutor.bio',
        'profiles_tutor.avatar_object_key',
        'profiles_tutor.years_experience',
        'profiles_tutor.verification_status',
        'profiles_tutor.qualifications',
        'profiles_tutor.languages',
        'profiles_tutor.teaching_mode',
        'profiles_tutor.methodology',
        'profiles_tutor.achievements',
        'profiles_tutor.certifications',
      ])
      .where('academy_memberships.academy_id', '=', academyId)
      .where('academy_memberships.tutor_id', '=', tutorId)
      .where('academy_memberships.status', '=', 'active')
      .executeTakeFirst();
  }

  /** A teacher's own "Teaching under" list — additive to their existing
   *  profile, and also feeds the bidirectional badge on the public
   *  tutor page (Find a Teacher -> Teacher Profile -> View Academy). */
  listActiveForTutor(tutorId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin('academies', 'academies.id', 'academy_memberships.academy_id')
      .select([
        'academies.id',
        'academies.name',
        'academies.slug',
        'academies.logo_object_key',
      ])
      .where('academy_memberships.tutor_id', '=', tutorId)
      .where('academy_memberships.status', '=', 'active')
      .orderBy('academy_memberships.joined_at')
      .execute();
  }

  /** Academy Dashboard > Teachers > Removed — past members only,
   *  read-only history. Removing a teacher never deletes anything about
   *  the teacher themselves, only flips this row's status (markLeft). */
  listLeftForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .select([
        'academy_memberships.id as membership_id',
        'academy_memberships.tutor_id',
        'academy_memberships.joined_at',
        'academy_memberships.left_at',
        'profiles_tutor.display_name',
        'profiles_tutor.slug as tutor_slug',
        'profiles_tutor.headline',
        'profiles_tutor.avatar_object_key',
      ])
      .where('academy_memberships.academy_id', '=', academyId)
      .where('academy_memberships.status', '=', 'left')
      .orderBy('academy_memberships.left_at', 'desc')
      .execute();
  }

  /** Distinct academies a set of tutors are currently active members of
   *  — Holiday & Teacher Leave feature's student/parent-facing "which
   *  academies' holidays are relevant to me" resolution (a student's
   *  academies are their enrolled batches' tutors' academies). */
  async listActiveAcademyIdsForTutors(tutorIds: string[]): Promise<string[]> {
    if (tutorIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('academy_memberships')
      .select('academy_id')
      .distinct()
      .where('tutor_id', 'in', tutorIds)
      .where('status', '=', 'active')
      .execute();
    return rows.map((r) => r.academy_id);
  }

  countActiveForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('academy_id', '=', academyId)
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow();
  }

  create(academyId: string, tutorId: string) {
    return this.db
      .insertInto('academy_memberships')
      .values({ id: newId(), academy_id: academyId, tutor_id: tutorId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markLeft(id: string) {
    return this.db
      .updateTable('academy_memberships')
      .set({ status: 'left', left_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
