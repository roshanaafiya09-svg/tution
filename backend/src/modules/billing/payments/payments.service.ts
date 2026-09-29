import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transaction } from 'kysely';
import type { DB } from '../../../database/types';
import { ErrorCode } from '../../../common/http/error-codes';
import {
  PaymentsRepository,
  type OpenOrderSpec,
  type PaymentRow,
  type PaymentTarget,
} from './payments.repository';
import { PaymentLedgersRepository } from './payment-ledgers.repository';
import {
  PaymentSettlementService,
  unappliedRefundKey,
  type SettleOutcome,
} from './payment-settlement.service';
import { PaymentRefundsService } from './payment-refunds.service';
import { AcademyBillingRepository } from './academy-billing.repository';
import { FeesRepository } from '../fees/fees.repository';
import { FeeNotificationsService } from '../fees/fee-notifications.service';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import { SubscriptionCapacityRepository } from '../subscriptions/subscription-capacity.repository';
import { SubscriptionCapacityService } from '../subscriptions/subscription-capacity.service';
import { isPlanId, planCadence } from '../subscriptions/plans';
import {
  ACADEMY_BLOCK_PRICE_MINOR,
  ADDON_BLOCKS_PLAN_ID,
  EXTRA_BLOCK_PRICE_MINOR,
  academyOrderShape,
  individualOrderShape,
} from '../subscriptions/blocks';
import { ParentPremiumService } from '../parent-premium/parent-premium.service';
import {
  PARENT_PREMIUM_PLANS,
  isParentPremiumPlanId,
} from '../parent-premium/plans';
import { BookingsService } from '../../marketplace/bookings/bookings.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import {
  PAYMENTS_PROVIDER,
  isPaymentEvent,
  isRefundEvent,
} from './payments-provider.interface';
import type {
  PaymentsProvider,
  RefundProviderEvent,
} from './payments-provider.interface';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';

