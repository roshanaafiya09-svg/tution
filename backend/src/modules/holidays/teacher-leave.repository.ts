import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB, TeacherLeaveRequestsTable } from '../../database/types';
import { newId } from '../../database/id';

export interface NewLeaveRequest {
  tutorId: string;
  academyId: string;
  startDate: string;
  endDate: string;
  leaveType: 'full_day' | 'specific_classes';
  reason: string | null;
}

export interface DecidedLeaveSession {
  id: string;
  batch_id: string;
  scheduled_start_utc: Date;
  timezone: string;
}

export interface LeaveDecisionResult {
  request: Selectable<TeacherLeaveRequestsTable>;
  /** Sessions actually mutated by this decision — always empty for a
   *  rejection, and only ever the eligible subset for an approval (see
   *  `decide`'s doc comment for what "eligible" means). */
  sessions: DecidedLeaveSession[];
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
    return (
      this.db
        .selectFrom('teacher_leave_request_sessions')
        .innerJoin(
          'class_sessions',
          'class_sessions.id',
          'teacher_leave_request_sessions.session_id',
        )
        .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
        .innerJoin(
          'teacher_leave_requests',
          'teacher_leave_requests.id',
          'teacher_leave_request_sessions.leave_request_id',
        )
        // Only classes owned by the request's academy — a snapshot taken
        // before teaching contexts existed may still hold the teacher's
        // Individual classes; they are never shown or actioned.
        .whereRef(
          'batches.academy_id',
          '=',
          'teacher_leave_requests.academy_id',
        )
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
        .execute()
    );
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

  /**
   * Atomically claims a pending request (approve/reject) and, for an
   * approval, applies the session-level effect (cancel, or reassign to a
   * substitute) to exactly its own eligible sessions — all inside one
   * database transaction. Returns `undefined` if the request was no
   * longer pending when this ran (already decided by someone else, or —
   * see AcademyMembershipsRepository.markLeft — auto-invalidated because
   * the teacher left the academy in the meantime).
   *
   * This single transaction is what makes the decision both:
   *  - concurrency-safe: the `WHERE status = 'pending'` guard on the
   *    claim UPDATE means Postgres row-locking serializes two racing
   *    decisions — only one can ever match, the other gets zero rows
   *    back and applies no session mutation at all;
   *  - crash-safe: a failure partway through the per-session loop rolls
   *    back the WHOLE transaction, including the claim itself, instead
   *    of leaving some sessions cancelled while the request already
   *    reads 'approved' (there is no query outside this transaction that
   *    could commit half of this decision).
   *
   * Session eligibility is re-verified here, at decision time, against
   * the CURRENT database state — never the original create-time
   * snapshot:
   *   - batches.academy_id = academyId (never another academy's, and
   *     never the teacher's Individual classes even if an old snapshot
   *     predating teaching contexts still lists one)
   *   - class_sessions.tutor_id = the request's own tutor (never another
   *     teacher's — defensive, since tutor_id is never mutated after a
   *     session is created)
   *   - class_sessions.status = 'scheduled' (never a class that already
   *     completed, or that something else already cancelled, in the gap
   *     between requesting leave and this decision)
   */
  decide(
    id: string,
    academyId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    substituteTutorId: string | null,
  ): Promise<LeaveDecisionResult | undefined> {
    return this.db.transaction().execute(async (trx) => {
      const request = await trx
        .updateTable('teacher_leave_requests')
        .set({
          status: decision,
          decided_by: decidedBy,
          decided_at: new Date(),
        })
        .where('id', '=', id)
        .where('academy_id', '=', academyId)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirst();
      if (!request) return undefined;
      if (decision !== 'approved') return { request, sessions: [] };

      const snapshot = await trx
        .selectFrom('teacher_leave_request_sessions')
        .select('session_id')
        .where('leave_request_id', '=', id)
        .execute();
      const sessionIds = snapshot.map((r) => r.session_id);
      if (sessionIds.length === 0) return { request, sessions: [] };

      const eligible = await trx
        .selectFrom('class_sessions')
        .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
        .select([
          'class_sessions.id',
          'class_sessions.batch_id',
          'class_sessions.scheduled_start_utc',
          'class_sessions.timezone',
        ])
        .where('class_sessions.id', 'in', sessionIds)
        .where('batches.academy_id', '=', academyId)
        .where('class_sessions.tutor_id', '=', request.tutor_id)
        .where('class_sessions.status', '=', 'scheduled')
        .execute();

      for (const session of eligible) {
        if (substituteTutorId) {
          await trx
            .updateTable('class_sessions')
            .set({
              status: 'scheduled',
              cancellation_reason: null,
              substitute_tutor_id: substituteTutorId,
              teacher_leave_request_id: id,
            })
            .where('id', '=', session.id)
            .execute();
        } else {
          await trx
            .updateTable('class_sessions')
            .set({
              status: 'cancelled',
              cancellation_reason: 'teacher_leave',
              teacher_leave_request_id: id,
            })
            .where('id', '=', session.id)
            .execute();
        }
      }

      return { request, sessions: eligible };
    });
  }
}
