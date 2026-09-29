import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/http/error-codes';
import { PaymentsRepository, type PaymentRow } from './payments.repository';
import {
  PaymentLedgersRepository,
  type RefundRow,
} from './payment-ledgers.repository';
import { PAYMENTS_PROVIDER } from './payments-provider.interface';
import type { PaymentsProvider } from './payments-provider.interface';

/** Distinguishes "the provider's outcome could not be determined" from a
 *  real refund id — a plain string literal collapses into `string` and
 *  can't be told apart at the type level, so this uses a unique symbol. */
const AMBIGUOUS = Symbol('ambiguous-refund-outcome');

export interface RefundInput {
  paymentId: string;
  amountMinor: number;
  /** Same key => same refund, however many times / however concurrently the
   *  caller asks. Derive it from the business event (e.g. the booking being
   *  cancelled), never from a per-request value. */
  idempotencyKey: string;
  reason: string;
}

export interface RefundOutcome {
  refund: RefundRow;
  payment: PaymentRow;
  /** True when this call found the refund already done (a repeat). */
  alreadyDone: boolean;
}

/** A dispatch claim older than this is presumed dead (its owner crashed). */
export const DISPATCH_STALE_SECONDS = 120;
/** How long a caller that did NOT win the claim waits for the winner. */
const WAIT_FOR_OWNER_MS = 8_000;
const POLL_MS = 100;

/**
 * The only place money is ever handed back (audit H10 / H5 / H8).
 *
 *  Phase A (one transaction, payment row locked): decide. Reuse the refund
 *    for this idempotency key, or validate + insert a `pending` one. The
 *    database independently refuses a refund total above the captured amount.
 *  Phase B: exactly ONE caller — the one that atomically claims the dispatch
 *    — talks to the provider. Everyone else waits for its result instead of
 *    also calling (a provider receipt is not unique, so two calls could be
 *    two real refunds). A claimed-before attempt, or an ambiguous error, is
 *    always preceded by "does a refund with our receipt already exist?".
 *  Phase C (one transaction): record the provider's refund id; the refund
 *    triggers keep payments.refunded_minor / status in step.
 */
