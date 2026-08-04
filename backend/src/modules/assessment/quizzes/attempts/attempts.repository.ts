import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../../database/database.module';
import type { DB } from '../../../../database/types';
import { newId } from '../../../../database/id';

@Injectable()
export class QuizAttemptsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(
    quizId: string,
    studentId: string,
    answers: number[],
    score: number,
    total: number,
  ) {
    return this.db
      .insertInto('quiz_attempts')
      .values({
        id: newId(),
        quiz_id: quizId,
        student_id: studentId,
        answers: JSON.stringify(answers),
        score,
        total,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findForStudent(quizId: string, studentId: string) {
    return this.db
      .selectFrom('quiz_attempts')
      .selectAll()
      .where('quiz_id', '=', quizId)
      .where('student_id', '=', studentId)
      .executeTakeFirst();
  }

  /** Every student's attempt on one quiz — the tutor results view. */
  listForQuiz(quizId: string) {
    return this.db
      .selectFrom('quiz_attempts')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'quiz_attempts.student_id',
      )
      .select([
        'quiz_attempts.id',
        'quiz_attempts.student_id',
        'quiz_attempts.score',
        'quiz_attempts.total',
        'quiz_attempts.submitted_at',
        'profiles_student.display_name',
      ])
      .where('quiz_attempts.quiz_id', '=', quizId)
      .orderBy('quiz_attempts.submitted_at')
      .execute();
  }

  /** Every attempt across every batch a tutor teaches — the "measured
   *  improvement" input to the Proof-of-Teaching score (blueprint §10
   *  Phase 4), fed through the same week-bucketed trend helper the
   *  student progress view uses. */
  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('quiz_attempts')
      .innerJoin('quizzes', 'quizzes.id', 'quiz_attempts.quiz_id')
      .innerJoin('batches', 'batches.id', 'quizzes.batch_id')
      .select([
        'quiz_attempts.id',
        'quiz_attempts.score',
        'quiz_attempts.total',
        'quiz_attempts.submitted_at',
      ])
      .where('batches.tutor_id', '=', tutorId)
      .orderBy('quiz_attempts.submitted_at', 'desc')
      .execute();
  }

  /** A student's full attempt history across every batch — feeds the
   *  Phase 3 attempt-history view (blueprint §7). */
  listForStudent(studentId: string) {
    return this.db
      .selectFrom('quiz_attempts')
      .innerJoin('quizzes', 'quizzes.id', 'quiz_attempts.quiz_id')
      .innerJoin('batches', 'batches.id', 'quizzes.batch_id')
      .select([
        'quiz_attempts.id',
        'quiz_attempts.quiz_id',
        'quiz_attempts.score',
        'quiz_attempts.total',
        'quiz_attempts.submitted_at',
        'quizzes.title as quiz_title',
        'batches.title as batch_title',
      ])
      .where('quiz_attempts.student_id', '=', studentId)
      .orderBy('quiz_attempts.submitted_at', 'desc')
      .execute();
  }
}
