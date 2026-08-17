import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsRepository } from './payments.repository';
import { FeesRepository } from '../fees/fees.repository';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SUBSCRIPTION_PLANS, isPlanId } from '../subscriptions/plans';
import { ParentPremiumService } from '../parent-premium/parent-premium.service';
import {
  PARENT_PREMIUM_PLANS,
  isParentPremiumPlanId,
} from '../parent-premium/plans';
import { BookingsService } from '../../marketplace/bookings/bookings.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PAYMENTS_PROVIDER } from './payments-provider.interface';
import type { PaymentsProvider } from './payments-provider.interface';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import type { Selectable } from 'kysely';
import type { PaymentsTable } from '../../../database/types';

type PaymentRow = Selectable<PaymentsTable>;

/**
 * Four distinct money-in flows share one payments audit table (exactly
 * one of fee_ledger_id / subscription_id / parent_subscription_id /
 * booking_id set — migration 0014, extended to three-way by 0019, then
 * four-way by 0021):
 *  - Fee *collection*: a parent/student pays the tutor for tuition,
 *    settling one fee_ledger row (Phase 1's manual-tracking counterpart).
 *  - Subscription *purchase*: the tutor pays the platform for their own
 *    ₹499/999 plan (blueprint §5) — the "Razorpay subscriptions" piece
 *    that actually ends the 90-day trial, distinct from fee collection.
 *  - Parent premium *purchase*: a parent pays the platform for the
 *    ₹99–149/mo AI tier (blueprint §5/§10 Phase 3) — same shape as the
 *    tutor subscription purchase, different plan catalog and target.
 *  - Booking *purchase*: a student pays for a 1:1 marketplace booking
 *    (blueprint §5/§10 Phase 4) — the platform's take rate is already
 *    snapshotted on the booking row at creation time, not deducted here.
 * Order creation is flow-specific; capture (simulateCapture or the
 * webhook) is generic — it settles whichever side the payment is for.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly feesRepository: FeesRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly parentPremiumService: ParentPremiumService,
    private readonly bookingsService: BookingsService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
  ) {}

  async initiateFeeOrder(user: AccessTokenPayload, feeLedgerId: string) {
    const fee = await this.feesRepository.findById(feeLedgerId);
    if (!fee) throw new NotFoundException('Fee entry not found');
    await this.assertCanPayFee(user, fee.student_id);

    if (fee.status === 'paid' || fee.status === 'waived') {
      throw new BadRequestException(`This fee is already ${fee.status}`);
    }

    const outstandingMinor =
      fee.expected_minor - (fee.recorded_paid_minor ?? 0);
    if (outstandingMinor <= 0) {
      throw new BadRequestException('Nothing outstanding on this fee');
    }

    const payment = await this.repository.createForFee(
      fee.id,
      user.sub,
      outstandingMinor,
      fee.currency,
    );

    const order = await this.createOrderFor(
      payment.id,
      outstandingMinor,
      fee.currency,
    );
    this.analytics.capture(user.sub, 'payment_order_created', {
      feeLedgerId,
      amountMinor: outstandingMinor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Tutor-only — the trial-ending subscription purchase (blueprint §5). */
  async initiateSubscriptionOrder(user: AccessTokenPayload, planId: string) {
    if (!isPlanId(planId)) throw new BadRequestException('Unknown plan');
    const plan = SUBSCRIPTION_PLANS[planId];

    const subscription = await this.subscriptionsService.getOwnSubscription(
      user.sub,
    );

    const payment = await this.repository.createForSubscription(
      subscription.id,
      planId,
      user.sub,
      plan.priceMinor,
      'INR',
    );

    const order = await this.createOrderFor(payment.id, plan.priceMinor, 'INR');
    this.analytics.capture(user.sub, 'subscription_order_created', {
      planId,
      amountMinor: plan.priceMinor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Parent-only — the ₹99–149/mo AI premium purchase (blueprint §5/§10
   *  Phase 3), distinct from fee collection and the tutor's own
   *  subscription above. */
  async initiateParentPremiumOrder(user: AccessTokenPayload, planId: string) {
    if (!isParentPremiumPlanId(planId))
      throw new BadRequestException('Unknown plan');
    const plan = PARENT_PREMIUM_PLANS[planId];

    const subscription = await this.parentPremiumService.getOwnSubscription(
      user.sub,
    );

    const payment = await this.repository.createForParentPremium(
      subscription.id,
      planId,
      user.sub,
      plan.priceMinor,
      'INR',
    );

    const order = await this.createOrderFor(payment.id, plan.priceMinor, 'INR');
    this.analytics.capture(user.sub, 'parent_premium_order_created', {
      planId,
      amountMinor: plan.priceMinor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Student-only — a 1:1 marketplace booking purchase (blueprint
   *  §5/§10 Phase 4). amount_minor was already snapshotted (rate ×
   *  duration, take rate included) when the booking was created. */
  async initiateBookingOrder(user: AccessTokenPayload, bookingId: string) {
    const booking = await this.bookingsService.assertPayableByStudent(
      bookingId,
      user.sub,
    );

    const payment = await this.repository.createForBooking(
      booking.id,
      user.sub,
      booking.amount_minor,
      booking.currency,
    );

    const order = await this.createOrderFor(
      payment.id,
      booking.amount_minor,
      booking.currency,
    );
    this.analytics.capture(user.sub, 'booking_order_created', {
      bookingId,
      amountMinor: booking.amount_minor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Settles the refund a cancelled booking's refund_percent already
   *  decided (blueprint §10 Phase 4) — a separate step from cancel()
   *  itself, mirroring the existing order/capture split, since
   *  BookingsModule can't depend back on PaymentsService (BillingModule
   *  already imports BookingsModule the other way). */
  async processBookingCancellationRefund(
    user: AccessTokenPayload,
    bookingId: string,
  ) {
    const booking = await this.bookingsService.getForRefund(bookingId);
    if (booking.student_id !== user.sub) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status !== 'cancelled' || booking.refund_percent === null) {
      throw new BadRequestException('This booking has no refund to process');
    }
    if (booking.refund_percent === 0) {
      throw new BadRequestException('No refund is owed for this cancellation');
    }

    const payment = await this.repository.findByBookingId(bookingId);
    if (!payment || !payment.provider_payment_id) {
      throw new NotFoundException('No captured payment found for this booking');
    }
    if (payment.status !== 'captured') {
      throw new BadRequestException(
        `Payment is ${payment.status}, not captured`,
      );
    }

    const refundAmountMinor = Math.round(
      (payment.amount_minor * booking.refund_percent) / 100,
    );
    const { refundId } = await this.provider.simulateRefund(
      payment.provider_payment_id,
      refundAmountMinor,
    );
    const refunded = await this.repository.markRefunded(payment.id);

    this.analytics.capture(user.sub, 'booking_refund_processed', {
      bookingId,
      refundAmountMinor,
      refundPercent: booking.refund_percent,
      provider: this.provider.name,
    });
    return { ...refunded, refundId, refundAmountMinor };
  }

  private async createOrderFor(
    paymentId: string,
    amountMinor: number,
    currency: string,
  ) {
    const { orderId } = await this.provider.createOrder({
      amountMinor,
      currency,
      receipt: paymentId,
    });
    return this.repository.setOrder(paymentId, orderId, this.provider.name);
  }

  /** Dev/test path — see PaymentsProvider.simulateCapture. The real
   *  provider already rejects this, but that's contingent on Razorpay
   *  keys actually being configured — this explicit environment check
   *  is defense-in-depth so a production deploy that's ops-misconfigured
   *  to be missing those keys (and so silently gets MockPaymentsProvider,
   *  which always succeeds) still can't have any authenticated user mark
   *  their own payment "paid" with no money moving. Production capture
   *  is webhook-driven, full stop. */
  async simulateCapture(user: AccessTokenPayload, paymentId: string) {
    this.assertNotProduction();
    const payment = await this.repository.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.payer_id !== user.sub) {
      throw new ForbiddenException('Not your payment');
    }
    if (payment.status !== 'created' || !payment.provider_order_id) {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const { paymentId: providerPaymentId } =
      await this.provider.simulateCapture(payment.provider_order_id);
    return this.settleCapture(payment, providerPaymentId);
  }

  async handleWebhook(rawBody: string, signature: string) {
    const result = this.provider.verifyWebhook(rawBody, signature);
    if (!result) throw new ForbiddenException('Invalid webhook signature');

    const payment = await this.repository.findByProviderOrderId(
      result.providerOrderId,
    );
    if (!payment) throw new NotFoundException('No payment for this order');

    if (result.status === 'failed') {
      // markFailed only affects a row still in 'created' — a failed
      // event delivered (or replayed) after the payment already
      // captured/refunded must not flip its status backwards.
      const failed = await this.repository.markFailed(
        payment.id,
        'Provider reported payment.failed',
      );
      return failed ?? (await this.repository.findById(payment.id)) ?? payment;
    }

    // The signature only proves the payload came from Razorpay, not
    // that it's the payload for *this* order — cross-check the amount
    // it reports capturing against what this payment row was actually
    // created for, so a captured event can never settle a fee/
    // subscription/booking for a different amount than was charged.
    if (result.amountMinor !== payment.amount_minor) {
      throw new BadRequestException(
        `Webhook amount ${result.amountMinor} does not match payment ${payment.id}'s expected ${payment.amount_minor}`,
      );
    }
    return this.settleCapture(payment, result.providerPaymentId);
  }

  private async settleCapture(payment: PaymentRow, providerPaymentId: string) {
    const captured = await this.repository.markCaptured(
      payment.id,
      providerPaymentId,
    );
    if (!captured) {
      // Razorpay delivers webhooks at-least-once, and this path is also
      // shared with simulateCapture — markCaptured only transitions a
      // payment still in 'created', so a duplicate delivery (or a
      // concurrent double-call) lands here instead of re-crediting the
      // fee/subscription/parent-premium/booking a second time. Return
      // the payment's current state as-is; this is the idempotent
      // no-op, not an error.
      return (await this.repository.findById(payment.id)) ?? payment;
    }

    if (payment.fee_ledger_id) {
      await this.settleFee(
        payment.fee_ledger_id,
        payment.amount_minor,
        captured.provider,
        payment.id,
      );
    } else if (
      payment.subscription_id &&
      payment.plan_id &&
      isPlanId(payment.plan_id)
    ) {
      await this.settleSubscription(
        payment.subscription_id,
        payment.plan_id,
        captured.provider,
        providerPaymentId,
      );
    } else if (
      payment.parent_subscription_id &&
      payment.plan_id &&
      isParentPremiumPlanId(payment.plan_id)
    ) {
      await this.settleParentPremium(
        payment.parent_subscription_id,
        payment.plan_id,
        captured.provider,
        providerPaymentId,
      );
    } else if (payment.booking_id) {
      await this.bookingsService.markConfirmed(payment.booking_id);
    }

    this.analytics.capture(captured.payer_id, 'payment_captured', {
      target: payment.fee_ledger_id
        ? 'fee'
        : payment.subscription_id
          ? 'subscription'
          : payment.parent_subscription_id
            ? 'parent_premium'
            : 'booking',
      amountMinor: payment.amount_minor,
      provider: captured.provider,
    });
    return captured;
  }

  private async settleFee(
    feeLedgerId: string,
    amountMinor: number,
    provider: string,
    paymentId: string,
  ) {
    const fee = await this.feesRepository.findById(feeLedgerId);
    if (!fee) return;

    const newRecordedMinor = (fee.recorded_paid_minor ?? 0) + amountMinor;
    const status = newRecordedMinor >= fee.expected_minor ? 'paid' : 'partial';
    await this.feesRepository.recordPayment(
      feeLedgerId,
      newRecordedMinor,
      status,
      `Paid online via ${provider} (payment ${paymentId})`,
    );
  }

  /** Extends from whichever is later, now or the existing
   *  current_period_end — an early renewal (before the current period
   *  actually lapses) must not discard whatever time is left on it. */
  private async settleSubscription(
    subscriptionId: string,
    planId: keyof typeof SUBSCRIPTION_PLANS,
    provider: string,
    providerPaymentId: string,
  ) {
    const plan = SUBSCRIPTION_PLANS[planId];
    const existing =
      await this.subscriptionsService.findSubscriptionById(subscriptionId);
    const existingEnd = existing?.current_period_end
      ? new Date(existing.current_period_end)
      : null;
    const base =
      existingEnd && existingEnd > new Date() ? existingEnd : new Date();
    const currentPeriodEnd = new Date(
      base.getTime() + plan.periodDays * 24 * 60 * 60 * 1000,
    );
    return this.subscriptionsService.activatePlan(
      subscriptionId,
      planId,
      currentPeriodEnd,
      provider,
      providerPaymentId,
    );
  }

  /** Same "extend from whichever is later" logic as settleSubscription —
   *  an early renewal must not discard time left on the current period. */
  private async settleParentPremium(
    parentSubscriptionId: string,
    planId: keyof typeof PARENT_PREMIUM_PLANS,
    provider: string,
    providerPaymentId: string,
  ) {
    const plan = PARENT_PREMIUM_PLANS[planId];
    const existing =
      await this.parentPremiumService.findSubscriptionById(
        parentSubscriptionId,
      );
    const existingEnd = existing?.current_period_end
      ? new Date(existing.current_period_end)
      : null;
    const base =
      existingEnd && existingEnd > new Date() ? existingEnd : new Date();
    const currentPeriodEnd = new Date(
      base.getTime() + plan.periodDays * 24 * 60 * 60 * 1000,
    );
    return this.parentPremiumService.activatePlan(
      parentSubscriptionId,
      planId,
      currentPeriodEnd,
      provider,
      providerPaymentId,
    );
  }

  private async assertCanPayFee(
    user: AccessTokenPayload,
    studentId: string,
  ): Promise<void> {
    if (user.roles.includes('student') && user.sub === studentId) return;
    if (user.roles.includes('parent')) {
      const link = await this.parentLinksRepository.findByParentAndStudent(
        user.sub,
        studentId,
      );
      if (link?.status === 'active') return;
    }
    throw new ForbiddenException('You cannot pay this fee');
  }

  private assertNotProduction(): void {
    if (this.config.get<string>('app.nodeEnv') === 'production') {
      throw new BadRequestException(
        'Payment capture happens via the Razorpay webhook in production, not this endpoint.',
      );
    }
  }
}
