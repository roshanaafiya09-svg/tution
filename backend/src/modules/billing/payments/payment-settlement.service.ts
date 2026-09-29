import { Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB } from '../../../database/types';
import { PaymentsRepository, type PaymentRow } from './payments.repository';
import {
  PaymentSettlementRepository,
  type FeeRow,
} from './payment-settlement.repository';
import { PaymentLedgersRepository } from './payment-ledgers.repository';
import { SubscriptionCapacityRepository } from '../subscriptions/subscription-capacity.repository';
import {
  SUBSCRIPTION_PLANS,
  isPlanId,
  planBlocks,
} from '../subscriptions/plans';
import {
  ACADEMY_PERIOD_DAYS,
  ADDON_BLOCKS_PLAN_ID,
} from '../subscriptions/blocks';
import {
  PARENT_PREMIUM_PLANS,
  isParentPremiumPlanId,
} from '../parent-premium/plans';

export interface SettleOutcome {
  /** The capture was applied to its target (ledger / plan / booking). */
  applied: boolean;
  /** Minor units captured but NOT applied — a pending refund row for exactly
   *  this amount was written in the same transaction. */
  unappliedMinor: number;
  /** Set when a fee was credited — used for the parent/tutor notice after
   *  commit. */
  creditedFee?: FeeRow;
  target:
    | 'fee'
    | 'subscription'
    | 'parent_premium'
    | 'academy_subscription'
    | 'booking';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Applies a CAPTURED payment to whatever it was for, inside the caller's
 * transaction (audit H5/H8). Idempotent by construction: the caller only
 * gets here on the single `created|authorized|failed -> captured` transition,
 * which the payment row lock + guarded UPDATE allow exactly once.
 *
 * Whatever cannot be applied (fee already paid/waived, booking cancelled
 * while the payer was at checkout, a plan period that lapsed before an
 * add-on landed, …) is not silently dropped and not left as "captured with
 * no effect": a `pending` refund for exactly that amount is inserted in the
 * same transaction, so it is durable even if the process dies right after.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly settlement: PaymentSettlementRepository,
    private readonly ledgers: PaymentLedgersRepository,
    private readonly capacity: SubscriptionCapacityRepository,
  ) {}

  async settle(
    trx: Transaction<DB>,
    payment: PaymentRow,
    provider: string,
    providerPaymentId: string,
  ): Promise<SettleOutcome> {
    let outcome: SettleOutcome;

    if (payment.fee_ledger_id) {
      const { credited, fee } = await this.settlement.creditFee(
        trx,
        payment.fee_ledger_id,
        payment.amount_minor,
        `Paid online via ${provider} (payment ${payment.id})`,
      );
      outcome = {
        applied: credited > 0,
        unappliedMinor: payment.amount_minor - credited,
        creditedFee: fee,
        target: 'fee',
      };
    } else if (payment.booking_id) {
      const ok = await this.settlement.confirmBooking(trx, payment.booking_id);
      outcome = {
        applied: ok,
        unappliedMinor: ok ? 0 : payment.amount_minor,
        target: 'booking',
      };
    } else if (payment.parent_subscription_id) {
      const planId = payment.plan_id;
      if (!planId || !isParentPremiumPlanId(planId)) {
        outcome = this.unapplied(payment, 'parent_premium');
      } else {
        await this.settlement.extendParentPremium(
          trx,
          payment.parent_subscription_id,
          planId,
          PARENT_PREMIUM_PLANS[planId].periodDays,
          provider,
          providerPaymentId,
        );
        outcome = {
          applied: true,
          unappliedMinor: 0,
          target: 'parent_premium',
        };
      }
    } else if (payment.subscription_id) {
      const tutorId = await this.settlement.tutorOfSubscription(
        trx,
        payment.subscription_id,
      );
      outcome = tutorId
        ? await this.settleOwnerPlan(
            trx,
            payment,
            { kind: 'tutor', tutorId },
            provider,
            providerPaymentId,
            'subscription',
          )
        : this.unapplied(payment, 'subscription');
    } else if (payment.academy_subscription_id) {
      const academyId = await this.settlement.academyOfSubscription(
        trx,
        payment.academy_subscription_id,
      );
      outcome = academyId
        ? await this.settleOwnerPlan(
            trx,
            payment,
            { kind: 'academy', academyId },
            provider,
            providerPaymentId,
            'academy_subscription',
          )
        : this.unapplied(payment, 'academy_subscription');
    } else {
      outcome = this.unapplied(payment, 'fee');
    }

    if (outcome.applied) await this.payments.markSettled(trx, payment.id);

    if (outcome.unappliedMinor > 0) {
      // Durable, idempotent (the key is per payment), and counted against the
      // captured amount by the database itself.
      await this.ledgers.insertPendingRefund(trx, {
        paymentId: payment.id,
        amountMinor: outcome.unappliedMinor,
        reason: outcome.applied ? 'overpayment' : 'not_applied',
        idempotencyKey: unappliedRefundKey(payment.id),
      });
      this.logger.warn(
        `Payment ${payment.id}: ${outcome.unappliedMinor} of ${payment.amount_minor} ${payment.currency} could not be applied to its ${outcome.target}; refund queued.`,
      );
    }
    return outcome;
  }

  private unapplied(
    payment: PaymentRow,
    target: SettleOutcome['target'],
  ): SettleOutcome {
    return { applied: false, unappliedMinor: payment.amount_minor, target };
  }

  private async settleOwnerPlan(
    trx: Transaction<DB>,
    payment: PaymentRow,
    owner:
      | { kind: 'tutor'; tutorId: string }
      | { kind: 'academy'; academyId: string },
    provider: string,
    providerPaymentId: string,
    target: 'subscription' | 'academy_subscription',
  ): Promise<SettleOutcome> {
    // The row lock serialises this against enrollments and other purchases.
    const sub = await this.capacity.lockOwnerSubscription(trx, owner);

    // Mid-period add-on: more capacity NOW, the period does not change.
    if (payment.plan_id === ADDON_BLOCKS_PLAN_ID) {
      const updated = await this.capacity.addBlocks(
        trx,
        owner,
        payment.blocks ?? 0,
      );
      return updated && (payment.blocks ?? 0) > 0
        ? { applied: true, unappliedMinor: 0, target }
        : this.unapplied(payment, target);
    }

    // Period purchase (new or renewal).
    let periodDays: number;
    let blocks: number;
    if (owner.kind === 'tutor') {
      if (!payment.plan_id || !isPlanId(payment.plan_id)) {
        return this.unapplied(payment, target);
      }
      periodDays = SUBSCRIPTION_PLANS[payment.plan_id].periodDays;
      blocks = payment.blocks ?? planBlocks(payment.plan_id);
    } else {
      periodDays = ACADEMY_PERIOD_DAYS;
      blocks = payment.blocks ?? 1;
    }

    // Extend from whichever is later, now or the existing period end — an
    // early renewal must not discard time already paid for.
    const end = sub.current_period_end
      ? new Date(sub.current_period_end)
      : null;
    const base =
      sub.status === 'active' && end && end > new Date() ? end : new Date();
    await this.capacity.applyPeriodPurchase(trx, owner, {
      planId: payment.plan_id ?? 'academy_monthly',
      blocks,
      teacherFeatures: payment.teacher_features ?? 0,
      periodEnd: new Date(base.getTime() + periodDays * DAY_MS),
      provider,
      providerRef: providerPaymentId,
    });
    return { applied: true, unappliedMinor: 0, target };
  }
}

/** One refund row per payment for "captured but could not be applied". */
export function unappliedRefundKey(paymentId: string): string {
  return `unapplied:${paymentId}`;
}
