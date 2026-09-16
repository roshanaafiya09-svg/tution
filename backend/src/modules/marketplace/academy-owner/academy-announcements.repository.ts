import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { AcademyAnnouncementAudience, DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewAcademyAnnouncement {
  academyId: string;
  createdBy: string;
  title: string;
  body: string;
  audienceType: AcademyAnnouncementAudience;
  audienceBatchId: string | null;
  audienceTeacherId: string | null;
  audienceStudentId: string | null;
}

export interface UpdateAcademyAnnouncement {
  title?: string;
  body?: string;
  audienceType?: AcademyAnnouncementAudience;
  audienceBatchId?: string | null;
  audienceTeacherId?: string | null;
  audienceStudentId?: string | null;
}

/**
 * Owns `academy_announcements` (migration 0037). Every academy has
 * exactly one owner/admin account (1:1 `academies.owner_user_id`), so
 * `created_by` never needs a display-name join the way
 * TeacherLeaveRepository.listForAcademyWithTutor needs one for
 * `tutor_id` — the frontend just labels it with the academy's own name.
 *
 * No query-parameter filtering here, matching
 * AcademyContactRequestsRepository.listForAcademy exactly: this is a
 * bounded per-academy dataset (an academy's own authored announcements),
 * so status/audience/search/date filtering happens client-side over one
 * full fetch, the same convention Contact Requests already uses — not
 * every list needs Attendance's server-side date-range treatment, that
 * one exists because a session table grows without bound over time.
 */
@Injectable()
export class AcademyAnnouncementsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewAcademyAnnouncement) {
    return this.db
      .insertInto('academy_announcements')
      .values({
        id: newId(),
        academy_id: input.academyId,
        created_by: input.createdBy,
        title: input.title,
        body: input.body,
        audience_type: input.audienceType,
        audience_batch_id: input.audienceBatchId,
        audience_teacher_id: input.audienceTeacherId,
        audience_student_id: input.audienceStudentId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_announcements')
      .selectAll()
      .where('academy_id', '=', academyId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Unscoped lookup — used only by AnnouncementRecipientService, where
   *  the caller isn't an academy owner and has no academyId to scope by.
   *  Authorization there comes from a different source entirely (proof
   *  of having actually received a notification about this id), not
   *  from this query, so it deliberately doesn't take one. */
  findById(id: string) {
    return this.db
      .selectFrom('academy_announcements')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Ownership lookup for read/update/publish/archive/delete — mirrors
   *  TeacherLeaveRepository.findForAcademy exactly. */
  findForAcademy(id: string, academyId: string) {
    return this.db
      .selectFrom('academy_announcements')
      .selectAll()
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .executeTakeFirst();
  }

  /** Draft-only — service already checked status, but the WHERE clause
   *  repeats it so an update can never silently touch a published row. */
  update(id: string, academyId: string, patch: UpdateAcademyAnnouncement) {
    return this.db
      .updateTable('academy_announcements')
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.body !== undefined && { body: patch.body }),
        ...(patch.audienceType !== undefined && {
          audience_type: patch.audienceType,
        }),
        ...(patch.audienceBatchId !== undefined && {
          audience_batch_id: patch.audienceBatchId,
        }),
        ...(patch.audienceTeacherId !== undefined && {
          audience_teacher_id: patch.audienceTeacherId,
        }),
        ...(patch.audienceStudentId !== undefined && {
          audience_student_id: patch.audienceStudentId,
        }),
      })
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .where('status', '=', 'draft')
      .returningAll()
      .executeTakeFirst();
  }

  /** Atomic draft -> published transition, guarded by `where status =
   *  'draft'` on the UPDATE itself rather than a separate read-then-write
   *  status check — two concurrent publish calls on the same draft can
   *  otherwise both pass an application-level check and both fan out a
   *  notification to the whole audience. Returns undefined (not a thrown
   *  error) when no matching draft row exists, so the caller can tell
   *  "already published/archived by someone else" apart from "not
   *  found"/"wrong academy" only via the earlier findForAcademy call. */
  publish(id: string, academyId: string, recipientCount: number) {
    return this.db
      .updateTable('academy_announcements')
      .set({
        status: 'published',
        recipient_count: recipientCount,
        published_at: new Date(),
      })
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .where('status', '=', 'draft')
      .returningAll()
      .executeTakeFirst();
  }

  /** Same atomic-transition guard as publish, published -> archived. */
  archive(id: string, academyId: string) {
    return this.db
      .updateTable('academy_announcements')
      .set({ status: 'archived' })
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .where('status', '=', 'published')
      .returningAll()
      .executeTakeFirst();
  }

  /** Draft-only delete — an abandoned draft otherwise has no way to go
   *  away (there's no delete for published/archived, by design). */
  deleteDraft(id: string, academyId: string) {
    return this.db
      .deleteFrom('academy_announcements')
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .where('status', '=', 'draft')
      .executeTakeFirst();
  }
}
