import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface PublishableQuestion {
  questionText: string;
  choices: string[];
  correctChoiceIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

/** Owns the published-quiz snapshot (`quizzes`/`quiz_questions`) — distinct
 *  from ai/quizzes' QuizzesRepository, which owns the tutor-review drafts
 *  this snapshot is published from. */
@Injectable()
export class PublishedQuizzesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  createWithQuestions(
    quizDraftId: string,
    batchId: string,
    tutorId: string,
    title: string,
    questions: PublishableQuestion[],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const quiz = await trx
        .insertInto('quizzes')
        .values({
          id: newId(),
          quiz_draft_id: quizDraftId,
          batch_id: batchId,
          tutor_id: tutorId,
          title,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('quiz_questions')
        .values(
          questions.map((q, index) => ({
            id: newId(),
            quiz_id: quiz.id,
            order_index: index,
            question_text: q.questionText,
            choices: JSON.stringify(q.choices),
            correct_choice_index: q.correctChoiceIndex,
            difficulty: q.difficulty,
          })),
        )
        .execute();

      return quiz;
    });
  }

  findById(id: string) {
    return this.db
      .selectFrom('quizzes')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByDraftId(quizDraftId: string) {
    return this.db
      .selectFrom('quizzes')
      .selectAll()
      .where('quiz_draft_id', '=', quizDraftId)
      .executeTakeFirst();
  }

  listQuestions(quizId: string) {
    return this.db
      .selectFrom('quiz_questions')
      .selectAll()
      .where('quiz_id', '=', quizId)
      .orderBy('order_index')
      .execute();
  }

  /** Published quizzes in a batch, each with the student's own attempt
   *  status/score if they've taken it. */
  listForBatch(batchId: string, studentId: string) {
    return this.db
      .selectFrom('quizzes')
      .leftJoin('quiz_attempts', (join) =>
        join
          .onRef('quiz_attempts.quiz_id', '=', 'quizzes.id')
          .on('quiz_attempts.student_id', '=', studentId),
      )
      .select((eb) => [
        'quizzes.id',
        'quizzes.title',
        'quizzes.created_at',
        eb
          .selectFrom('quiz_questions')
          .select((e) => e.fn.countAll().as('count'))
          .whereRef('quiz_questions.quiz_id', '=', 'quizzes.id')
          .as('question_count'),
        'quiz_attempts.score',
        'quiz_attempts.total',
        'quiz_attempts.submitted_at as attempted_at',
      ])
      .where('quizzes.batch_id', '=', batchId)
      .orderBy('quizzes.created_at', 'desc')
      .execute();
  }

  /** Bulk sibling of listForBatch — published quizzes (with the student's
   *  own attempt status) across a set of batches in one query, backing
   *  the Student Dashboard's "mine" endpoint. */
  listForBatches(batchIds: string[], studentId: string) {
    return this.db
      .selectFrom('quizzes')
      .leftJoin('quiz_attempts', (join) =>
        join
          .onRef('quiz_attempts.quiz_id', '=', 'quizzes.id')
          .on('quiz_attempts.student_id', '=', studentId),
      )
      .select((eb) => [
        'quizzes.id',
        'quizzes.batch_id',
        'quizzes.title',
        'quizzes.created_at',
        eb
          .selectFrom('quiz_questions')
          .select((e) => e.fn.countAll().as('count'))
          .whereRef('quiz_questions.quiz_id', '=', 'quizzes.id')
          .as('question_count'),
        'quiz_attempts.score',
        'quiz_attempts.total',
        'quiz_attempts.submitted_at as attempted_at',
      ])
      .where(
        'quizzes.batch_id',
        'in',
        batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .orderBy('quizzes.created_at', 'desc')
      .execute();
  }
}
