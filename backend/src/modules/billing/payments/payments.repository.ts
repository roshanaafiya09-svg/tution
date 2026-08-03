import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(feeLedgerId: string, payerId: string, amountMinor: number, currency: string) {
    return this.db
      .insertInto('payments')
      .values({
        id: newId(),
        fee_ledger_id: feeLedgerId,
        payer_id: payerId,
        amount_minor: amountMinor,
        currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByProviderOrderId(providerOrderId: string) {
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where('provider_order_id', '=', providerOrderId)
      .executeTakeFirst();
  }

  setOrder(id: string, providerOrderId: string, providerName: string) {
    return this.db
      .updateTable('payments')
      .set({ provider_order_id: providerOrderId, provider: providerName })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markCaptured(id: string, providerPaymentId: string) {
    return this.db
      .updateTable('payments')
      .set({ status: 'captured', provider_payment_id: providerPaymentId })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markFailed(id: string, reason: string) {
    return this.db
      .updateTable('payments')
      .set({ status: 'failed', failure_reason: reason })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
