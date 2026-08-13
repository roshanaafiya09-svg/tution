import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewContactRequest {
  tutorId: string;
  requesterId: string;
  requesterRole: 'student' | 'parent';
  message: string | null;
}

/**
 * "Contact Teacher" leads from Find a Teacher — owned by DiscoveryModule
 * alongside the rest of the public-discovery/tutor-facing surface, not
 * a separate bounded-context module (this table has no concerns beyond
 * what DiscoveryModule already composes). See migration 0029.
 */
@Injectable()
export class ContactRequestsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewContactRequest) {
    return this.db
      .insertInto('teacher_contact_requests')
      .values({
        id: newId(),
        tutor_id: input.tutorId,
        requester_id: input.requesterId,
        requester_role: input.requesterRole,
        message: input.message,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('teacher_contact_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Joined to a display label for the requester — students have
   *  profiles_student.display_name; there is no profiles_parent table,
   *  so a parent requester falls back to email/phone in the service. */
  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('teacher_contact_requests')
      .innerJoin('users', 'users.id', 'teacher_contact_requests.requester_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'teacher_contact_requests.requester_id',
      )
      .select([
        'teacher_contact_requests.id',
        'teacher_contact_requests.requester_id',
        'teacher_contact_requests.requester_role',
        'teacher_contact_requests.message',
        'teacher_contact_requests.read_at',
        'teacher_contact_requests.created_at',
        'users.email',
        'users.phone_e164',
        'profiles_student.display_name as student_display_name',
      ])
      .where('teacher_contact_requests.tutor_id', '=', tutorId)
      .orderBy('teacher_contact_requests.created_at', 'desc')
      .execute();
  }

  markRead(id: string) {
    return this.db
      .updateTable('teacher_contact_requests')
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
