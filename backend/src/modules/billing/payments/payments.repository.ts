import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Insertable, Kysely, Selectable, Transaction } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB, PaymentsTable } from '../../../database/types';
import { newId } from '../../../database/id';

export type PaymentRow = Selectable<PaymentsTable>;
type Db = Kysely<DB> | Transaction<DB>;

/** What a payment is FOR. Exactly one of these columns is set on a payment
 *  row (payments_target_check), and at most one OPEN payment may exist per
 *  target (partial unique indexes, migration 0046). */
export type PaymentTarget =
  | { kind: 'fee'; id: string }
  | { kind: 'subscription'; id: string }
  | { kind: 'parent_subscription'; id: string }
  | { kind: 'academy_subscription'; id: string }
  | { kind: 'booking'; id: string };

const TARGET_COLUMN = {
  fee: 'fee_ledger_id',
  subscription: 'subscription_id',
  parent_subscription: 'parent_subscription_id',
  academy_subscription: 'academy_subscription_id',
  booking: 'booking_id',
} as const;

export interface OpenOrderSpec {
  payerId: string;
  amountMinor: number;
  currency: string;
  planId?: string | null;
  blocks?: number | null;
  teacherFeatures?: number | null;
}

/** Scope of a payout run: one individual teacher's own INDIVIDUAL business,
 *  or one academy's. The two never mix. */
