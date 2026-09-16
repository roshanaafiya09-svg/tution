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

  listForTutorBetween(tutorId: string, from: Date, to: Date) {
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
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  /** Multi-tutor sibling of listForTutorBetween — the Academy Dashboard's
   *  "classes today"/"upcoming classes" span every active member tutor,
   *  not just one. Also selects tutor_id (the single-tutor version
   *  doesn't need it) so the UI can attribute each session to its
   *  teacher. */
  listForTutorsBetween(tutorIds: string[], from: Date, to: Date) {
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
      .where(
        'class_sessions.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
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

  /** Feeds the trial-end value-recap paywall (blueprint §5). */
  async countCompletedForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'completed')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Total minutes of completed class time — the "verified hours" input
   *  to the Proof-of-Teaching score (blueprint §10 Phase 4). */
  async sumCompletedMinutesForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.sum('duration_min').as('total'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'completed')
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

  updateStatus(id: string, status: 'scheduled' | 'completed' | 'cancelled') {
    return this.db
      .updateTable('class_sessions')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
  }

  /** Every `scheduled` session for a set of tutors within [from, to] —
   *  the candidate pool for both a teacher-leave request (tutorIds has
   *  one id) and a holiday's cancellation sweep (tutorIds spans an
   *  academy's active member teachers). Holiday & Teacher Leave feature. */
  listScheduledForTutorsBetween(tutorIds: string[], from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where(
        'tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .where('status', '=', 'scheduled')
      .where('scheduled_start_utc', '>=', from)
      .where('scheduled_start_utc', '<=', to)
      .orderBy('scheduled_start_utc')
      .execute();
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

  /** Grouped count of cancelled sessions per holiday, scoped to a set of
   *  tutors — the Academy Dashboard Reports "Holidays" report's
   *  "affected classes" column, in one query instead of looping per
   *  holiday. `holiday_id` was added in migration 0035 specifically so
   *  this kind of attribution never needs a join table. */
  async countByHolidayForTutors(
    tutorIds: string[],
    holidayIds: string[],
  ): Promise<Map<string, number>> {
    if (tutorIds.length === 0 || holidayIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('class_sessions')
      .select((eb) => ['holiday_id', eb.fn.countAll().as('count')])
      .where('tutor_id', 'in', tutorIds)
      .where('holiday_id', 'in', holidayIds)
      .groupBy('holiday_id')
      .execute();
    return new Map(
      rows
        .filter((r) => r.holiday_id !== null)
        .map((r) => [r.holiday_id as string, Number(r.count)]),
    );
  }

  /** Sibling of countByHolidayForTutors, grouped by
   *  teacher_leave_request_id instead — the Reports "Leave" report's
   *  "classes affected" column. */
  async countByLeaveRequestForTutors(
    tutorIds: string[],
    leaveRequestIds: string[],
  ): Promise<Map<string, number>> {
    if (tutorIds.length === 0 || leaveRequestIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('class_sessions')
      .select((eb) => [
        'teacher_leave_request_id',
        eb.fn.countAll().as('count'),
      ])
      .where('tutor_id', 'in', tutorIds)
      .where('teacher_leave_request_id', 'in', leaveRequestIds)
      .groupBy('teacher_leave_request_id')
      .execute();
    return new Map(
      rows
        .filter((r) => r.teacher_leave_request_id !== null)
        .map((r) => [r.teacher_leave_request_id as string, Number(r.count)]),
    );
  }

  /** Cancels the whole series (the parent and everything pointing at it) —
   *  same 'manual' reason-tagging as setHolidayOrLeaveCancellation above,
   *  for the same cancelled-class-reminder reason. */
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
      .execute();
  }
}
