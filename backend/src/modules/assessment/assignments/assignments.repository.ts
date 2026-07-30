import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewAssignment {
  batchId: string;
  title: string;
  instructions: string | null;
  dueAtUtc: Date;
  timezone: string;
}

@Injectable()
export class AssignmentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewAssignment) {
    return this.db
      .insertInto('assignments')
      .values({
        id: newId(),
        batch_id: input.batchId,
        title: input.title,
        instructions: input.instructions,
        due_at_utc: input.dueAtUtc,
        timezone: input.timezone,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('assignments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('assignments')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('due_at_utc', 'desc')
      .execute();
  }

  /** Assignments across every batch a student is actively enrolled in. */
  listForStudent(studentId: string) {
    return this.db
      .selectFrom('assignments')
      .innerJoin('enrollments', 'enrollments.batch_id', 'assignments.batch_id')
      .innerJoin('batches', 'batches.id', 'assignments.batch_id')
      .leftJoin('submissions', (join) =>
        join
          .onRef('submissions.assignment_id', '=', 'assignments.id')
          .on('submissions.student_id', '=', studentId),
      )
      .select([
        'assignments.id',
        'assignments.batch_id',
        'assignments.title',
        'assignments.instructions',
        'assignments.due_at_utc',
        'assignments.timezone',
        'batches.title as batch_title',
        'submissions.id as submission_id',
        'submissions.submitted_at',
        'submissions.grade',
      ])
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .orderBy('assignments.due_at_utc', 'desc')
      .execute();
  }

  delete(id: string) {
    return this.db.deleteFrom('assignments').where('id', '=', id).execute();
  }
}
