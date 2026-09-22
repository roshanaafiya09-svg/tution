import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export type AttendanceStatus = 'present' | 'absent' | 'late';

@Injectable()
export class AttendanceRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /**
   * The attendance roster for one session — every student ACTIVELY
   * ENROLLED in the session's batch, left-joined to whatever attendance
   * row exists for this specific session (there may be none yet). This is
   * the fix for C4: the list must be built from the expected roster, not
   * from "students who happen to have an attendance row" — a student who
   * never tapped Join (or an offline class where nobody taps anything)
   * must still appear, with status `null` meaning Unmarked rather than
   * being silently dropped or treated as absent.
   */
  listForSession(sessionId: string, batchId: string) {
    return this.db
      .selectFrom('enrollments')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'enrollments.student_id',
      )
      .leftJoin('attendance', (join) =>
        join
          .onRef('attendance.student_id', '=', 'enrollments.student_id')
          .on('attendance.session_id', '=', sessionId),
      )
      .select([
        'enrollments.student_id',
        'attendance.id',
        'attendance.status',
        'attendance.joined_at',
        'attendance.method',
        'profiles_student.display_name',
      ])
      .where('enrollments.batch_id', '=', batchId)
      .where('enrollments.status', '=', 'active')
      .orderBy('profiles_student.display_name')
      .execute();
  }

  /** Every attendance record for a student, across all batches — feeds
   *  data export and the student's/parent's own views. Pass `academyId`
   *  to narrow to classes that academy owns (batches.academy_id): the
   *  Academy side must never see the student's attendance in a teacher's
   *  Individual batch or another academy's. */
  listForStudent(studentId: string, academyId?: string) {
    let query = this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select([
        'attendance.id',
        'attendance.session_id',
        'attendance.status',
        'attendance.joined_at',
        'attendance.method',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
      ])
      .where('attendance.student_id', '=', studentId);
    if (academyId) query = query.where('batches.academy_id', '=', academyId);
    return query
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

  /** Feeds the trial-end value-recap paywall (blueprint §5). The paywall
   *  is about the teacher's own Individual plan, so this counts only
   *  Individual-context classes — Academy classes are paid for by (and
   *  belong to) the academy. */
  async countForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Attendance across every batch for a student within [from, to) —
   *  feeds the AI weekly parent digest (blueprint §8). */
  async summaryForStudentBetween(
    studentId: string,
    from: Date,
    to: Date,
    academyId?: string,
  ) {
    let query = this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
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
      .where('class_sessions.scheduled_start_utc', '<', to);
    if (academyId) query = query.where('batches.academy_id', '=', academyId);
    const row = await query.executeTakeFirstOrThrow();

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
   *  this tutor's INDIVIDUAL classes — the "verified session" gate for
   *  reviews of the tutor as an independent teacher (attending an Academy
   *  class doesn't entitle a student to review the teacher's own
   *  business; that is what the academy review is for)
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
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('attendance.student_id', '=', studentId)
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .where('attendance.status', 'in', ['present', 'late'])
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Academy sibling of hasVerifiedAttendanceWithTutor — the verified-
   *  session gate for reviewing an ACADEMY: the student must have actually
   *  attended a class in a batch the academy owns (batches.academy_id).
   *  Attending a member teacher's Individual class doesn't count. */
  async hasVerifiedAttendanceInAcademy(
    studentId: string,
    academyId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('attendance.student_id', '=', studentId)
      .where('batches.academy_id', '=', academyId)
      .where('attendance.status', 'in', ['present', 'late'])
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Attendance % across every INDIVIDUAL batch a tutor teaches — the
   *  "attendance retention" input to the Proof-of-Teaching score
   *  (blueprint §10 Phase 4), i.e. their own marketplace reputation. Structural copy of summaryForStudent, grouped by tutor
   *  instead of student+batch. */
  async summaryForTutor(tutorId: string) {
    const row = await this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
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
      .where('batches.academy_id', 'is', null)
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

  /** Bulk sibling of listForBatch — attendance across every session in a
   *  set of batches, newest first, in one grouped query. Backs the
   *  Teacher Dashboard roster load (previously one /attendance/batch/:id/
   *  history call per batch). */
  listForBatches(batchIds: string[]) {
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
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'attendance.student_id',
        'profiles_student.display_name',
        'attendance.status',
        'attendance.method',
      ])
      .where(
        'class_sessions.batch_id',
        'in',
        batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000'],
      )
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

  /** Reverse of listActiveParentIdsForStudent — a parent's own actively-
   *  linked children. Holiday & Teacher Leave feature's parent-facing
   *  "which academies are relevant to me" resolution. */
  async listActiveChildIdsForParent(parentId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('parent_child_links')
      .select('student_id')
      .where('parent_id', '=', parentId)
      .where('status', '=', 'active')
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Bulk sibling of listActiveParentIdsForStudent — the Holiday &
   *  Teacher Leave feature resolves an affected class's whole roster in
   *  one shot rather than one query per student. */
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

  /** Bulk sibling of summaryForStudentBetween — the Academy Dashboard
   *  Reports "Students" report needs one attendance-rate row per student
   *  across a date range; this is the same grouped-aggregate query keyed
   *  by student_id in one round trip instead of looping
   *  summaryForStudentBetween per student. */
  async summaryForStudentsBetween(
    studentIds: string[],
    from: Date,
    to: Date,
    academyId?: string,
  ) {
    if (studentIds.length === 0) return [];
    let query = this.db
      .selectFrom('attendance')
      .innerJoin('class_sessions', 'class_sessions.id', 'attendance.session_id')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => [
        'attendance.student_id',
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
      .where('attendance.student_id', 'in', studentIds)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to);
    if (academyId) query = query.where('batches.academy_id', '=', academyId);
    const rows = await query.groupBy('attendance.student_id').execute();

    return rows.map((row) => {
      const total = Number(row.total);
      const present = Number(row.present ?? 0);
      const late = Number(row.late ?? 0);
      return {
        studentId: row.student_id,
        total,
        present,
        late,
        absent: total - present - late,
        rate: total === 0 ? null : Math.round(((present + late) / total) * 100),
      };
    });
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
