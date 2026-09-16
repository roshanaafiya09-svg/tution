import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { AcademyContactRequestStatus, DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewAcademyContactRequest {
  academyId: string;
  requesterId: string;
  requesterRole: 'student' | 'parent';
  message: string | null;
}

/**
 * "Contact Academy" leads from Find an Academy — mirrors
 * ContactRequestsRepository (teacher_contact_requests). Surfaced to
 * superadmin via AcademyAdminController, and (since the Academy
 * Dashboard owner role shipped) to the owning academy admin via
 * AcademyOwnerService/AcademyOwnerController — AcademiesService.
 * contactAcademy also notifies the owner when one exists.
 */
@Injectable()
export class AcademyContactRequestsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewAcademyContactRequest) {
    return this.db
      .insertInto('academy_contact_requests')
      .values({
        id: newId(),
        academy_id: input.academyId,
        requester_id: input.requesterId,
        requester_role: input.requesterRole,
        message: input.message,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_contact_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_contact_requests')
      .innerJoin('users', 'users.id', 'academy_contact_requests.requester_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'academy_contact_requests.requester_id',
      )
      .select([
        'academy_contact_requests.id',
        'academy_contact_requests.requester_id',
        'academy_contact_requests.requester_role',
        'academy_contact_requests.message',
        'academy_contact_requests.read_at',
        'academy_contact_requests.status',
        'academy_contact_requests.created_at',
        'users.email',
        'users.phone_e164',
        'profiles_student.display_name as student_display_name',
      ])
      .where('academy_contact_requests.academy_id', '=', academyId)
      .orderBy('academy_contact_requests.created_at', 'desc')
      .execute();
  }

  markRead(id: string) {
    return this.db
      .updateTable('academy_contact_requests')
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateStatus(id: string, status: AcademyContactRequestStatus) {
    return this.db
      .updateTable('academy_contact_requests')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
