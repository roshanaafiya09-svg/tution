import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class PayoutsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  transaction<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(fn);
  }

  /** The payout row, created INSIDE the transaction that claims its
   *  payments — so a run that finds nothing to pay leaves no row behind.
   *  `academyId` set = an academy payout, paid to its owner (`tutor_id` is
   *  the payee user). */
  createTx(
    trx: Transaction<DB>,
    input: {
      payeeUserId: string;
      academyId: string | null;
      currency: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    return trx
      .insertInto('payouts')
      .values({
        id: newId(),
        tutor_id: input.payeeUserId,
        academy_id: input.academyId,
        amount_minor: 0,
        currency: input.currency,
        period_start: input.periodStart,
        period_end: input.periodEnd,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setAmountTx(trx: Transaction<DB>, id: string, amountMinor: number) {
    return trx
      .updateTable('payouts')
      .set({ amount_minor: amountMinor })
      .where('id', '=', id)
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

  /** A teacher's OWN (individual) payouts — never an academy's. */
  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('payouts')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .where('academy_id', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
  }

  listForAcademy(academyId: string) {
    return this.db
      .selectFrom('payouts')
      .selectAll()
      .where('academy_id', '=', academyId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  setProviderPayout(id: string, providerPayoutId: string, provider: string) {
    return this.db
      .updateTable('payouts')
      .set({
        status: 'processing',
        provider_payout_id: providerPayoutId,
        provider,
      })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markPaid(id: string) {
    return this.db
      .updateTable('payouts')
      .set({ status: 'paid' })
      .where('id', '=', id)
      .where('status', '=', 'processing')
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markFailedTx(trx: Transaction<DB>, id: string) {
    return trx
      .updateTable('payouts')
      .set({ status: 'failed' })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
  }

  /** Payouts still `pending` after `cutoff` with no provider id: the
   *  provider call did not finish cleanly. Their payments stay attached
   *  (never re-paid) until a human confirms what happened at the provider. */
  listStuckPending(cutoff: Date) {
    return this.db
      .selectFrom('payouts')
      .selectAll()
      .where('status', '=', 'pending')
      .where('provider_payout_id', 'is', null)
      .where('created_at', '<', cutoff)
      .execute();
  }
}
