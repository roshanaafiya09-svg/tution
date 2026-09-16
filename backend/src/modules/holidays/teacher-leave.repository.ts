import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { newId } from '../../database/id';

export interface NewLeaveRequest {
  tutorId: string;
  academyId: string;
  startDate: string;
  endDate: string;
  leaveType: 'full_day' | 'specific_classes';
  reason: string | null;
}

/** Owns `teacher_leave_requests`/`teacher_leave_request_sessions`
 *  (migration 0035). */
@Injectable()
export class TeacherLeaveRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findById(id: string) {
    return this.db
      .selectFrom('teacher_leave_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(input: NewLeaveRequest) {
    return this.db
      .insertInto('teacher_leave_requests')
      .values({
        id: newId(),
        tutor_id: input.tutorId,
        academy_id: input.academyId,
        start_date: input.startDate,
        end_date: input.endDate,
        leave_type: input.leaveType,
        reason: input.reason,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  snapshotSessions(leaveRequestId: string, sessionIds: string[]) {
    if (sessionIds.length === 0) return Promise.resolve(undefined);
    return this.db
      .insertInto('teacher_leave_request_sessions')
      .values(
        sessionIds.map((sessionId) => ({
          id: newId(),
          leave_request_id: leaveRequestId,
          session_id: sessionId,
        })),
      )
      .execute()
      .then(() => undefined);
  }

  async listSessionIdsForRequest(leaveRequestId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('teacher_leave_request_sessions')
      .select('session_id')
      .where('leave_request_id', '=', leaveRequestId)
      .execute();
    return rows.map((r) => r.session_id);
  }

  /** Detail view for both the teacher's own list and the academy admin's
   *  approval screen — the affected classes with batch titles, so
   *  neither side has to hit a second endpoint per request. */
  listSessionsWithBatchForRequest(leaveRequestId: string) {
    return this.db
      .selectFrom('teacher_leave_request_sessions')
      .innerJoin(
        'class_sessions',
        'class_sessions.id',
        'teacher_leave_request_sessions.session_id',
      )
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select([
        'class_sessions.id as session_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.status',
        'class_sessions.substitute_tutor_id',
        'batches.id as batch_id',
        'batches.title as batch_title',
      ])
      .where(
        'teacher_leave_request_sessions.leave_request_id',
        '=',
        leaveRequestId,
      )
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('teacher_leave_requests')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Academy admin's list — every request regardless of status, newest
   *  first, with the requesting teacher's display name attached. */
  listForAcademyWithTutor(academyId: string) {
    return this.db
      .selectFrom('teacher_leave_requests')
      .leftJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'teacher_leave_requests.tutor_id',
      )
      .selectAll('teacher_leave_requests')
      .select('profiles_tutor.display_name as tutor_display_name')
      .where('teacher_leave_requests.academy_id', '=', academyId)
      .orderBy('teacher_leave_requests.created_at', 'desc')
      .execute();
  }

  /** Ownership lookup for approve/reject/substitute-assign — an academy
   *  can only ever act on its own requests, mirroring
   *  AcademyOwnerBatchesService's resolveMemberBatch pattern. */
  findForAcademy(id: string, academyId: string) {
    return this.db
      .selectFrom('teacher_leave_requests')
      .selectAll()
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .executeTakeFirst();
  }

  /** Atomic pending -> {approved,rejected,cancelled} transition, guarded
   *  by `where status = 'pending'` on the UPDATE itself rather than a
   *  separate read-then-write status check — two concurrent decisions on
   *  the same request (a double-click, or an approve racing a reject)
   *  could otherwise both pass an application-level "is it still
   *  pending" check and both go on to cancel sessions / assign a
   *  substitute / send notifications. Returns undefined (not a thrown
   *  error) when no matching pending row exists, so the caller can tell
   *  "already decided by someone else" apart from "not found"/"wrong
   *  academy" via the earlier findForAcademy/getOwnedForTutor call. */
  setStatus(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    decidedBy: string | null,
  ) {
    return this.db
      .updateTable('teacher_leave_requests')
      .set({ status, decided_by: decidedBy, decided_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
  }
}
