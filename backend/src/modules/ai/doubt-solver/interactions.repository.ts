import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { AiInteractionCitation, DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewInteraction {
  studentId: string;
  batchId: string;
  parentId: string | null;
  kind: 'hint' | 'full_answer';
  questionText: string;
  answerText: string;
  citations: AiInteractionCitation[];
  flagged: boolean;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class AiInteractionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewInteraction) {
    return this.db
      .insertInto('ai_interactions')
      .values({
        id: newId(),
        student_id: input.studentId,
        batch_id: input.batchId,
        parent_id: input.parentId,
        kind: input.kind,
        question_text: input.questionText,
        answer_text: input.answerText,
        citations: JSON.stringify(input.citations),
        flagged: input.flagged,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('ai_interactions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** A hint the student hasn't followed up on yet (no full_answer row
   *  pointing back at it) — the only kind of interaction the
   *  submit-attempt endpoint is allowed to act on. */
  findOpenHint(id: string) {
    return this.db
      .selectFrom('ai_interactions')
      .selectAll()
      .where('id', '=', id)
      .where('kind', '=', 'hint')
      .executeTakeFirst();
  }

  hasFollowUp(hintId: string) {
    return this.db
      .selectFrom('ai_interactions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('parent_id', '=', hintId)
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.count) > 0);
  }

  /** A student's Q&A history for a batch, oldest first. */
  listForStudentInBatch(studentId: string, batchId: string) {
    return this.db
      .selectFrom('ai_interactions')
      .selectAll()
      .where('student_id', '=', studentId)
      .where('batch_id', '=', batchId)
      .orderBy('created_at')
      .execute();
  }

  /** Total tokens a student has spent this calendar month — the
   *  blueprint §5 hard-cap check reads this before every new call. Not
   *  the authoritative gate (see createIfUnderBudget for that) — this
   *  is only a cheap up-front fail-fast so an obviously-over-budget
   *  request doesn't pay for an AI call it can never keep. */
  async monthlyTokenUsage(studentId: string): Promise<number> {
    return this.sumTokensThisMonth(this.db, studentId);
  }

  private async sumTokensThisMonth(
    executor: Kysely<DB> | Transaction<DB>,
    studentId: string,
  ): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const row = await executor
      .selectFrom('ai_interactions')
      .select((eb) => [
        eb.fn.sum('input_tokens').as('input_total'),
        eb.fn.sum('output_tokens').as('output_total'),
      ])
      .where('student_id', '=', studentId)
      .where('created_at', '>=', startOfMonth)
      .executeTakeFirstOrThrow();

    return Number(row.input_total ?? 0) + Number(row.output_total ?? 0);
  }

  /**
   * SEC-04: the old pattern was check-then-act with the *entire AI call*
   * in between (assertUnderBudget, then minutes later, this.create()) —
   * a textbook TOCTOU race letting concurrent requests each pass the
   * check before any of them had written usage back, blowing well past
   * the monthly cap. This is the authoritative gate, called right
   * before the write (after the AI call already ran — the actual token
   * cost isn't known any earlier — so a request landing exactly on the
   * cap boundary can still complete once; what this fixes is unbounded
   * concurrent overrun, not the single-request boundary case).
   *
   * `pg_advisory_xact_lock` serializes only concurrent requests for the
   * *same* student (keyed by a hash of their id) — held for the length
   * of this transaction, auto-released on commit/rollback, and doesn't
   * block other students. The re-check happens inside that lock, so it
   * sees every sibling transaction's already-committed usage: the
   * second of two concurrent requests genuinely can't slip through.
   *
   * Returns null (caller throws ForbiddenException) instead of
   * inserting when the cap would be exceeded.
   */
  async createIfUnderBudget(input: NewInteraction, cap: number) {
    return this.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${input.studentId}))`.execute(
        trx,
      );

      const used = await this.sumTokensThisMonth(trx, input.studentId);
      if (used >= cap) return null;

      return trx
        .insertInto('ai_interactions')
        .values({
          id: newId(),
          student_id: input.studentId,
          batch_id: input.batchId,
          parent_id: input.parentId,
          kind: input.kind,
          question_text: input.questionText,
          answer_text: input.answerText,
          citations: JSON.stringify(input.citations),
          flagged: input.flagged,
          input_tokens: input.inputTokens,
          output_tokens: input.outputTokens,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }
}
