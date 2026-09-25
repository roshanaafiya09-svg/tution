import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { CreateBatchDto } from './dto/create-batch.dto';
import type { UpdateBatchDto } from './dto/update-batch.dto';

const NO_ROWS_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Teaching contexts (migration 0040): `batches.academy_id` NULL is the
 * tutor's Individual context, a set value is that academy's context.
 * `tutor_id` is who teaches the batch, never who owns it. Every query
 * below that spans more than one batch is therefore keyed by a context
 * (a tutor's Individual context, or one academy) — never by `tutor_id`
 * alone, and never by "tutor_id IN (this academy's members)".
 */
@Injectable()
export class BatchesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** A tutor's batches IN ONE teaching context: `academyId = null` is
   *  their Individual context, an id is that academy's context. The
   *  context is mandatory on purpose — a bare `tutor_id = ?` filter would
   *  mix Individual and Academy data. */
  listForTutor(tutorId: string, academyId: string | null) {
    let query = this.db
      .selectFrom('batches')
      .selectAll()
      .where('tutor_id', '=', tutorId);
    query =
      academyId === null
        ? query.where('academy_id', 'is', null)
        : query.where('academy_id', '=', academyId);
    return query.orderBy('created_at', 'desc').execute();
  }

  /** Every batch a tutor teaches across ALL contexts. Only for the
   *  account owner's own DPDP data export — never for any feature view. */
  listAllForTutor(tutorId: string) {
    return this.db
      .selectFrom('batches')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('batches')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Batch lookup that only matches inside one academy's context — the
   *  Academy side's ID guard: an id belonging to an Individual batch or to
   *  another academy simply isn't found. */
  findByIdInAcademy(id: string, academyId: string) {
    return this.db
      .selectFrom('batches')
      .selectAll()
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .executeTakeFirst();
  }

  create(tutorId: string, dto: CreateBatchDto, academyId: string | null) {
    return this.db
      .insertInto('batches')
      .values({
        id: newId(),
        tutor_id: tutorId,
        academy_id: academyId,
        title: dto.title,
        subject_id: dto.subjectId,
        grade_level_id: dto.gradeLevelId,
        capacity: dto.capacity,
        fee_minor: dto.feeMinor,
        fee_period: dto.feePeriod ?? 'monthly',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * H11: archiving used to be a bare status flip with no cascade —
   * future sessions stayed 'scheduled' forever (still reminded,
   * still visible as upcoming), and nothing stopped a NEW session being
   * scheduled on an archived batch (that guard lives in
   * SessionsService.create/createForAcademy/createSeries). Now, in the
   * same transaction: flip the batch to 'archived', then atomically
   * cancel every still-`scheduled` future session with reason
   * `batch_archived` — reusing exactly the conditional
   * `UPDATE ... WHERE status = 'scheduled'` pattern
   * SessionsRepository.cancelIfScheduled established for H2, so a
   * session mid-cancel/complete elsewhere resolves the same safe way.
   * The `WHERE status = 'active'` guard on the batch update makes
   * re-archiving an already-archived batch a clean no-op — it returns
   * the current row without re-running the cascade over sessions
   * that are already handled (and cancelling an already-cancelled
   * session is itself a no-op, so this is a belt-and-braces skip, not
   * a correctness requirement).
   */
  archive(id: string) {
    return this.db.transaction().execute(async (trx) => {
      const flipped = await trx
        .updateTable('batches')
        .set({ status: 'archived' })
        .where('id', '=', id)
        .where('status', '=', 'active')
        .returningAll()
        .executeTakeFirst();

      if (flipped) {
        const cancelled = await trx
          .updateTable('class_sessions')
          .set({ status: 'cancelled', cancellation_reason: 'batch_archived' })
          .where('batch_id', '=', id)
          .where('status', '=', 'scheduled')
          .returning('id')
          .execute();
        // The ids let the caller announce exactly these cancellations
        // once the transaction has committed (H4).
        return {
          batch: flipped,
          cancelledSessionIds: cancelled.map((r) => r.id),
        };
      }

      const batch = await trx
        .selectFrom('batches')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return { batch, cancelledSessionIds: [] as string[] };
    });
  }

  update(id: string, dto: UpdateBatchDto) {
    return this.db
      .updateTable('batches')
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subjectId !== undefined && { subject_id: dto.subjectId }),
        ...(dto.gradeLevelId !== undefined && {
          grade_level_id: dto.gradeLevelId,
        }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.feeMinor !== undefined && { fee_minor: dto.feeMinor }),
        ...(dto.feePeriod !== undefined && { fee_period: dto.feePeriod }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Batches a student is actively enrolled in. Left-joins the tutor's
   *  profile purely to surface their display name — additive to the
   *  existing `batches` row shape, doesn't affect listForTutor or any
   *  other caller. Spans both contexts on purpose: a student enrolled in
   *  an Individual batch and an Academy batch sees both (the row carries
   *  `academy_id` so the UI can label them). */
  listForStudent(studentId: string) {
    return this.db
      .selectFrom('batches')
      .innerJoin('enrollments', 'enrollments.batch_id', 'batches.id')
      .leftJoin('profiles_tutor', 'profiles_tutor.user_id', 'batches.tutor_id')
      .selectAll('batches')
      .select('profiles_tutor.display_name as tutor_display_name')
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .orderBy('batches.created_at', 'desc')
      .execute();
  }

  countActiveEnrollments(batchId: string) {
    return this.db
      .selectFrom('enrollments')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('batch_id', '=', batchId)
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.count));
  }

  listEnrollments(batchId: string) {
    return this.db
      .selectFrom('enrollments')
      .innerJoin('users', 'users.id', 'enrollments.student_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'enrollments.student_id',
      )
      .select([
        'enrollments.id',
        'enrollments.student_id',
        'enrollments.status',
        'enrollments.joined_at',
        'users.phone_e164',
        'profiles_student.display_name',
      ])
      .where('enrollments.batch_id', '=', batchId)
      .orderBy('enrollments.joined_at')
      .execute();
  }

  /** Bulk sibling of listEnrollments — every enrollment (active or left)
   *  across a set of batch ids in one grouped query, backing the Teacher
   *  Dashboard's roster load (previously one /batches/:id/students call
   *  per batch) — the roster marks former students as "left" rather than
   *  dropping them. Callers must pass batch ids already scoped to one
   *  context. */
  listEnrollmentsForBatches(batchIds: string[]) {
    return this.db
      .selectFrom('enrollments')
      .innerJoin('users', 'users.id', 'enrollments.student_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'enrollments.student_id',
      )
      .select([
        'enrollments.id',
        'enrollments.batch_id',
        'enrollments.student_id',
        'enrollments.status',
        'enrollments.joined_at',
        'users.phone_e164',
        'profiles_student.display_name',
      ])
      .where(
        'enrollments.batch_id',
        'in',
        batchIds.length ? batchIds : [NO_ROWS_UUID],
      )
      .orderBy('enrollments.joined_at')
      .execute();
  }

  /** Distinct students enrolled (active) across a specific set of
   *  batches — Holiday & Teacher Leave feature's batch-scoped holiday
   *  notification targeting (only those batches' students/parents, not
   *  the whole academy). */
  async listDistinctStudentIdsForBatches(
    batchIds: string[],
  ): Promise<string[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('enrollments')
      .select('student_id')
      .distinct()
      .where('batch_id', 'in', batchIds)
      .where('status', '=', 'active')
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Distinct owning tutors across a set of batches — same batch-scoped
   *  holiday feature, for notifying only the relevant teacher(s). */
  async listDistinctTutorIdsForBatches(batchIds: string[]): Promise<string[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('batches')
      .select('tutor_id')
      .distinct()
      .where('id', 'in', batchIds)
      .execute();
    return rows.map((r) => r.tutor_id);
  }

  /** Every (tutor, context) pair with at least one active batch — the
   *  Assessment weekly compliance reminder's candidate pool. Returned per
   *  context so a teacher who has assessed in one context isn't treated
   *  as compliant in the other. `academy_id` null = Individual. */
  async listActiveTutorContexts(): Promise<
    Array<{ tutor_id: string; academy_id: string | null }>
  > {
    return this.db
      .selectFrom('batches')
      .select(['tutor_id', 'academy_id'])
      .distinct()
      .where('status', '=', 'active')
      .execute();
  }

  findEnrollment(batchId: string, studentId: string) {
    return this.db
      .selectFrom('enrollments')
      .selectAll()
      .where('batch_id', '=', batchId)
      .where('student_id', '=', studentId)
      .executeTakeFirst();
  }

  enroll(batchId: string, studentId: string) {
    return this.db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
      .onConflict((oc) =>
        oc
          .columns(['batch_id', 'student_id'])
          .doUpdateSet({ status: 'active', left_at: null }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  removeEnrollment(batchId: string, studentId: string) {
    return this.db
      .updateTable('enrollments')
      .set({ status: 'left', left_at: new Date() })
      .where('batch_id', '=', batchId)
      .where('student_id', '=', studentId)
      .execute();
  }

  /** Every student ever enrolled in one of this tutor's INDIVIDUAL
   *  batches (active or left — "taught" includes past students, not just
   *  current ones). Used by ProofOfTeachingService's students-taught count
   *  for the tutor's own marketplace profile, so Academy students are
   *  deliberately excluded — they belong to the academy's context. */
  async listDistinctStudentIdsForTutor(tutorId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('enrollments.student_id')
      .distinct()
      .where('batches.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Tutor's currently-open batches with live seats remaining IN ONE
   *  context — a single grouped query, no N+1 (unlike listForTutor + a
   *  per-batch countActiveEnrollments call). `academyId = null` backs the
   *  "Available batches" section of the Teacher Profile and public
   *  discovery profile (Individual only — a tutor's public marketplace
   *  page must never advertise or leak an academy's batches). */
  listOpenWithSeatsForTutor(tutorId: string, academyId: string | null) {
    let query = this.db
      .selectFrom('batches')
      .leftJoin('enrollments', (join) =>
        join
          .onRef('enrollments.batch_id', '=', 'batches.id')
          .on('enrollments.status', '=', 'active'),
      )
      .select((eb) => [
        'batches.id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
        eb.fn.count('enrollments.id').as('enrolled_count'),
      ])
      .where('batches.tutor_id', '=', tutorId)
      .where('batches.status', '=', 'active');
    query =
      academyId === null
        ? query.where('batches.academy_id', 'is', null)
        : query.where('batches.academy_id', '=', academyId);
    return query
      .groupBy([
        'batches.id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
      ])
      .orderBy('batches.created_at', 'desc')
      .execute();
  }

  // --- Academy-context reads --------------------------------------------
  //
  // Everything below is keyed by `batches.academy_id = :academyId` — the
  // batch's own, immutable context — NEVER by "tutor_id IN (active
  // members)". A member teacher's Individual batches, a non-member's
  // batches, and another academy's batches can therefore never appear
  // here, and a teacher who has since left still has their historical
  // Academy batches returned (the academy keeps its history). An optional
  // `tutorIds` narrows to specific teachers *within* the academy (report
  // filters); it can only ever shrink the result.

  /** undefined = no narrowing; an explicit (even empty) list narrows to
   *  exactly those teachers — an empty list matches nothing, it never
   *  silently widens to the whole academy. */
  private tutorFilter(tutorIds?: string[]) {
    if (tutorIds === undefined) return undefined;
    return tutorIds.length > 0 ? tutorIds : [NO_ROWS_UUID];
  }

  /** Every student ever enrolled (active or left) in this academy's own
   *  batches — an academy's students-taught count. */
  async listDistinctStudentIdsForAcademy(academyId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('enrollments.student_id')
      .distinct()
      .where('batches.academy_id', '=', academyId)
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Every batch (any status) the academy owns, with a live enrolled
   *  count — the Academy Dashboard's batch list. Includes archived ones
   *  so an academy admin can see (and re-activate) them. */
  listForAcademy(academyId: string, tutorIds?: string[]) {
    let query = this.db
      .selectFrom('batches')
      .leftJoin('enrollments', (join) =>
        join
          .onRef('enrollments.batch_id', '=', 'batches.id')
          .on('enrollments.status', '=', 'active'),
      )
      .select((eb) => [
        'batches.id',
        'batches.tutor_id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
        'batches.status',
        'batches.created_at',
        eb.fn.count('enrollments.id').as('enrolled_count'),
      ])
      .where('batches.academy_id', '=', academyId);
    const filter = this.tutorFilter(tutorIds);
    if (filter) query = query.where('batches.tutor_id', 'in', filter);
    return query
      .groupBy([
        'batches.id',
        'batches.tutor_id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
        'batches.status',
        'batches.created_at',
      ])
      .orderBy('batches.created_at', 'desc')
      .execute();
  }

  /** Every enrollment across the academy's own batches, joined with the
   *  student's identity, grade, and batch title — backs the Academy
   *  Dashboard's academy-wide Students directory. Omit `status` for every
   *  enrollment (active and left); pass it to narrow to one status. */
  listEnrollmentsForAcademy(
    academyId: string,
    status?: 'active' | 'left',
    tutorIds?: string[],
  ) {
    let query = this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .innerJoin('users', 'users.id', 'enrollments.student_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'enrollments.student_id',
      )
      .select([
        'enrollments.id as enrollment_id',
        'enrollments.student_id',
        'enrollments.status',
        'enrollments.joined_at',
        'batches.id as batch_id',
        'batches.title as batch_title',
        'batches.tutor_id',
        'batches.subject_id',
        'batches.grade_level_id',
        'users.phone_e164',
        'profiles_student.display_name',
        'profiles_student.grade_level',
      ])
      .where('batches.academy_id', '=', academyId);
    const filter = this.tutorFilter(tutorIds);
    if (filter) query = query.where('batches.tutor_id', 'in', filter);
    if (status) query = query.where('enrollments.status', '=', status);
    return query.orderBy('enrollments.joined_at', 'desc').execute();
  }

  /** The academy's currently-open batches with live seats remaining —
   *  backs the public Academy Profile's "Academy batches" section. Also
   *  selects tutor_id so the UI can attribute each batch to the teacher
   *  running it. */
  listOpenWithSeatsForAcademy(
    academyId: string,
    opts: { excludeDeletedTeachers?: boolean } = {},
  ) {
    let query = this.db
      .selectFrom('batches')
      .leftJoin('enrollments', (join) =>
        join
          .onRef('enrollments.batch_id', '=', 'batches.id')
          .on('enrollments.status', '=', 'active'),
      )
      .select((eb) => [
        'batches.id',
        'batches.tutor_id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
        eb.fn.count('enrollments.id').as('enrolled_count'),
      ])
      .where('batches.academy_id', '=', academyId)
      .where('batches.status', '=', 'active');
    if (opts.excludeDeletedTeachers) {
      // H8: the public Academy page must not advertise (and invite
      // students into) a batch whose teacher's account was deleted.
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('users')
            .select('users.id')
            .whereRef('users.id', '=', 'batches.tutor_id')
            .where('users.deleted_at', 'is', null),
        ),
      );
    }
    return query
      .groupBy([
        'batches.id',
        'batches.tutor_id',
        'batches.title',
        'batches.subject_id',
        'batches.grade_level_id',
        'batches.capacity',
        'batches.fee_minor',
        'batches.currency',
        'batches.fee_period',
      ])
      .orderBy('batches.created_at', 'desc')
      .execute();
  }

  /** Subjects (with the grade range) the academy actually teaches —
   *  derived from the academy's OWN batches. Deliberately not from its
   *  members' tutor_subjects: that is each teacher's Individual
   *  marketplace listing (with their own rates) and belongs to their
   *  Individual context. Optional tutorIds narrows to one teacher's
   *  Academy batches. */
  async listSubjectsForAcademy(academyId: string, tutorIds?: string[]) {
    let query = this.db
      .selectFrom('batches')
      .innerJoin('subjects', 'subjects.id', 'batches.subject_id')
      .innerJoin('grade_levels', 'grade_levels.id', 'batches.grade_level_id')
      .select((eb) => [
        'subjects.id as subject_id',
        'subjects.name_i18n as subject_name_i18n',
        eb.fn.min('grade_levels.ordinal').as('grade_min'),
        eb.fn.max('grade_levels.ordinal').as('grade_max'),
      ])
      .where('batches.academy_id', '=', academyId);
    const filter = this.tutorFilter(tutorIds);
    if (filter) query = query.where('batches.tutor_id', 'in', filter);
    const rows = await query
      .groupBy(['subjects.id', 'subjects.name_i18n'])
      .execute();
    return rows.map((r) => ({
      subject_id: r.subject_id,
      subject_name_i18n: r.subject_name_i18n,
      grade_min: Number(r.grade_min),
      grade_max: Number(r.grade_max),
    }));
  }

  /** Distinct academies (ids) whose batches a student is currently
   *  enrolled in — a student's/parent's "which academies' holidays are
   *  relevant to me" resolution. Individual batches contribute nothing. */
  async listAcademyIdsForStudents(studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('batches.academy_id')
      .distinct()
      .where('enrollments.student_id', 'in', studentIds)
      .where('enrollments.status', '=', 'active')
      .where('batches.academy_id', 'is not', null)
      .execute();
    return rows.map((r) => r.academy_id as string);
  }
}
