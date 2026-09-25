import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class InvitesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(
    tutorId: string,
    batchId: string,
    token: string,
    expiresAt: Date,
    maxUses: number,
  ) {
    return this.db
      .insertInto('invites')
      .values({
        id: newId(),
        tutor_id: tutorId,
        batch_id: batchId,
        token,
        expires_at: expiresAt,
        max_uses: maxUses,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByToken(token: string) {
    return this.db
      .selectFrom('invites')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst();
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('invites')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /**
   * Atomically claims one use. The WHERE guard means two students
   * redeeming the last slot concurrently can't both succeed — returns
   * undefined for the loser rather than over-issuing.
   *
   * H8: also refuses a revoked invite, and — independently of whether the
   * revocation ran — any invite whose batch's teacher account has been
   * deleted, so an old link of a deleted teacher can never enroll a new
   * student even if it was created by some path that skipped revocation.
   */
  async claimUse(token: string): Promise<boolean> {
    const result = await this.db
      .updateTable('invites')
      .set((eb) => ({ used_count: eb('used_count', '+', 1) }))
      .where('token', '=', token)
      .where('used_count', '<', sql<number>`max_uses`)
      .where('expires_at', '>', new Date())
      .where('revoked_at', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('batches')
            .innerJoin('users', 'users.id', 'batches.tutor_id')
            .select('batches.id')
            .whereRef('batches.id', '=', 'invites.batch_id')
            .where('users.deleted_at', 'is', null),
        ),
      )
      .returning('id')
      .executeTakeFirst();

    return !!result;
  }

  /** H8: account deletion — every still-open invite this teacher created
   *  stops working. Rows are kept (used_count/expiry stay as history). */
  async revokeAllForTutor(tutorId: string): Promise<number> {
    const rows = await this.db
      .updateTable('invites')
      .set({ revoked_at: new Date() })
      .where('tutor_id', '=', tutorId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .execute();
    return rows.length;
  }

  /** Whether the teacher running this invite's batch still has an active
   *  (non-deleted) account — for the public preview's messaging. */
  async isBatchTeacherActive(batchId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('batches')
      .innerJoin('users', 'users.id', 'batches.tutor_id')
      .select('batches.id')
      .where('batches.id', '=', batchId)
      .where('users.deleted_at', 'is', null)
      .executeTakeFirst();
    return !!row;
  }
}
