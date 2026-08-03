import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class PayoutsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(
    tutorId: string,
    amountMinor: number,
    currency: string,
    periodStart: string,
    periodEnd: string,
  ) {
    return this.db
      .insertInto('payouts')
      .values({
        id: newId(),
        tutor_id: tutorId,
        amount_minor: amountMinor,
        currency,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('payouts')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  setProviderPayout(id: string, providerPayoutId: string, provider: string) {
    return this.db
      .updateTable('payouts')
      .set({ status: 'processing', provider_payout_id: providerPayoutId, provider })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markPaid(id: string) {
    return this.db
      .updateTable('payouts')
      .set({ status: 'paid' })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markFailed(id: string) {
    return this.db
      .updateTable('payouts')
      .set({ status: 'failed' })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
