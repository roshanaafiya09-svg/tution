import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewSession {
  batchId: string;
  tutorId: string;
  scheduledStartUtc: Date;
  timezone: string;
  durationMin: number;
  meetingUrl: string | null;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
}

@Injectable()
export class SessionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findById(id: string) {
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Inserts a whole recurrence series in one transaction. */
  async createSeries(sessions: NewSession[]) {
    const rows = sessions.map((s) => ({
      id: newId(),
      batch_id: s.batchId,
      tutor_id: s.tutorId,
      scheduled_start_utc: s.scheduledStartUtc,
      timezone: s.timezone,
      duration_min: s.durationMin,
      meeting_url: s.meetingUrl,
      recurrence_rule: s.recurrenceRule,
      recurrence_parent_id: s.recurrenceParentId,
    }));

    // The first row is the series parent; the rest point back at it.
    const [first, ...rest] = rows;
    return this.db.transaction().execute(async (trx) => {
      const parent = await trx
        .insertInto('class_sessions')
        .values(first)
        .returningAll()
        .executeTakeFirstOrThrow();

      if (rest.length > 0) {
        await trx
          .insertInto('class_sessions')
          .values(rest.map((r) => ({ ...r, recurrence_parent_id: parent.id })))
          .execute();
      }

      return parent;
    });
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('scheduled_start_utc')
      .execute();
  }

