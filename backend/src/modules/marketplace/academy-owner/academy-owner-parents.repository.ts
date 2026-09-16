import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

/**
 * Academy-wide Parents directory (Main > Parents) — queries
 * `parent_child_links` + `users` directly rather than going through
 * ParentsModule, the same reasoning AttendanceRepository already documents
 * for its own `listActiveParentIdsForStudent(s)` helpers: there is no
 * `profiles_parent` table, a parent's only identity here is
 * `users.phone_e164`/`email`, and keeping this query local avoids pulling
 * ParentsModule's unrelated invite-token machinery into AcademyOwnerModule.
 */
@Injectable()
export class AcademyOwnerParentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** Active parent links for a set of students, with the parent's contact
   *  info attached — the Students detail page's "linked parent(s)" panel
   *  and the Parents directory's grouping source both read this. */
  listActiveLinksForStudents(studentIds: string[]) {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('parent_child_links')
      .innerJoin('users', 'users.id', 'parent_child_links.parent_id')
      .select([
        'parent_child_links.parent_id',
        'parent_child_links.student_id',
        'users.phone_e164',
        'users.email',
      ])
      .where('parent_child_links.student_id', 'in', studentIds)
      .where('parent_child_links.status', '=', 'active')
      .execute();
  }

  /** Ownership check for the Parent Detail endpoint — does this parent
   *  have at least one active link into this set of (academy-scoped)
   *  student ids? */
  findActiveLinkForParentAndStudents(parentId: string, studentIds: string[]) {
    if (studentIds.length === 0) return Promise.resolve(undefined);
    return this.db
      .selectFrom('parent_child_links')
      .select('id')
      .where('parent_id', '=', parentId)
      .where('student_id', 'in', studentIds)
      .where('status', '=', 'active')
      .executeTakeFirst();
  }

  findParentContact(parentId: string) {
    return this.db
      .selectFrom('users')
      .select(['id', 'phone_e164', 'email'])
      .where('id', '=', parentId)
      .executeTakeFirst();
  }
}
