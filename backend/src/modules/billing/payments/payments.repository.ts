import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  createForFee(feeLedgerId: string, payerId: string, amountMinor: number, currency: string) {
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

  createForSubscription(
    subscriptionId: string,
    planId: string,
    payerId: string,
    amountMinor: number,
    currency: string,
  ) {
    return this.db
      .insertInto('payments')
      .values({
        id: newId(),
        subscription_id: subscriptionId,
        plan_id: planId,
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

  /** Captured fee-collection payments for this tutor's students, not
   *  yet folded into a payout, within [from, to) — the candidates for
   *  the next payout run. Filtered on updated_at since capture is the
   *  last write a payment row gets in the happy path (see markCaptured). */
  listUnpaidOutCapturedForTutor(tutorId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('payments')
      .innerJoin('fee_ledger', 'fee_ledger.id', 'payments.fee_ledger_id')
      .select(['payments.id', 'payments.amount_minor', 'payments.currency'])
      .where('fee_ledger.tutor_id', '=', tutorId)
      .where('payments.status', '=', 'captured')
      .where('payments.payout_id', 'is', null)
      .where('payments.updated_at', '>=', from)
      .where('payments.updated_at', '<', to)
      .execute();
  }

  assignPayout(paymentIds: string[], payoutId: string | null) {
    if (paymentIds.length === 0) return Promise.resolve();
    return this.db
      .updateTable('payments')
      .set({ payout_id: payoutId })
      .where('id', 'in', paymentIds)
      .execute();
  }
}
