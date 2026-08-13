import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { CreateBatchDto } from './dto/create-batch.dto';

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
}