  /** A tutor's classes in ONE teaching context (null = Individual, an id
   *  = that academy's). The context comes from the session's batch, so a
   *  teacher's Individual 7 PM class never shows up in (or is affected by)
   *  the Academy profile's schedule and vice versa. */
  listForTutorBetween(
    tutorId: string,
    academyId: string | null,
    from: Date,
    to: Date,
  ) {
    let query = this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .leftJoin(
        'profiles_tutor as substitute_profile',
        'substitute_profile.user_id',
        'class_sessions.substitute_tutor_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'class_sessions.cancellation_reason',
        'class_sessions.substitute_tutor_id',
        'substitute_profile.display_name as substitute_display_name',
        'batches.title as batch_title',
      ])
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to);
    query =
      academyId === null
        ? query.where('batches.academy_id', 'is', null)
        : query.where('batches.academy_id', '=', academyId);
    return query.orderBy('class_sessions.scheduled_start_utc').execute();
  }

  /** The academy's own classes — sessions of batches the academy OWNS
   *  (batches.academy_id), whichever teacher runs them and whether or not
   *  that teacher is still a member. Never derived from "tutor_id in
   *  active members", so a member's Individual classes can't appear here.
   *  tutorIds optionally narrows to specific teachers within the academy.
   *  Also selects tutor_id so the UI can attribute each session to its
   *  teacher. */
  listForAcademyBetween(
    academyId: string,
    from: Date,
    to: Date,
    tutorIds?: string[],
  ) {
    let query = this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .leftJoin(
        'profiles_tutor as substitute_profile',
        'substitute_profile.user_id',
        'class_sessions.substitute_tutor_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.tutor_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'class_sessions.cancellation_reason',
        'class_sessions.substitute_tutor_id',
        'substitute_profile.display_name as substitute_display_name',
        'batches.title as batch_title',
        'batches.subject_id',
      ])
      .where('batches.academy_id', '=', academyId)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to);
    if (tutorIds !== undefined) {
      // An explicit (even empty) list narrows to exactly those teachers.
      query = query.where(
        'class_sessions.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      );
    }
    return query.orderBy('class_sessions.scheduled_start_utc').execute();
  }

  /** Session lookup that only matches a class owned by this academy (via
   *  its batch's context) — the Academy side's ID guard for cancel/attend/
   *  view. An Individual class, or another academy's, is simply not found. */
  findByIdInAcademy(id: string, academyId: string) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .selectAll('class_sessions')
      .where('class_sessions.id', '=', id)
      .where('batches.academy_id', '=', academyId)
      .executeTakeFirst();
  }

  /** Upcoming sessions across every batch a student is enrolled in. */
  listForStudentBetween(studentId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .innerJoin(
        'enrollments',
        'enrollments.batch_id',
        'class_sessions.batch_id',
      )
      .leftJoin(
        'profiles_tutor as substitute_profile',
        'substitute_profile.user_id',
        'class_sessions.substitute_tutor_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'class_sessions.cancellation_reason',
        'class_sessions.substitute_tutor_id',
        'substitute_profile.display_name as substitute_display_name',
        'batches.title as batch_title',
      ])
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  /** Same active-consent-link gate AttendanceRepository.hasActiveParentLink
   *  uses for its parent-facing routes — queried directly against
   *  parent_child_links rather than via ParentLinksRepository, since
   *  SchedulingModule can't import ParentsModule without closing the
   *  cycle documented in scheduling.module.ts. */
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

  /** Parent-facing sibling of listForStudentBetween — additionally
   *  surfaces the tutor's display name, since a parent (unlike the
   *  student, who has /batches/enrolled for that) has no other route to
   *  it. */
  listForStudentBetweenWithTutor(studentId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .innerJoin(
        'enrollments',
        'enrollments.batch_id',
        'class_sessions.batch_id',
      )
      .leftJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'class_sessions.tutor_id',
      )
      .leftJoin(
        'profiles_tutor as substitute_profile',
        'substitute_profile.user_id',
        'class_sessions.substitute_tutor_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'class_sessions.cancellation_reason',
        'class_sessions.substitute_tutor_id',
        'substitute_profile.display_name as substitute_display_name',
        'batches.title as batch_title',
        'profiles_tutor.display_name as tutor_display_name',
      ])
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  /** Feeds the trial-end value-recap paywall (blueprint §5) — the
   *  teacher's own Individual plan, so only Individual-context classes
   *  count. */
  async countCompletedForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .where('class_sessions.status', '=', 'completed')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Total minutes of completed INDIVIDUAL class time — the "verified
   *  hours" input to the Proof-of-Teaching score (blueprint §10 Phase 4),
   *  i.e. the tutor's own marketplace reputation. */
  async sumCompletedMinutesForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => eb.fn.sum('class_sessions.duration_min').as('total'))
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .where('class_sessions.status', '=', 'completed')
      .executeTakeFirstOrThrow();
    return Number(row.total ?? 0);
  }

  /** Any scheduled batch class for this tutor overlapping [start, end) —
   *  lets 1:1 booking creation (blueprint §10 Phase 4) avoid
   *  double-booking a tutor across the two scheduling systems. */
  async hasScheduledOverlapForTutor(
    tutorId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'scheduled')
      .where('scheduled_start_utc', '<', end)
      .where(
        sql<boolean>`scheduled_start_utc + (duration_min * interval '1 minute') > ${start}`,
      )
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Sibling of hasScheduledOverlapForTutor, scoped to a batch instead of a
   *  tutor — a batch shouldn't have two scheduled classes at once even if
   *  (hypothetically) two different tutors tried to book it. Backs the
   *  create-session conflict check (SessionsService.create). */
  async hasScheduledOverlapForBatch(
    batchId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('batch_id', '=', batchId)
      .where('status', '=', 'scheduled')
      .where('scheduled_start_utc', '<', end)
      .where(
        sql<boolean>`scheduled_start_utc + (duration_min * interval '1 minute') > ${start}`,
      )
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Atomic claim-and-complete: only succeeds while the row is still
   *  'scheduled'. Returns undefined (never throws) if it lost the race —
   *  someone else already completed, cancelled, or is mid-transaction on
   *  this same row — so the caller can tell a genuine state conflict from
   *  a normal write. The `WHERE status = 'scheduled'` guard is what makes
   *  two concurrent requests on the same session resolve to exactly one
   *  winner: Postgres serializes the two UPDATEs via the row lock, and
   *  the loser's WHERE simply no longer matches once the winner commits. */
  completeIfScheduled(id: string) {
    return this.db
      .updateTable('class_sessions')
      .set({ status: 'completed' })
      .where('id', '=', id)
      .where('status', '=', 'scheduled')
      .returningAll()
      .executeTakeFirst();
  }

  /** Sibling of completeIfScheduled for the cancel path — same atomic
   *  claim-or-lose-the-race guarantee, tagged with *why* like
   *  setHolidayOrLeaveCancellation. */
  cancelIfScheduled(id: string, reason: 'manual') {
    return this.db
      .updateTable('class_sessions')
      .set({ status: 'cancelled', cancellation_reason: reason })
      .where('id', '=', id)
      .where('status', '=', 'scheduled')
      .returningAll()
      .executeTakeFirst();
  }

  findByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
  }

  /** Same as findByIds but only the classes THIS academy owns — an id
   *  that is a teacher's Individual class (or another academy's) is
   *  silently dropped. Used wherever an academy acts on a stored list of
   *  session ids (approve leave, assign a substitute) so a stale or
   *  tampered list can never reach outside the academy's own classes. */
  findByIdsInAcademy(ids: string[], academyId: string) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .selectAll('class_sessions')
      .where('class_sessions.id', 'in', ids)
      .where('batches.academy_id', '=', academyId)
      .execute();
  }

  /** Every `scheduled` session OWNED BY THIS ACADEMY within [from, to] —
   *  the candidate pool for both a teacher-leave request (tutorIds = the
   *  one teacher) and a holiday's cancellation sweep (all of the academy's
   *  classes). Scoped by the batch's academy_id, so a teacher's Individual
   *  classes are never candidates: an academy holiday or leave can't
   *  cancel or reassign them. Holiday & Teacher Leave feature. */
  listScheduledForAcademyBetween(
    academyId: string,
    from: Date,
    to: Date,
    tutorIds?: string[],
  ) {
    let query = this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .selectAll('class_sessions')
      .where('batches.academy_id', '=', academyId)
      .where('class_sessions.status', '=', 'scheduled')
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<=', to);
    if (tutorIds !== undefined) {
      // An explicit (even empty) list narrows to exactly those teachers.
      query = query.where(
        'class_sessions.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      );
    }
    return query.orderBy('class_sessions.scheduled_start_utc').execute();
  }

  /** Every `scheduled` session across ALL tutors starting in a window —
   *  the 10-minute class reminder job's candidate pool (RemindersModule).
   *  Deliberately not tutor-scoped, unlike listScheduledForTutorsBetween:
   *  the reminder sweep runs academy-agnostically across the whole
   *  platform. `status = 'scheduled'` already excludes anything
   *  cancelled (holiday, teacher leave, or manual) — a cancelled class
   *  simply never appears here, which is what suppresses its reminder. */
  listScheduledRemindersBetween(from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .leftJoin(
        'profiles_tutor as substitute_profile',
        'substitute_profile.user_id',
        'class_sessions.substitute_tutor_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.substitute_tutor_id',
        'substitute_profile.display_name as substitute_display_name',
        'batches.title as batch_title',
      ])
      .where('class_sessions.status', '=', 'scheduled')
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .execute();
  }

  /** Every `cancelled` session across ALL tutors whose ORIGINAL scheduled
   *  time falls in a window — the cancelled-class/holiday reminder job's
   *  candidate pool (RemindersModule). Cancelling a session never clears
   *  scheduled_start_utc, so "10 minutes before the class that would
   *  have run" is just this same query with status flipped relative to
   *  listScheduledRemindersBetween. Only rows with a recorded
   *  cancellation_reason qualify — a pre-this-feature cancellation with
   *  no reason on record has nothing to say why. */
  listCancelledRemindersBetween(from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.cancellation_reason',
        'class_sessions.holiday_id',
        'class_sessions.teacher_leave_request_id',
        'batches.title as batch_title',
      ])
      .where('class_sessions.status', '=', 'cancelled')
      .where('class_sessions.cancellation_reason', 'is not', null)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .execute();
  }

  /** Cancels one session and records *why* — a holiday, approved teacher
   *  leave, or (reason: 'manual') the tutor/academy just cancelling it
   *  directly. Setting 'manual' here (rather than leaving
   *  cancellation_reason null, as this method used to for the plain
   *  cancel path) is what lets the cancelled-class reminder job produce
   *  a real "cancelled by the academy" message instead of silently
   *  skipping manually-cancelled classes too. */
  setHolidayOrLeaveCancellation(
    id: string,
    reason:
      'government_holiday' | 'academy_holiday' | 'teacher_leave' | 'manual',
    refs: { holidayId?: string; teacherLeaveRequestId?: string } = {},
  ) {
    return this.db
      .updateTable('class_sessions')
      .set({
        status: 'cancelled',
        cancellation_reason: reason,
        holiday_id: refs.holidayId ?? null,
        teacher_leave_request_id: refs.teacherLeaveRequestId ?? null,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** A substitute keeps the class active (`status` stays 'scheduled')
   *  rather than cancelling it — see ClassSessionsTable.substitute_tutor_id. */
  assignSubstitute(
    id: string,
    substituteTutorId: string,
    teacherLeaveRequestId: string,
  ) {
    return this.db
      .updateTable('class_sessions')
      .set({
        status: 'scheduled',
        cancellation_reason: null,
        substitute_tutor_id: substituteTutorId,
        teacher_leave_request_id: teacherLeaveRequestId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Grouped count of cancelled sessions per holiday, scoped to the
   *  academy's own classes — the Academy Dashboard Reports "Holidays"
   *  report's "affected classes" column, in one query instead of looping
   *  per holiday. `holiday_id` was added in migration 0035 specifically
   *  so this kind of attribution never needs a join table. */
  async countByHolidayForAcademy(
    academyId: string,
    holidayIds: string[],
  ): Promise<Map<string, number>> {
    if (holidayIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => [
        'class_sessions.holiday_id',
        eb.fn.countAll().as('count'),
      ])
      .where('batches.academy_id', '=', academyId)
      .where('class_sessions.holiday_id', 'in', holidayIds)
      .groupBy('class_sessions.holiday_id')
      .execute();
    return new Map(
      rows
        .filter((r) => r.holiday_id !== null)
        .map((r) => [r.holiday_id as string, Number(r.count)]),
    );
  }

  /** Sibling of countByHolidayForAcademy, grouped by
   *  teacher_leave_request_id instead — the Reports "Leave" report's
   *  "classes affected" column. */
  async countByLeaveRequestForAcademy(
    academyId: string,
    leaveRequestIds: string[],
  ): Promise<Map<string, number>> {
    if (leaveRequestIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select((eb) => [
        'class_sessions.teacher_leave_request_id',
        eb.fn.countAll().as('count'),
      ])
      .where('batches.academy_id', '=', academyId)
      .where('class_sessions.teacher_leave_request_id', 'in', leaveRequestIds)
      .groupBy('class_sessions.teacher_leave_request_id')
      .execute();
    return new Map(
      rows
        .filter((r) => r.teacher_leave_request_id !== null)
        .map((r) => [r.teacher_leave_request_id as string, Number(r.count)]),
    );
  }

  /** Cancels the still-scheduled members of a series (the parent and
   *  everything pointing at it) — same 'manual' reason-tagging as
   *  setHolidayOrLeaveCancellation above, for the same cancelled-class-
   *  reminder reason. The `status = 'scheduled'` guard means a sibling
   *  that already completed, or that a previous cancelSeries call already
   *  cancelled, is left untouched — a series cancel can never turn a
   *  COMPLETED occurrence back into CANCELLED, and repeating the call is
   *  a safe no-op on anything it already reached. */
  cancelSeries(parentId: string) {
    return this.db
      .updateTable('class_sessions')
      .set({ status: 'cancelled', cancellation_reason: 'manual' })
      .where((eb) =>
        eb.or([
          eb('id', '=', parentId),
          eb('recurrence_parent_id', '=', parentId),
        ]),
      )
      .where('status', '=', 'scheduled')
      .execute();
  }
}