/**
 * Money-in flows share one `payments` table (exactly one target column set —
 * migration 0046 — and at most ONE open order per target):
 *  - fee collection: a parent/student pays a teacher's or academy's fee;
 *  - tutor subscription purchase (a plan period, or extra blocks mid-period);
 *  - academy subscription purchase (blocks + per-teacher fee);
 *  - parent premium purchase;
 *  - marketplace booking purchase.
 *
 * State machine (guarded by a database trigger AND guarded UPDATEs):
 *   created -> authorized -> captured -> refunded
 *      \___________\____> failed ---(late success)---> captured
 * A capture is applied to its target in the SAME transaction as the
 * transition and stamped `settled_at`; whatever cannot be applied becomes a
 * durable pending refund. Provider webhooks are recorded under a unique
 * event id, so replays and out-of-order deliveries change nothing.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly ledgers: PaymentLedgersRepository,
    private readonly settlement: PaymentSettlementService,
    private readonly refunds: PaymentRefundsService,
    private readonly academies: AcademyBillingRepository,
    private readonly feesRepository: FeesRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly capacityRepository: SubscriptionCapacityRepository,
    private readonly capacity: SubscriptionCapacityService,
    private readonly parentPremiumService: ParentPremiumService,
    private readonly bookingsService: BookingsService,
    private readonly analytics: AnalyticsService,
    private readonly feeNotifications: FeeNotificationsService,
    private readonly config: ConfigService,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
  ) {}

  // ======================================================================
  // Orders
  // ======================================================================

  /**
   * The single order-creation path. In ONE transaction: lock the target row
   * (so concurrent requests for the same fee/booking/plan queue), then
   *   - an open order with an identical spec from the same payer is REUSED
   *     (double-click / retry gets the same order back, not a second charge);
   *   - a different open order is retired ('superseded') first;
   *   - otherwise a new one is created at the provider.
   * The provider call happens inside the transaction on purpose: it is one
   * short call, and keeping it there means a provider failure leaves no
   * half-created row behind.
   */
  private async openOrder(
    target: PaymentTarget,
    payerId: string,
    resolveSpec: (
      trx: Transaction<DB>,
    ) => Promise<Omit<OpenOrderSpec, 'payerId'>>,
  ): Promise<PaymentRow> {
    return this.repository.transaction(async (trx) => {
      await this.repository.lockTarget(trx, target);
      const spec: OpenOrderSpec = { payerId, ...(await resolveSpec(trx)) };

      const open = await this.repository.findOpenForTarget(trx, target);
      if (open) {
        const same =
          open.provider_order_id !== null &&
          open.payer_id === spec.payerId &&
          open.amount_minor === spec.amountMinor &&
          open.currency === spec.currency &&
          (open.plan_id ?? null) === (spec.planId ?? null) &&
          (open.blocks ?? null) === (spec.blocks ?? null) &&
          (open.teacher_features ?? null) === (spec.teacherFeatures ?? null);
        if (same) return open;
        await this.repository.markFailed(trx, open.id, 'superseded');
      }

      const payment = await this.repository.createOpen(trx, target, spec);
      const { orderId } = await this.provider.createOrder({
        amountMinor: spec.amountMinor,
        currency: spec.currency,
        receipt: payment.id,
      });
      return this.repository.setOrder(
        trx,
        payment.id,
        orderId,
        this.provider.name,
      );
    });
  }

  async initiateFeeOrder(user: AccessTokenPayload, feeLedgerId: string) {
    const fee = await this.feesRepository.findById(feeLedgerId);
    if (!fee) throw new NotFoundException('Fee entry not found');
    await this.assertCanPayFee(user, fee.student_id);

    const order = await this.openOrder(
      { kind: 'fee', id: fee.id },
      user.sub,
      async (trx) => {
        // Re-read under the target lock: the outstanding amount is decided
        // from the row as it is NOW, not as it was when the request arrived.
        const current = await trx
          .selectFrom('fee_ledger')
          .selectAll()
          .where('id', '=', fee.id)
          .executeTakeFirstOrThrow();
        if (current.status === 'paid' || current.status === 'waived') {
          throw new BadRequestException(
            `This fee is already ${current.status}`,
          );
        }
        const outstanding =
          current.expected_minor - (current.recorded_paid_minor ?? 0);
        if (outstanding <= 0) {
          throw new BadRequestException('Nothing outstanding on this fee');
        }
        return { amountMinor: outstanding, currency: current.currency };
      },
    );
    this.analytics.capture(user.sub, 'payment_order_created', {
      feeLedgerId,
      amountMinor: order.amount_minor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Tutor-only — a plan period (plus optional extra blocks). */
  async initiateSubscriptionOrder(
    user: AccessTokenPayload,
    planId: string,
    extraBlocks = 0,
  ) {
    if (!isPlanId(planId)) throw new BadRequestException('Unknown plan');
    const shape = individualOrderShape(planId, extraBlocks);
    const owner = { kind: 'tutor', tutorId: user.sub } as const;
    // You cannot renew into a capacity smaller than your current usage.
    await this.capacity.assertOrderCoversUsage(owner, shape.totalBlocks);

    const sub = await this.capacityRepository.getOrStart(owner);
    const order = await this.openOrder(
      { kind: 'subscription', id: sub.id },
      user.sub,
      async () => ({
        amountMinor: shape.amountMinor,
        currency: 'INR',
        planId,
        blocks: shape.totalBlocks,
      }),
    );
    this.analytics.capture(user.sub, 'subscription_order_created', {
      planId,
      blocks: shape.totalBlocks,
      amountMinor: shape.amountMinor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Tutor-only — more 25-student blocks NOW, inside a live paid period. */
  async initiateAddBlocksOrder(user: AccessTokenPayload, blocks: number) {
    const owner = { kind: 'tutor', tutorId: user.sub } as const;
    const sub = await this.capacityRepository.getOrStart(owner);
    this.assertLivePaidPeriod(sub, 'plan');
    const cadence = isPlanId(sub.plan_id)
      ? planCadence(sub.plan_id)
      : 'monthly';
    const amountMinor = blocks * EXTRA_BLOCK_PRICE_MINOR[cadence];
    return this.openOrder(
      { kind: 'subscription', id: sub.id },
      user.sub,
      async () => ({
        amountMinor,
        currency: 'INR',
        planId: ADDON_BLOCKS_PLAN_ID,
        blocks,
      }),
    );
  }

  /** Academy-owner-only — a monthly period: N blocks + the per-teacher fee.
   *  The academy is derived from the caller, never from the request. */
  async initiateAcademySubscriptionOrder(
    user: AccessTokenPayload,
    blocks: number,
  ) {
    const academy = await this.requireOwnAcademy(user.sub);
    const owner = { kind: 'academy', academyId: academy.id } as const;
    await this.capacity.assertOrderCoversUsage(owner, blocks);
    const teachers = await this.capacityRepository.countActiveTeachers(
      academy.id,
    );
    const shape = academyOrderShape(blocks, teachers);

    const sub = await this.capacityRepository.getOrStart(owner);
    return this.openOrder(
      { kind: 'academy_subscription', id: sub.id },
      user.sub,
      async () => ({
        amountMinor: shape.amountMinor,
        currency: 'INR',
        planId: 'academy_monthly',
        blocks: shape.blocks,
        teacherFeatures: shape.teacherFeatures,
      }),
    );
  }

  /** Academy-owner-only — extra blocks NOW inside a live paid period. */
  async initiateAcademyAddBlocksOrder(
    user: AccessTokenPayload,
    blocks: number,
  ) {
    const academy = await this.requireOwnAcademy(user.sub);
    const sub = await this.capacityRepository.getOrStart({
      kind: 'academy',
      academyId: academy.id,
    });
    this.assertLivePaidPeriod(sub, 'academy plan');
    return this.openOrder(
      { kind: 'academy_subscription', id: sub.id },
      user.sub,
      async () => ({
        amountMinor: blocks * ACADEMY_BLOCK_PRICE_MINOR,
        currency: 'INR',
        planId: ADDON_BLOCKS_PLAN_ID,
        blocks,
        teacherFeatures: 0,
      }),
    );
  }

  /** Parent-only — the AI premium purchase. */
  async initiateParentPremiumOrder(user: AccessTokenPayload, planId: string) {
    if (!isParentPremiumPlanId(planId)) {
      throw new BadRequestException('Unknown plan');
    }
    const plan = PARENT_PREMIUM_PLANS[planId];
    const subscription = await this.parentPremiumService.getOwnSubscription(
      user.sub,
    );
    const order = await this.openOrder(
      { kind: 'parent_subscription', id: subscription.id },
      user.sub,
      async () => ({ amountMinor: plan.priceMinor, currency: 'INR', planId }),
    );
    this.analytics.capture(user.sub, 'parent_premium_order_created', {
      planId,
      amountMinor: plan.priceMinor,
      provider: this.provider.name,
    });
    return order;
  }

  /** Student-only — a 1:1 marketplace booking purchase. */
  async initiateBookingOrder(user: AccessTokenPayload, bookingId: string) {
    const booking = await this.bookingsService.assertPayableByStudent(
      bookingId,
      user.sub,
    );
    const order = await this.openOrder(
      { kind: 'booking', id: booking.id },
      user.sub,
      async (trx) => {
        // Re-check under the lock: a booking cancelled a moment ago is not
        // payable, however the request raced.
        const current = await trx
          .selectFrom('bookings')
          .select(['status', 'amount_minor', 'currency'])
          .where('id', '=', booking.id)
          .executeTakeFirstOrThrow();
        if (current.status !== 'pending_payment') {
          throw new BadRequestException(`Booking is already ${current.status}`);
        }
        return {
          amountMinor: current.amount_minor,
          currency: current.currency,
        };
      },
    );
    this.analytics.capture(user.sub, 'booking_order_created', {
      bookingId,
      amountMinor: order.amount_minor,
      provider: this.provider.name,
    });
    return order;
  }

  // ======================================================================
  // Capture (dev simulate + webhook share ONE path)
  // ======================================================================

  /** Dev/test path. Refused in production regardless of which provider is
   *  wired; production capture is webhook-driven, full stop. */
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
    const { payment: result, outcome } = await this.repository.transaction(
      (trx) => this.applyCapture(trx, payment.id, providerPaymentId),
    );
    await this.afterCapture(result, outcome);
    return result;
  }

  /**
   * Applies one capture inside the caller's transaction. Idempotent: the
   * row lock + guarded `-> captured` transition mean a duplicate or
   * concurrent delivery finds the payment already captured and returns
   * without touching the ledger.
   */
  private async applyCapture(
    trx: Transaction<DB>,
    paymentId: string,
    providerPaymentId: string,
    expectedAmountMinor?: number,
  ): Promise<{ payment: PaymentRow; outcome: SettleOutcome | null }> {
    const locked = await this.repository.lockById(trx, paymentId);
    if (!locked) throw new NotFoundException('Payment not found');

    if (
      expectedAmountMinor !== undefined &&
      expectedAmountMinor !== locked.amount_minor
    ) {
      throw new BadRequestException(
        `Webhook amount ${expectedAmountMinor} does not match payment ${locked.id}'s expected ${locked.amount_minor}`,
      );
    }

    if (locked.status === 'captured' || locked.status === 'refunded') {
      if (locked.provider_payment_id !== providerPaymentId) {
        this.logger.error(
          `Payment ${locked.id} is already captured as ${locked.provider_payment_id}, ` +
            `but the provider also reports ${providerPaymentId} for the same order — ` +
            `a SECOND provider payment exists and needs manual review/refund.`,
        );
      }
      return { payment: locked, outcome: null };
    }

    const captured = await this.repository.markCaptured(
      trx,
      locked.id,
      providerPaymentId,
    );
    if (!captured) return { payment: locked, outcome: null };

    const outcome = await this.settlement.settle(
      trx,
      captured,
      captured.provider,
      providerPaymentId,
    );
    const latest = (await this.repository.findById(captured.id, trx))!;
    return { payment: latest, outcome };
  }

  /** Everything that must NOT run inside the transaction. */
  private async afterCapture(
    payment: PaymentRow,
    outcome: SettleOutcome | null,
  ) {
    if (!outcome) return;
    if (outcome.creditedFee) {
      await this.feeNotifications
        .notifyPaymentRecorded(outcome.creditedFee, {
          source: 'online',
          payerId: payment.payer_id,
        })
        .catch((err) =>
          this.logger.warn(
            `Fee notice failed for ${payment.id}: ${String(err)}`,
          ),
        );
    }
    this.analytics.capture(payment.payer_id, 'payment_captured', {
      target: outcome.target,
      amountMinor: payment.amount_minor,
      provider: payment.provider,
      applied: outcome.applied,
    });
    if (outcome.unappliedMinor > 0) {
      // The pending refund row already exists (written with the capture).
      // Try to complete it now; if this fails the reconciliation job does.
      await this.refunds
        .refund({
          paymentId: payment.id,
          amountMinor: outcome.unappliedMinor,
          idempotencyKey: unappliedRefundKey(payment.id),
          reason: outcome.applied ? 'overpayment' : 'not_applied',
        })
        .catch((err) =>
          this.logger.warn(
            `Refund of unapplied ${outcome.unappliedMinor} on ${payment.id} left for reconciliation: ${String(err)}`,
          ),
        );
    }
  }

  // ======================================================================
  // Webhook
  // ======================================================================

  async handleWebhook(
    rawBody: string,
    signature: string,
    eventIdHeader?: string,
  ) {
    const event = this.provider.verifyWebhook(
      rawBody,
      signature,
      eventIdHeader,
    );
    if (!event) throw new ForbiddenException('Invalid webhook signature');

    const result = await this.repository.transaction(async (trx) => {
      const fresh = await this.ledgers.recordEvent(trx, {
        provider: this.provider.name,
        eventId: event.eventId,
        type:
          event.type === 'ignored' ? event.rawType || 'ignored' : event.type,
        providerOrderId:
          'providerOrderId' in event ? event.providerOrderId : null,
        providerPaymentId:
          'providerPaymentId' in event ? event.providerPaymentId : null,
      });
      // A replay: recorded before, fully processed then. Do nothing.
      if (!fresh)
        return { status: 'duplicate' as const, payment: null, outcome: null };

      if (event.type === 'ignored') {
        return { status: 'ignored' as const, payment: null, outcome: null };
      }

      if (isRefundEvent(event)) {
        await this.applyRefundEvent(trx, event);
        return {
          status: 'refund_event' as const,
          payment: null,
          outcome: null,
        };
      }
      if (!isPaymentEvent(event)) {
        return { status: 'ignored' as const, payment: null, outcome: null };
      }

      const payment = await this.repository.findByProviderOrderId(
        event.providerOrderId,
        trx,
      );
      if (!payment) {
        // Signed and well-formed, but not an order of ours (another
        // integration on the same account). Recorded; nothing to do, and a
        // 200 stops the provider retrying it for days.
        this.logger.warn(
          `Webhook ${event.eventId}: no payment for order ${event.providerOrderId}`,
        );
        return {
          status: 'unknown_order' as const,
          payment: null,
          outcome: null,
        };
      }
      await this.ledgers.attachPaymentToEvent(
        trx,
        this.provider.name,
        event.eventId,
        payment.id,
      );

      if (event.type === 'captured') {
        const applied = await this.applyCapture(
          trx,
          payment.id,
          event.providerPaymentId,
          event.amountMinor,
        );
        return { status: 'captured' as const, ...applied };
      }
      if (event.type === 'authorized') {
        await this.repository.markAuthorized(trx, payment.id);
      } else {
        // 'failed' only ever moves an OPEN payment; a captured/refunded one
        // is untouched, so an out-of-order failure cannot undo a success.
        await this.repository.markFailed(
          trx,
          payment.id,
          'Provider reported payment.failed',
        );
      }
      const latest = await this.repository.findById(payment.id, trx);
      return { status: event.type, payment: latest ?? null, outcome: null };
    });

    if (result.payment) await this.afterCapture(result.payment, result.outcome);
    return { received: true, status: result.status };
  }

  /** A provider-side refund result: confirm or fail OUR ledger row, or —
   *  for a refund issued outside this system (e.g. the provider dashboard) —
   *  record it so balances stay truthful. */
  private async applyRefundEvent(
    trx: Transaction<DB>,
    event: RefundProviderEvent,
  ): Promise<void> {
    const known = await this.ledgers.findRefundByProviderId(
      event.providerRefundId,
      trx,
    );
    if (known) {
      if (event.type === 'refund_processed') {
        await this.ledgers.markRefundSucceeded(
          trx,
          known.id,
          event.providerRefundId,
        );
      } else if (known.status === 'pending') {
        await this.ledgers.markRefundFailed(
          known.id,
          'Provider reported refund.failed',
          trx,
        );
      }
      return;
    }
    if (event.type !== 'refund_processed') return;
    const payment = await this.repository.findByProviderPaymentId(
      event.providerPaymentId,
      trx,
    );
    if (!payment) return;
    try {
      const row = await this.ledgers.insertPendingRefund(trx, {
        paymentId: payment.id,
        amountMinor: event.amountMinor,
        reason: 'provider_dashboard',
        idempotencyKey: `provider:${event.providerRefundId}`,
      });
      await this.ledgers.markRefundSucceeded(
        trx,
        row.id,
        event.providerRefundId,
      );
    } catch (err) {
      this.logger.error(
        `Provider refund ${event.providerRefundId} on payment ${payment.id} could not be recorded (${String(err)}) — needs manual reconciliation.`,
      );
    }
  }

  // ======================================================================
  // Refund of a cancelled booking (idempotent — audit H10)
  // ======================================================================

  /**
   * Settles the refund a cancelled booking's `refund_percent` already
   * decided. Safe to call any number of times, concurrently or after a
   * timeout: the refund is keyed on the booking, so it is created once, sent
   * to the provider once, and every later call returns the same result.
   */
  async processBookingCancellationRefund(
    user: AccessTokenPayload,
    bookingId: string,
  ) {
    const booking = await this.bookingsService.getForRefund(bookingId);
    if (booking.student_id !== user.sub) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status !== 'cancelled' || booking.refund_percent === null) {
      throw new HttpException(
        {
          error: 'BookingNotRefundable',
          code: ErrorCode.BOOKING_NOT_REFUNDABLE,
          message: 'This booking has no refund to process',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (booking.refund_percent === 0) {
      throw new HttpException(
        {
          error: 'BookingNotRefundable',
          code: ErrorCode.BOOKING_NOT_REFUNDABLE,
          message: 'No refund is owed for this cancellation',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payment = await this.repository.findCollectedForBooking(bookingId);
    if (!payment || !payment.provider_payment_id) {
      throw new NotFoundException('No captured payment found for this booking');
    }

    // Integer math, rounding half up — deterministic, and never above the
    // captured amount because refund_percent is constrained to 0..100.
    const amountMinor = Math.floor(
      (payment.amount_minor * booking.refund_percent + 50) / 100,
    );
    const {
      refund,
      payment: after,
      alreadyDone,
    } = await this.refunds.refund({
      paymentId: payment.id,
      amountMinor,
      idempotencyKey: `booking-cancel:${bookingId}`,
      reason: 'booking_cancelled',
    });
    if (!alreadyDone) {
      this.analytics.capture(user.sub, 'booking_refund_processed', {
        bookingId,
        refundAmountMinor: amountMinor,
        refundPercent: booking.refund_percent,
        provider: this.provider.name,
      });
    }
    return {
      ...after,
      refundId: refund.provider_refund_id,
      refundAmountMinor: refund.amount_minor,
    };
  }

  // ======================================================================
  // Status (what the UI polls after checkout)
  // ======================================================================

  /** The payer's own view of a payment — never trusts the client's idea of
   *  whether it succeeded: a created order is NOT a paid one. */
  async getStatusForPayer(user: AccessTokenPayload, paymentId: string) {
    const payment = await this.repository.findById(paymentId);
    if (!payment || payment.payer_id !== user.sub) {
      throw new NotFoundException('Payment not found');
    }
    return {
      id: payment.id,
      status: payment.status,
      amountMinor: payment.amount_minor,
      refundedMinor: payment.refunded_minor,
      currency: payment.currency,
      settled: payment.settled_at !== null,
      failureReason: payment.failure_reason,
    };
  }

  // ======================================================================
  // Guards
  // ======================================================================

  private assertLivePaidPeriod(
    sub: { status: string; current_period_end: Date | null | string },
    what: string,
  ) {
    const end = sub.current_period_end
      ? new Date(sub.current_period_end)
      : null;
    if (sub.status !== 'active' || !end || end <= new Date()) {
      throw new BadRequestException(
        `Extra blocks can only be added inside a paid ${what} period — purchase or renew a ${what} first.`,
      );
    }
  }

  private async requireOwnAcademy(userId: string) {
    const academy = await this.academies.findByOwner(userId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account');
    }
    return academy;
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