export type PayoutScope =
  { kind: 'tutor'; tutorId: string } | { kind: 'academy'; academyId: string };

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  transaction<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(fn);
  }

  // ---- lookups ----------------------------------------------------------
  findById(id: string, db: Db = this.db) {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Row lock — every state change to one payment queues here. */
  lockById(trx: Transaction<DB>, id: string) {
    return trx
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  findByProviderOrderId(providerOrderId: string, db: Db = this.db) {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('provider_order_id', '=', providerOrderId)
      .executeTakeFirst();
  }

  findByProviderPaymentId(providerPaymentId: string, db: Db = this.db) {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('provider_payment_id', '=', providerPaymentId)
      .executeTakeFirst();
  }

  /** The payment that actually collected money for a booking (a booking can
   *  have several attempted/superseded rows; only one is captured). */
  findCollectedForBooking(bookingId: string, db: Db = this.db) {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('booking_id', '=', bookingId)
      .where('status', 'in', ['captured', 'refunded'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  // ---- open orders ------------------------------------------------------
  /** Locks the row a payment is for, serialising concurrent order requests
   *  for the same target. */
  async lockTarget(trx: Transaction<DB>, target: PaymentTarget): Promise<void> {
    const table = {
      fee: 'fee_ledger',
      subscription: 'subscriptions',
      parent_subscription: 'parent_premium_subscriptions',
      academy_subscription: 'academy_subscriptions',
      booking: 'bookings',
    }[target.kind] as
      | 'fee_ledger'
      | 'subscriptions'
      | 'parent_premium_subscriptions'
      | 'academy_subscriptions'
      | 'bookings';
    await trx
      .selectFrom(table)
      .select('id')
      .where('id', '=', target.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
  }

  findOpenForTarget(trx: Transaction<DB>, target: PaymentTarget) {
    return trx
      .selectFrom('payments')
      .selectAll()
      .where(TARGET_COLUMN[target.kind], '=', target.id)
      .where('status', 'in', ['created', 'authorized'])
      .forUpdate()
      .executeTakeFirst();
  }

  createOpen(trx: Transaction<DB>, target: PaymentTarget, spec: OpenOrderSpec) {
    const values = {
      id: newId(),
      payer_id: spec.payerId,
      amount_minor: spec.amountMinor,
      currency: spec.currency,
      plan_id: spec.planId ?? null,
      blocks: spec.blocks ?? null,
      teacher_features: spec.teacherFeatures ?? null,
      [TARGET_COLUMN[target.kind]]: target.id,
    } as Insertable<PaymentsTable>;
    return trx
      .insertInto('payments')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setOrder(
    trx: Transaction<DB>,
    id: string,
    providerOrderId: string,
    providerName: string,
  ) {
    return trx
      .updateTable('payments')
      .set({ provider_order_id: providerOrderId, provider: providerName })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- state machine (each is a guarded, atomic transition) ---------------
  markAuthorized(trx: Transaction<DB>, id: string) {
    return trx
      .updateTable('payments')
      .set({ status: 'authorized' })
      .where('id', '=', id)
      .where('status', '=', 'created')
      .returningAll()
      .executeTakeFirst();
  }

  /** Only an OPEN payment can fail. A captured/refunded one never reverts
   *  (the database trigger enforces the same rule). */
  markFailed(trx: Transaction<DB>, id: string, reason: string) {
    return trx
      .updateTable('payments')
      .set({ status: 'failed', failure_reason: reason })
      .where('id', '=', id)
      .where('status', 'in', ['created', 'authorized'])
      .returningAll()
      .executeTakeFirst();
  }

  /** created | authorized | failed -> captured. `failed` is allowed because
   *  a provider can report a failed attempt and later a successful retry on
   *  the SAME order; the money was really taken, so it must be recorded. */
  markCaptured(trx: Transaction<DB>, id: string, providerPaymentId: string) {
    return trx
      .updateTable('payments')
      .set({
        status: 'captured',
        provider_payment_id: providerPaymentId,
        failure_reason: null,
      })
      .where('id', '=', id)
      .where('status', 'in', ['created', 'authorized', 'failed'])
      .returningAll()
      .executeTakeFirst();
  }

  /** Set exactly once, when the capture has been applied to its target. */
  markSettled(trx: Transaction<DB>, id: string) {
    return trx
      .updateTable('payments')
      .set({ settled_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('settled_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  /** Open orders nobody paid within `cutoff` are retired so the "one open
   *  order per target" slot is not held forever. */
  async expireStaleOpen(cutoff: Date): Promise<number> {
    const rows = await this.db
      .updateTable('payments')
      .set({ status: 'failed', failure_reason: 'expired' })
      .where('status', 'in', ['created', 'authorized'])
      .where('created_at', '<', cutoff)
      .returning('id')
      .execute();
    return rows.length;
  }

  // ---- payouts ------------------------------------------------------------
  /**
   * Atomically CLAIMS the payments eligible for a payout run by stamping
   * them with the payout id, and returns exactly the rows it claimed. Two
   * concurrent runs cannot claim the same payment (each row is locked, the
   * loser skips it), so a payment can never be paid out twice — and the
   * amount is computed from the claimed rows only.
   *
   * Eligible = a fee-collection payment that is captured, was actually
   * APPLIED to the fee ledger (settled_at), is not already in a payout, has
   * no refund still in flight, and has a positive net amount. Mock-provider
   * rows are excluded whenever `excludeMock` is set (production). Individual
   * scope covers only the teacher's INDIVIDUAL batches; academy scope only
   * that academy's.
   */
  async claimForPayout(
    trx: Transaction<DB>,
    scope: PayoutScope,
    payoutId: string,
    from: Date,
    to: Date,
    excludeMock: boolean,
  ): Promise<Array<{ id: string; net_minor: number; currency: string }>> {
    const scopeSql =
      scope.kind === 'tutor'
        ? sql`fl.tutor_id = ${scope.tutorId} and b.academy_id is null`
        : sql`b.academy_id = ${scope.academyId}`;
    const mockSql = excludeMock ? sql`and p.provider <> 'mock'` : sql``;
    const result = await sql<{
      id: string;
      net_minor: number;
      currency: string;
    }>`
      update payments set payout_id = ${payoutId}
      where id in (
        select p.id from payments p
        join fee_ledger fl on fl.id = p.fee_ledger_id
        join batches b on b.id = fl.batch_id
        where ${scopeSql}
          and p.status = 'captured'
          and p.settled_at is not null
          and p.payout_id is null
          and p.amount_minor - p.refunded_minor > 0
          and p.settled_at >= ${from} and p.settled_at < ${to}
          ${mockSql}
          and not exists (
            select 1 from payment_refunds r
            where r.payment_id = p.id and r.status <> 'succeeded'
          )
        for update of p skip locked
      )
      returning id, (amount_minor - refunded_minor) as net_minor, currency
    `.execute(trx);
    return result.rows;
  }

  /** Gives claimed payments back (payout definitively failed at the provider). */
  releasePayout(trx: Transaction<DB>, payoutId: string) {
    return trx
      .updateTable('payments')
      .set({ payout_id: null })
      .where('payout_id', '=', payoutId)
      .execute();
  }
}
