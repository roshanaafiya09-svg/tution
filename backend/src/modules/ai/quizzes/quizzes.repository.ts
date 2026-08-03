import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { QuizQuestionDraft } from '../ai-provider.interface';

@Injectable()
export class QuizzesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  createDraftWithQuestions(
    tutorId: string,
    materialId: string,
    batchId: string,
    questions: QuizQuestionDraft[],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const draft = await trx
        .insertInto('quiz_drafts')
        .values({
          id: newId(),
          tutor_id: tutorId,
          material_id: materialId,
          batch_id: batchId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('quiz_draft_questions')
        .values(
          questions.map((q, index) => ({
            id: newId(),
            quiz_draft_id: draft.id,
            order_index: index,
            question_text: q.questionText,
            choices: JSON.stringify(q.choices),
            correct_choice_index: q.correctChoiceIndex,
            difficulty: q.difficulty,
          })),
        )
        .execute();

      return draft;
    });
  }

  findById(id: string) {
    return this.db
      .selectFrom('quiz_drafts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('quiz_drafts')
      .innerJoin('materials', 'materials.id', 'quiz_drafts.material_id')
      .select([
        'quiz_drafts.id',
        'quiz_drafts.batch_id',
        'quiz_drafts.status',
        'quiz_drafts.created_at',
        'materials.title as material_title',
      ])
      .where('quiz_drafts.tutor_id', '=', tutorId)
      .orderBy('quiz_drafts.created_at', 'desc')
      .execute();
  }

  listQuestions(quizDraftId: string) {
    return this.db
      .selectFrom('quiz_draft_questions')
      .selectAll()
      .where('quiz_draft_id', '=', quizDraftId)
      .orderBy('order_index')
      .execute();
  }

  findQuestionById(id: string) {
    return this.db
      .selectFrom('quiz_draft_questions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  updateQuestion(
    id: string,
    patch: Partial<{
      questionText: string;
      choices: string[];
      correctChoiceIndex: number;
      difficulty: 'easy' | 'medium' | 'hard';
    }>,
  ) {
    return this.db
      .updateTable('quiz_draft_questions')
      .set({
        ...(patch.questionText !== undefined && {
          question_text: patch.questionText,
        }),
        ...(patch.choices !== undefined && {
          choices: JSON.stringify(patch.choices),
        }),
        ...(patch.correctChoiceIndex !== undefined && {
          correct_choice_index: patch.correctChoiceIndex,
        }),
        ...(patch.difficulty !== undefined && { difficulty: patch.difficulty }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateStatus(id: string, status: 'approved' | 'rejected') {
    return this.db
      .updateTable('quiz_drafts')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
