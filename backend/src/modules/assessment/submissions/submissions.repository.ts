import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class SubmissionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  upsert(assignmentId: string, studentId: string, objectKeys: string[]) {
    return this.db
      .insertInto('submissions')
      .values({
        id: newId(),
        assignment_id: assignmentId,
        student_id: studentId,
        object_keys: JSON.stringify(objectKeys),
      })
      .onConflict((oc) =>
        oc.columns(['assignment_id', 'student_id']).doUpdateSet({
          object_keys: JSON.stringify(objectKeys),
          submitted_at: new Date(),
          // Resubmission invalidates the previous grade.
          grade: null,
          feedback: null,
          graded_at: null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findForStudent(assignmentId: string, studentId: string) {
    return this.db
      .selectFrom('submissions')
      .selectAll()
      .where('assignment_id', '=', assignmentId)
      .where('student_id', '=', studentId)
      .executeTakeFirst();
  }

  listForAssignment(assignmentId: string) {
    return this.db
      .selectFrom('submissions')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'submissions.student_id',
      )
      .select([
        'submissions.id',
        'submissions.student_id',
        'submissions.object_keys',
        'submissions.submitted_at',
        'submissions.grade',
        'submissions.feedback',
        'submissions.graded_at',
        'profiles_student.display_name',
      ])
      .where('submissions.assignment_id', '=', assignmentId)
      .orderBy('submissions.submitted_at')
      .execute();
  }

  /** Every submission a student has made, across all assignments — feeds data export. */
  listForStudent(studentId: string) {
    return this.db
      .selectFrom('submissions')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('submitted_at', 'desc')
      .execute();
  }

  /** Submissions a student made within [from, to), with assignment/batch
   *  titles and grade — feeds the AI weekly parent digest (blueprint §8). */
  listForStudentBetween(studentId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('submissions')
      .innerJoin('assignments', 'assignments.id', 'submissions.assignment_id')
      .innerJoin('batches', 'batches.id', 'assignments.batch_id')
      .select([
        'submissions.grade',
        'submissions.submitted_at',
        'assignments.title as assignment_title',
        'batches.title as batch_title',
      ])
      .where('submissions.student_id', '=', studentId)
      .where('submissions.submitted_at', '>=', from)
      .where('submissions.submitted_at', '<', to)
      .execute();
  }

  grade(id: string, grade: string, feedback: string | null) {
    return this.db
      .updateTable('submissions')
      .set({ grade, feedback, graded_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Submission/graded counts for a student in one batch — the progress view. */
  async summaryForStudent(studentId: string, batchId: string) {
    const assignments = await this.db
      .selectFrom('assignments')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('batch_id', '=', batchId)
      .executeTakeFirstOrThrow();

    const submitted = await this.db
      .selectFrom('submissions')
      .innerJoin('assignments', 'assignments.id', 'submissions.assignment_id')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn
          .sum(
            eb
              .case()
              .when('submissions.grade', 'is not', null)
              .then(1)
              .else(0)
              .end(),
          )
          .as('graded'),
      ])
      .where('submissions.student_id', '=', studentId)
      .where('assignments.batch_id', '=', batchId)
      .executeTakeFirstOrThrow();

    const total = Number(assignments.count);
    const submittedCount = Number(submitted.count);

    return {
      totalAssignments: total,
      submitted: submittedCount,
      graded: Number(submitted.graded ?? 0),
      completionRate:
        total === 0 ? null : Math.round((submittedCount / total) * 100),
    };
  }
}
