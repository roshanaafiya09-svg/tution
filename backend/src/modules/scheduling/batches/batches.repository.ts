import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { CreateBatchDto } from './dto/create-batch.dto';
import type { UpdateBatchDto } from './dto/update-batch.dto';

@Injectable()
export class BatchesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listForTutor(tutorId: string) {
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

  create(tutorId: string, dto: CreateBatchDto) {
    return this.db
      .insertInto('batches')
      .values({
        id: newId(),
        tutor_id: tutorId,
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

  archive(id: string) {
    return this.db
      .updateTable('batches')
      .set({ status: 'archived' })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
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
   *  other caller. */
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
   *  per batch). Unlike listEnrollmentsForTutors, this intentionally
   *  includes non-active enrollments — the roster marks former students
   *  as "left" rather than dropping them. */
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
        batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .orderBy('enrollments.joined_at')
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

  /** Every student ever enrolled in one of this tutor's batches (active
   *  or left — "taught" includes past students, not just current ones).
   *  Used by ProofOfTeachingService's students-taught count. */
  async listDistinctStudentIdsForTutor(tutorId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('enrollments.student_id')
      .distinct()
      .where('batches.tutor_id', '=', tutorId)
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Tutor's currently-open batches with live seats remaining — a single
   *  grouped query, no N+1 (unlike listForTutor + a per-batch
   *  countActiveEnrollments call). Backs the "Available batches" section
   *  of the Teacher Profile and public discovery profile. */
  listOpenWithSeatsForTutor(tutorId: string) {
    return this.db
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
      .where('batches.status', '=', 'active')
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

  /** Multi-tutor sibling of listDistinctStudentIdsForTutor — an
   *  academy's students-taught count spans every active member tutor,
   *  not just one. Empty-array guard mirrors
   *  DiscoveryRepository.searchOfferings' tutorIds filter (a dummy UUID
   *  keeps the `in (...)` clause valid rather than special-casing it). */
  async listDistinctStudentIdsForTutors(tutorIds: string[]): Promise<string[]> {
    const rows = await this.db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('enrollments.student_id')
      .distinct()
      .where(
        'batches.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .execute();
    return rows.map((r) => r.student_id);
  }

  /** Multi-tutor sibling of listOpenWithSeatsForTutor — backs the
   *  Academy Profile's "Academy batches" section, which spans every
   *  active member tutor. Also selects tutor_id (the single-tutor
   *  version doesn't, since it's redundant there) so the UI can
   *  attribute each batch to the teacher running it. */
  /** Every batch (any status) across a set of tutors, with a live
   *  enrolled count — the Academy Dashboard's "every batch across my
   *  teachers" list. Unlike listOpenWithSeatsForTutors, this isn't
   *  filtered to active/open batches, so an academy admin can see (and
   *  re-activate) archived ones too. */
  listForTutors(tutorIds: string[]) {
    return this.db
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
      .where(
        'batches.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
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

  /** Every active enrollment across a set of tutors' batches, joined with
   *  the student's identity and batch title — backs the Academy
   *  Dashboard's Students page (Classes -> Students). */
  listEnrollmentsForTutors(tutorIds: string[]) {
    return this.db
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
        'users.phone_e164',
        'profiles_student.display_name',
      ])
      .where(
        'batches.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .where('enrollments.status', '=', 'active')
      .orderBy('enrollments.joined_at', 'desc')
      .execute();
  }

  listOpenWithSeatsForTutors(tutorIds: string[]) {
    return this.db
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
      .where(
        'batches.tutor_id',
        'in',
        tutorIds.length ? tutorIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .where('batches.status', '=', 'active')
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
}
