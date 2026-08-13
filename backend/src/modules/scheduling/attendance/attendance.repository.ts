import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export type AttendanceStatus = 'present' | 'absent' | 'late';

@Injectable()
export class AttendanceRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listForSession(sessionId: string) {
    return this.db
      .selectFrom('attendance')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'attendance.student_id',
      )
      .select([
        'attendance.id',
        'attendance.student_id',
        'attendance.status',
        'attendance.joined_at',
        'attendance.method',
        'profiles_student.display_name',
      ])
      .where('attendance.session_id', '=', sessionId)
      .execute();
  }

  /** Every attendance record for a student, across all batches — feeds data export. */
  listForStudent(studentId: string) {
    return this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select([
        'attendance.id',
        'attendance.session_id',
        'attendance.status',
        'attendance.joined_at',
        'attendance.method',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
      ])
      .where('attendance.student_id', '=', studentId)
      .orderBy('class_sessions.scheduled_start_utc', 'desc')
      .execute();
  }

  upsert(
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
    method: 'join_tap' | 'manual',
    markedBy: string | null,
    joinedAt: Date | null,
  ) {
    return this.db
      .insertInto('attendance')
      .values({
        id: newId(),
        session_id: sessionId,
        student_id: studentId,
        status,
        method,
        marked_by: markedBy,
        joined_at: joinedAt,
      })
      .onConflict((oc) =>
        oc.columns(['session_id', 'student_id']).doUpdateSet({
          status,
          method,
          marked_by: markedBy,
          joined_at: joinedAt,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Feeds the trial-end value-recap paywall (blueprint §5). */
  async countForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('class_sessions.tutor_id', '=', tutorId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Attendance across every batch for a student within [from, to) —
   *  feeds the AI weekly parent digest (blueprint §8). */
  async summaryForStudentBetween(studentId: string, from: Date, to: Date) {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => [
        eb.fn.countAll().as('total'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'present')
              .then(1)
              .else(0)
              .end(),
          )
          .as('present'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'late')
              .then(1)
              .else(0)
              .end(),
          )
          .as('late'),
      ])
      .where('attendance.student_id', '=', studentId)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .executeTakeFirstOrThrow();

    const total = Number(row.total);
    const present = Number(row.present ?? 0);
    const late = Number(row.late ?? 0);

    return {
      total,
      present,
      late,
      absent: total - present - late,
      rate: total === 0 ? null : Math.round(((present + late) / total) * 100),
    };
  }

  /** Whether this student was ever actually present (or late) in one of
   *  this tutor's classes — the "verified session" gate for reviews
   *  (blueprint §10 Phase 4). Doesn't filter by class_sessions.status:
   *  an attendance row marked present is itself the evidence the class
   *  happened, regardless of whether anyone later flipped the session's
   *  status field. */
  async hasVerifiedAttendanceWithTutor(
    studentId: string,
    tutorId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('attendance.student_id', '=', studentId)
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('attendance.status', 'in', ['present', 'late'])
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Multi-tutor sibling of hasVerifiedAttendanceWithTutor — the
   *  batch-class half of AcademyReviewsService's verified-session gate,
   *  checked against any of an academy's active member tutors rather
   *  than one. Empty-array guard mirrors the pattern used elsewhere for
   *  tutorIds filters (dummy UUID keeps `in (...)` valid). */
  async hasVerifiedAttendanceWithAnyTutor(
    studentId: string,
    tutorIds: string[],
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('attendance.student_id', '=', studentId)
      .where(
        'class_sessions.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .where('attendance.status', 'in', ['present', 'late'])
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Attendance % across every batch a tutor teaches — the "attendance
   *  retention" input to the Proof-of-Teaching score (blueprint §10
   *  Phase 4). Structural copy of summaryForStudent, grouped by tutor
   *  instead of student+batch. */
  async summaryForTutor(tutorId: string) {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => [
        eb.fn.countAll().as('total'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'present')
              .then(1)
              .else(0)
              .end(),
          )
          .as('present'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'late')
              .then(1)
              .else(0)
              .end(),
          )
          .as('late'),
      ])
      .where('class_sessions.tutor_id', '=', tutorId)
      .executeTakeFirstOrThrow();

    const total = Number(row.total);
    const present = Number(row.present ?? 0);
    const late = Number(row.late ?? 0);

    return {
      total,
      present,
      late,
      absent: total - present - late,
      rate: total === 0 ? null : Math.round(((present + late) / total) * 100),
    };
  }

  /** Attendance across every session in a batch, newest first — feeds
   *  the tutor's batch-level attendance history view. */
  listForBatch(batchId: string) {
    return this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'attendance.student_id',
      )
      .select([
        'attendance.id',
        'attendance.session_id',
        'class_sessions.scheduled_start_utc',
        'attendance.student_id',
        'profiles_student.display_name',
        'attendance.status',
        'attendance.method',
      ])
      .where('class_sessions.batch_id', '=', batchId)
      .orderBy('class_sessions.scheduled_start_utc', 'desc')
      .execute();
  }

  /** Absences for one student in one batch since a given date — feeds
   *  the repeated-absence alert check (AttendanceService). */
  async countAbsencesForStudentInBatch(
    studentId: string,
    batchId: string,
    since: Date,
  ): Promise<number> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('attendance.student_id', '=', studentId)
      .where('class_sessions.batch_id', '=', batchId)
      .where('attendance.status', '=', 'absent')
      .where('class_sessions.scheduled_start_utc', '>=', since)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /**
   * Whether `parentId` has an active consent link to `studentId` — the
   * same gate ProgressService's parent-facing route uses (there via
   * ParentLinksRepository). Queried directly here instead of injecting
   * ParentsModule: ParentsModule -> TrustModule -> DeliveryModule ->
   * SchedulingModule would close a circular module import, and this
   * repository already reaches across table boundaries the same way
   * (e.g. the profiles_student join above) rather than pulling in
   * another module's repository class just for one WHERE clause.
   */
  async hasActiveParentLink(
    parentId: string,
    studentId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('parent_child_links')
      .select('id')
      .where('parent_id', '=', parentId)
      .where('student_id', '=', studentId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Active parents linked to a student — feeds the repeated-absence
   *  alert's recipient list. Same rationale as hasActiveParentLink
   *  above for querying parent_child_links directly. */
  async listActiveParentIdsForStudent(studentId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('parent_child_links')
      .select('parent_id')
      .where('student_id', '=', studentId)
      .where('status', '=', 'active')
      .execute();
    return rows.map((r) => r.parent_id);
  }

  /** Attendance % and counts for a student in one batch — feeds the student progress view. */
  async summaryForStudent(studentId: string, batchId: string) {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .select((eb) => [
        eb.fn.countAll().as('total'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'present')
              .then(1)
              .else(0)
              .end(),
          )
          .as('present'),
        eb.fn
          .sum(
            eb
              .case()
              .when('attendance.status', '=', 'late')
              .then(1)
              .else(0)
              .end(),
          )
          .as('late'),
      ])
      .where('attendance.student_id', '=', studentId)
      .where('class_sessions.batch_id', '=', batchId)
      .executeTakeFirstOrThrow();

    const total = Number(row.total);
    const present = Number(row.present ?? 0);
    const late = Number(row.late ?? 0);

    return {
      total,
      present,
      late,
      absent: total - present - late,
      // "Attended" counts late arrivals — a late student was still in class.
      attendanceRate:
        total === 0 ? null : Math.round(((present + late) / total) * 100),
    };
  }
}
