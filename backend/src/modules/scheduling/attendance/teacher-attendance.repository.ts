import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export type TeacherAttendanceStatus = 'present' | 'absent';

/**
 * Teacher Attendance — deliberately separate from AttendanceRepository
 * (student attendance) above it in this same folder. Only ever stores
 * `present`/`absent`; Approved Leave/Holiday/Cancelled are derived by the
 * caller from class_sessions, never written here. See migration 0038's
 * doc comment.
 */
@Injectable()
export class TeacherAttendanceRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  upsert(
    sessionId: string,
    tutorId: string,
    status: TeacherAttendanceStatus,
    markedBy: string,
  ) {
    return this.db
      .insertInto('teacher_attendance')
      .values({
        id: newId(),
        session_id: sessionId,
        tutor_id: tutorId,
        status,
        marked_by: markedBy,
      })
      .onConflict((oc) =>
        oc.column('session_id').doUpdateSet({
          tutor_id: tutorId,
          status,
          marked_by: markedBy,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findBySessionId(sessionId: string) {
    return this.db
      .selectFrom('teacher_attendance')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
  }

  /** Bulk sibling of findBySessionId — the Academy Dashboard's summary/
   *  table/detail views all need attendance for many sessions at once. */
  findBySessionIds(sessionIds: string[]) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('teacher_attendance')
      .selectAll()
      .where('session_id', 'in', sessionIds)
      .execute();
  }
}
