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

  /** H8: the PUBLIC roster (public Academy page, Find-an-Academy cards) —
   *  listActiveForAcademy minus any teacher whose account has been
   *  deleted. listActiveForAcademy itself is deliberately unchanged: the
   *  academy's own dashboard, reports and history keep attributing past
   *  classes to that teacher by name; only public discovery hides them. */
  listPublicForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .innerJoin('users', 'users.id', 'academy_memberships.tutor_id')
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
      .where('users.deleted_at', 'is', null)
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

  /** tutor_id -> display name for EVERY teacher who has ever been a
   *  member (active or left). Academy views of historical records (batches,
   *  classes, attendance) keep attributing them to a teacher who has since
   *  left, because the academy retains that history. */
  async displayNamesForAcademy(
    academyId: string,
  ): Promise<Map<string, string>> {
    const rows = await this.db
      .selectFrom('academy_memberships')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_memberships.tutor_id',
      )
      .select(['academy_memberships.tutor_id', 'profiles_tutor.display_name'])
      .where('academy_memberships.academy_id', '=', academyId)
      .execute();
    return new Map(rows.map((r) => [r.tutor_id, r.display_name]));
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

  /**
   * Ends a membership AND, in the same transaction, retires any leave
   * request the departing teacher still has pending against THIS academy
   * — a pending request left dangling could otherwise be approved later
   * against a teacher who is no longer a member, generating a stray
   * `teacher_leave` cancellation with no real membership behind it (see
   * TeacherLeaveService.approve's defense-in-depth membership re-check
   * for the other half of this guarantee). 'cancelled' is the same
   * terminal status a teacher's own withdraw() already uses — this is
   * simply the automatic, membership-driven route to it, never decided
   * by an academy admin (`decided_by` stays null, same as withdraw()).
   *
   * Reaches directly into `teacher_leave_requests` — a table owned by
   * the holidays module — rather than injecting TeacherLeaveService,
   * the same "repository crosses table boundaries directly when a
   * shared transaction needs it" pattern AttendanceRepository already
   * uses for `parent_child_links` (see its doc comment). This also
   * sidesteps a real module cycle: AcademyOwnerModule/HolidaysModule
   * already depend on AcademiesModule, so wiring the dependency the
   * other way round here is not an option.
   */
  markLeft(id: string) {
    return this.db.transaction().execute(async (trx) => {
      const membership = await trx
        .updateTable('academy_memberships')
        .set({ status: 'left', left_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('teacher_leave_requests')
        .set({ status: 'cancelled', decided_at: new Date() })
        .where('academy_id', '=', membership.academy_id)
        .where('tutor_id', '=', membership.tutor_id)
        .where('status', '=', 'pending')
        .execute();

      return membership;
    });
  }
}
