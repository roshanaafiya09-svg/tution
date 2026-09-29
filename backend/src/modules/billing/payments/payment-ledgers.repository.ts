import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB, PaymentRefundsTable } from '../../../database/types';
import { newId } from '../../../database/id';

export type RefundRow = Selectable<PaymentRefundsTable>;
type Db = Kysely<DB> | Transaction<DB>;

/**
 * Two append-mostly ledgers that make the payment state machine
 * replay-proof (migration 0046):
 *  - payment_events: every provider webhook under a UNIQUE
 *    (provider, provider_event_id);
 *  - payment_refunds: every refund under a UNIQUE idempotency key, with the
 *    database itself refusing a refund total above the captured amount.
 */
@Injectable()
export class PaymentLedgersRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  // ---- webhook events ----------------------------------------------------
  /** Records a delivery. Returns false when this exact event was already
   *  recorded (a replay) — the caller must then do NOTHING. Run inside the
   *  same transaction as the processing, so a failure rolls the record back
   *  and the provider's retry is processed for real. */
  async recordEvent(
    trx: Transaction<DB>,
    event: {
      provider: string;
      eventId: string;
      type: string;
      providerOrderId?: string | null;
      providerPaymentId?: string | null;
      paymentId?: string | null;
    },
  ): Promise<boolean> {
    const row = await trx
      .insertInto('payment_events')
      .values({
        id: newId(),
        provider: event.provider,
        provider_event_id: event.eventId,
        event_type: event.type,
        provider_order_id: event.providerOrderId ?? null,
        provider_payment_id: event.providerPaymentId ?? null,
        payment_id: event.paymentId ?? null,
      })
      .onConflict((oc) =>
        oc.columns(['provider', 'provider_event_id']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  attachPaymentToEvent(
    trx: Transaction<DB>,
    provider: string,
    eventId: string,
    paymentId: string,
  ) {
    return trx
      .updateTable('payment_events')
      .set({ payment_id: paymentId })
      .where('provider', '=', provider)
      .where('provider_event_id', '=', eventId)
      .execute();
  }

  // ---- refunds -----------------------------------------------------------
  findRefundByKey(idempotencyKey: string, db: Db = this.db) {
    return db
      .selectFrom('payment_refunds')
      .selectAll()
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
  }

  findRefundByProviderId(providerRefundId: string, db: Db = this.db) {
    return db
      .selectFrom('payment_refunds')
      .selectAll()
      .where('provider_refund_id', '=', providerRefundId)
      .executeTakeFirst();
  }

  /** Sum of refunds that count against the captured amount (pending +
   *  succeeded; failed ones released their share). */
  async committedRefundMinor(paymentId: string, db: Db): Promise<number> {
    const row = await db
      .selectFrom('payment_refunds')
      .select(sql<string>`coalesce(sum(amount_minor), 0)`.as('n'))
      .where('payment_id', '=', paymentId)
      .where('status', '<>', 'failed')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  insertPendingRefund(
    trx: Transaction<DB>,
    input: {
      paymentId: string;
      amountMinor: number;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    return trx
      .insertInto('payment_refunds')
      .values({
        id: newId(),
        payment_id: input.paymentId,
        amount_minor: input.amountMinor,
        reason: input.reason,
        idempotency_key: input.idempotencyKey,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Atomically claims the right to call the provider for this refund.
   * Returns the row (with its incremented attempt count) to exactly ONE
   * caller; everyone else gets undefined and must wait for that caller's
   * outcome. A claim older than `staleAfterSeconds` is presumed dead.
   */
  claimDispatch(refundId: string, staleAfterSeconds: number) {
    return this.db
      .updateTable('payment_refunds')
      .set({
        dispatched_at: sql<Date>`now()`,
        dispatch_attempts: sql<number>`dispatch_attempts + 1`,
      })
      .where('id', '=', refundId)
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb('dispatched_at', 'is', null),
          eb(
            'dispatched_at',
            '<',
            sql<Date>`now() - (${staleAfterSeconds} * interval '1 second')`,
          ),
        ]),
      )
      .returningAll()
      .executeTakeFirst();
  }

  /** Give the claim back (a definitive early exit before any provider call
   *  could have happened), so the next caller is not blocked for the window. */
  releaseDispatch(refundId: string) {
    return this.db
      .updateTable('payment_refunds')
      .set({ dispatched_at: null })
      .where('id', '=', refundId)
      .where('status', '=', 'pending')
      .execute();
  }

  findRefundById(id: string, db: Db = this.db) {
    return db
      .selectFrom('payment_refunds')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** failed -> pending: a retry under the same idempotency key. Starts with
   *  no dispatch claim held by anyone. */
  resetToPending(trx: Transaction<DB>, id: string) {
    return trx
      .updateTable('payment_refunds')
      .set({ status: 'pending', failure_reason: null, dispatched_at: null })
      .where('id', '=', id)
      .where('status', '=', 'failed')
      .returningAll()
      .executeTakeFirst();
  }

  markRefundSucceeded(
    trx: Transaction<DB>,
    id: string,
    providerRefundId: string,
  ) {
    return trx
      .updateTable('payment_refunds')
      .set({
        status: 'succeeded',
        provider_refund_id: providerRefundId,
        failure_reason: null,
      })
      .where('id', '=', id)
      .where('status', 'in', ['pending', 'failed'])
      .returningAll()
      .executeTakeFirst();
  }

  /** A failed refund is not being dispatched by anyone any more. */
  markRefundFailed(id: string, reason: string, db: Db = this.db) {
    return db
      .updateTable('payment_refunds')
      .set({ status: 'failed', failure_reason: reason, dispatched_at: null })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
  }

  listPendingRefundsOlderThan(cutoff: Date, limit = 50) {
    return this.db
      .selectFrom('payment_refunds')
      .selectAll()
      .where('status', '=', 'pending')
      .where('updated_at', '<', cutoff)
      .orderBy('created_at', 'asc')
      .limit(limit)
      .execute();
  }
}