@Injectable()
export class PaymentRefundsService {
  private readonly logger = new Logger(PaymentRefundsService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly ledgers: PaymentLedgersRepository,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
  ) {}

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new BadRequestException('Refund amount must be a positive integer');
    }

    // ---- Phase A ---------------------------------------------------------
    const decided = await this.payments.transaction(async (trx) => {
      const payment = await this.payments.lockById(trx, input.paymentId);
      if (!payment) throw new NotFoundException('Payment not found');

      const existing = await this.ledgers.findRefundByKey(
        input.idempotencyKey,
        trx,
      );
      if (existing) {
        if (existing.payment_id !== payment.id) {
          throw new BadRequestException(
            'That refund reference belongs to a different payment',
          );
        }
        if (existing.status === 'succeeded') {
          return { payment, refund: existing, done: true };
        }
        const refund =
          existing.status === 'failed'
            ? ((await this.ledgers.resetToPending(trx, existing.id)) ??
              existing)
            : existing;
        return { payment, refund, done: false };
      }

      if (payment.status !== 'captured') {
        throw new HttpException(
          {
            error: 'PaymentNotRefundable',
            code: ErrorCode.BOOKING_NOT_REFUNDABLE,
            message: `Payment is ${payment.status}, not captured — nothing to refund.`,
          },
          HttpStatus.CONFLICT,
        );
      }
      const committed = await this.ledgers.committedRefundMinor(
        payment.id,
        trx,
      );
      if (committed + input.amountMinor > payment.amount_minor) {
        throw new HttpException(
          {
            error: 'RefundExceedsCaptured',
            code: ErrorCode.REFUND_EXCEEDS_CAPTURED,
            message: `Refunding ${input.amountMinor} would exceed what was captured (${payment.amount_minor}; ${committed} already refunded or refunding).`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const refund = await this.ledgers.insertPendingRefund(trx, {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
      return { payment, refund, done: false };
    });

    if (decided.done) {
      return {
        refund: decided.refund,
        payment: (await this.payments.findById(decided.payment.id))!,
        alreadyDone: true,
      };
    }

    // ---- Phase B + C -------------------------------------------------------
    return this.dispatch(decided.payment.id, decided.refund.id);
  }

  /**
   * Drives ONE pending refund to completion. Also used by the reconciliation
   * job for refunds whose original caller never finished.
   */
  async dispatch(paymentId: string, refundId: string): Promise<RefundOutcome> {
    const deadline = Date.now() + WAIT_FOR_OWNER_MS;
    for (;;) {
      const claim = await this.ledgers.claimDispatch(
        refundId,
        DISPATCH_STALE_SECONDS,
      );
      if (claim) {
        const payment = (await this.payments.findById(paymentId))!;
        const providerRefundId = await this.callProvider(
          payment,
          claim,
          claim.dispatch_attempts > 1,
        );
        return this.finish(paymentId, refundId, providerRefundId);
      }

      // Someone else owns the provider call: wait for their result.
      const current = await this.ledgers.findRefundById(refundId);
      if (!current) throw new NotFoundException('Refund not found');
      if (current.status === 'succeeded') {
        return {
          refund: current,
          payment: (await this.payments.findById(paymentId))!,
          alreadyDone: true,
        };
      }
      if (current.status === 'failed') {
        throw new BadRequestException(
          current.failure_reason ?? 'The refund could not be completed',
        );
      }
      if (Date.now() >= deadline) throw this.pending();
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  private async finish(
    paymentId: string,
    refundId: string,
    providerRefundId: string,
  ): Promise<RefundOutcome> {
    const refund = await this.payments.transaction(async (trx) => {
      await this.payments.lockById(trx, paymentId);
      const done = await this.ledgers.markRefundSucceeded(
        trx,
        refundId,
        providerRefundId,
      );
      // Already finalised by a concurrent finisher: same result.
      return done ?? (await this.ledgers.findRefundById(refundId, trx))!;
    });
    return {
      refund,
      payment: (await this.payments.findById(paymentId))!,
      alreadyDone: false,
    };
  }

  private pending(): HttpException {
    return new HttpException(
      {
        error: 'RefundPending',
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message:
          'The refund is being processed. It will not be issued twice — please check again shortly.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /** Talks to the provider without ever creating a duplicate refund. */
  private async callProvider(
    payment: PaymentRow,
    refund: RefundRow,
    isRetry: boolean,
  ): Promise<string> {
    const providerPaymentId = payment.provider_payment_id;
    if (!providerPaymentId) {
      await this.ledgers.markRefundFailed(
        refund.id,
        'payment has no provider payment id',
      );
      throw new BadRequestException('This payment cannot be refunded online');
    }

    if (isRetry) {
      // A previous attempt may have reached the provider: look first.
      const found = await this.lookup(providerPaymentId, refund);
      if (found === AMBIGUOUS) throw this.pending();
      if (found) return found;
    }

    try {
      const { refundId } = await this.provider.refund({
        providerPaymentId,
        amountMinor: refund.amount_minor,
        receipt: refund.id,
      });
      return refundId;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const definitiveRejection =
        (err instanceof HttpException && err.getStatus() < 500) ||
        (typeof status === 'number' && status >= 400 && status < 500);
      if (definitiveRejection) {
        await this.ledgers.markRefundFailed(
          refund.id,
          String((err as Error).message ?? err).slice(0, 300),
        );
        throw err;
      }
      // Ambiguous (timeout, 5xx, dropped connection): the provider MAY have
      // created it. Ask before deciding anything.
      const found = await this.lookup(providerPaymentId, refund);
      if (found && found !== AMBIGUOUS) return found;
      if (found === null) {
        // Proven: nothing was created. Hand the claim back so a retry works
        // immediately; the row stays pending and its amount stays reserved.
        await this.ledgers.releaseDispatch(refund.id);
      }
      // AMBIGUOUS keeps the claim: no one may call again until it goes stale
      // (or the reconciliation job proves the outcome).
      throw this.pending();
    }
  }

  private async lookup(
    providerPaymentId: string,
    refund: RefundRow,
  ): Promise<string | null | typeof AMBIGUOUS> {
    try {
      const found = await this.provider.findRefundByReceipt(
        providerPaymentId,
        refund.id,
      );
      return found ? found.refundId : null;
    } catch (err) {
      this.logger.error(
        `Refund ${refund.id}: receipt lookup failed (${String(err)}) — outcome unknown, left pending.`,
      );
      return AMBIGUOUS;
    }
  }
}
