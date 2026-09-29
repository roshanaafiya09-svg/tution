import { Injectable } from '@nestjs/common';
import type { Selectable, Transaction } from 'kysely';
import type { DB, FeeLedgerTable } from '../../../database/types';

export type FeeRow = Selectable<FeeLedgerTable>;

/**
 * The statements a CAPTURE applies to its target. They live together, and
 * always run on the caller's transaction, so "payment captured" and "fee
 * credited / plan activated / booking confirmed" commit or roll back as one
 * unit (a crash between them can no longer leave money taken but not
 * applied, with a webhook replay that is a no-op).
 */
@Injectable()
export class PaymentSettlementRepository {
  /** Credits up to the fee's OUTSTANDING amount. Returns the updated fee
   *  and how much was really credited (0 when the fee is already paid /
   *  waived / fully covered — the rest is the caller's to refund). */
  async creditFee(
    trx: Transaction<DB>,
    feeId: string,
    amountMinor: number,
    note: string,
  ): Promise<{ credited: number; fee?: FeeRow }> {
    const fee = await trx
      .selectFrom('fee_ledger')
      .selectAll()
      .where('id', '=', feeId)
      .forUpdate()
      .executeTakeFirst();
    if (!fee || (fee.status !== 'due' && fee.status !== 'partial')) {
      return { credited: 0 };
    }
    const recorded = fee.recorded_paid_minor ?? 0;
    const outstanding = fee.expected_minor - recorded;
    const credited = Math.min(amountMinor, outstanding);
    if (credited <= 0) return { credited: 0 };

    const newRecorded = recorded + credited;
    const status = newRecorded >= fee.expected_minor ? 'paid' : 'partial';
    const updated = await trx
      .updateTable('fee_ledger')
      .set({
        recorded_paid_minor: newRecorded,
        status,
        paid_at: status === 'paid' ? new Date() : null,
        note,
      })
      .where('id', '=', feeId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { credited, fee: updated };
  }

  /** pending_payment -> confirmed. False when the booking is no longer
   *  awaiting payment (cancelled / already confirmed / terminal) — the
   *  captured money then has nothing to buy and must be refunded. */
  async confirmBooking(
    trx: Transaction<DB>,
    bookingId: string,
  ): Promise<boolean> {
    const row = await trx
      .updateTable('bookings')
      .set({ status: 'confirmed' })
      .where('id', '=', bookingId)
      .where('status', '=', 'pending_payment')
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Parent premium: extend from whichever is later, now or the current
   *  period end, so an early renewal never discards time already paid. */
  async extendParentPremium(
    trx: Transaction<DB>,
    subscriptionId: string,
    planId: string,
    periodDays: number,
    provider: string,
    providerRef: string,
  ): Promise<void> {
    const existing = await trx
      .selectFrom('parent_premium_subscriptions')
      .select(['current_period_end'])
      .where('id', '=', subscriptionId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const end = existing.current_period_end
      ? new Date(existing.current_period_end)
      : null;
    const base = end && end > new Date() ? end : new Date();
    await trx
      .updateTable('parent_premium_subscriptions')
      .set({
        status: 'active',
        plan_id: planId,
        current_period_end: new Date(base.getTime() + periodDays * 86_400_000),
        provider,
        provider_ref: providerRef,
      })
      .where('id', '=', subscriptionId)
      .execute();
  }

  /** The owner of a tutor / academy subscription row. */
  async tutorOfSubscription(
    trx: Transaction<DB>,
    subscriptionId: string,
  ): Promise<string | undefined> {
    const row = await trx
      .selectFrom('subscriptions')
      .select('tutor_id')
      .where('id', '=', subscriptionId)
      .executeTakeFirst();
    return row?.tutor_id;
  }

  async academyOfSubscription(
    trx: Transaction<DB>,
    subscriptionId: string,
  ): Promise<string | undefined> {
    const row = await trx
      .selectFrom('academy_subscriptions')
      .select('academy_id')
      .where('id', '=', subscriptionId)
      .executeTakeFirst();
    return row?.academy_id;
  }
}
