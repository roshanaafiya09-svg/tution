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
   */
  async claimUse(token: string): Promise<boolean> {
    const result = await this.db
      .updateTable('invites')
      .set((eb) => ({ used_count: eb('used_count', '+', 1) }))
      .where('token', '=', token)
      .where('used_count', '<', sql<number>`max_uses`)
      .where('expires_at', '>', new Date())
      .returning('id')
      .executeTakeFirst();

    return !!result;
  }
}
