import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { newId } from '../../database/id';

@Injectable()
export class ParentLinksRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByParentAndStudent(parentId: string, studentId: string) {
    return this.db
      .selectFrom('parent_child_links')
      .selectAll()
      .where('parent_id', '=', parentId)
      .where('student_id', '=', studentId)
      .executeTakeFirst();
  }

  create(parentId: string, studentId: string) {
    return this.db
      .insertInto('parent_child_links')
      .values({ id: newId(), parent_id: parentId, student_id: studentId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('parent_child_links')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  activate(id: string, consentRecordId: string) {
    return this.db
      .updateTable('parent_child_links')
      .set({ status: 'active', consent_record_id: consentRecordId })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForParent(parentId: string) {
    return this.db
      .selectFrom('parent_child_links')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'parent_child_links.student_id',
      )
      .selectAll('parent_child_links')
      .select('profiles_student.display_name as student_display_name')
      .where('parent_id', '=', parentId)
      .execute();
  }

  /** Distinct parents holding an ACTIVE (consented) link to any of the
   *  given students — the audience for "tell the family" notifications.
   *  Pending/revoked links never receive anything. */
  async listActiveParentIdsForStudents(
    studentIds: string[],
  ): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('parent_child_links')
      .select('parent_id')
      .distinct()
      .where('student_id', 'in', studentIds)
      .where('status', '=', 'active')
      .execute();
    return rows.map((r) => r.parent_id);
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('parent_child_links')
      .selectAll()
      .where('student_id', '=', studentId)
      .execute();
  }
}
