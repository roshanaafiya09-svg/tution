import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

/**
 * A tutor's request to join an academy — separate leaf table from
 * academy_memberships (see migration 0031's doc comment). Lives in this
 * leaf module alongside AcademyMembershipsRepository for the same
 * cycle-avoidance reason: both the teacher-facing join endpoint
 * (AcademiesModule) and the academy-owner accept/reject endpoints
 * (AcademyOwnerModule) need it.
 */
@Injectable()
export class AcademyMembershipRequestsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findPending(academyId: string, tutorId: string) {
    return this.db
      .selectFrom('academy_membership_requests')
      .selectAll()
      .where('academy_id', '=', academyId)
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_membership_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(academyId: string, tutorId: string, message: string | null) {
    return this.db
      .insertInto('academy_membership_requests')
      .values({
        id: newId(),
        academy_id: academyId,
        tutor_id: tutorId,
        message,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Academy Dashboard > Teachers > Pending — joined to the SAME
   *  profiles_tutor row Find a Teacher / Teacher Profile use, so the
   *  academy can preview the teacher before deciding. */
  listPendingForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_membership_requests')
      .innerJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'academy_membership_requests.tutor_id',
      )
      .select([
        'academy_membership_requests.id',
        'academy_membership_requests.tutor_id',
        'academy_membership_requests.message',
        'academy_membership_requests.created_at',
        'profiles_tutor.display_name',
        'profiles_tutor.slug as tutor_slug',
        'profiles_tutor.headline',
        'profiles_tutor.avatar_object_key',
        'profiles_tutor.years_experience',
        'profiles_tutor.verification_status',
      ])
      .where('academy_membership_requests.academy_id', '=', academyId)
      .where('academy_membership_requests.status', '=', 'pending')
      .orderBy('academy_membership_requests.created_at')
      .execute();
  }

  /** A tutor's own requests, all statuses — backs the "pending"/
   *  "declined" states on the Teaching Arrangement section and the
   *  tutor-side find-an-academy "Request to Join" button. */
  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('academy_membership_requests')
      .innerJoin(
        'academies',
        'academies.id',
        'academy_membership_requests.academy_id',
      )
      .select([
        'academy_membership_requests.id',
        'academy_membership_requests.status',
        'academy_membership_requests.message',
        'academy_membership_requests.created_at',
        'academy_membership_requests.decided_at',
        'academies.id as academy_id',
        'academies.name as academy_name',
        'academies.slug as academy_slug',
      ])
      .where('academy_membership_requests.tutor_id', '=', tutorId)
      .orderBy('academy_membership_requests.created_at', 'desc')
      .execute();
  }

  markAccepted(id: string) {
    return this.db
      .updateTable('academy_membership_requests')
      .set({ status: 'accepted', decided_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markRejected(id: string) {
    return this.db
      .updateTable('academy_membership_requests')
      .set({ status: 'rejected', decided_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
