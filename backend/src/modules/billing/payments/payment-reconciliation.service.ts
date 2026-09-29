import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isInternalCronDisabled } from '../../../common/scheduling/cron-gate';
import { PaymentsRepository } from './payments.repository';
import { PaymentLedgersRepository } from './payment-ledgers.repository';
import {
  DISPATCH_STALE_SECONDS,
  PaymentRefundsService,
} from './payment-refunds.service';
import { PayoutsRepository } from '../payouts/payouts.repository';

const STALE_ORDER_HOURS = 24;
const STUCK_REFUND_MINUTES = 10;
const STUCK_PAYOUT_HOURS = 1;

/**
 * Recovers money-flow state that a single request cannot finish on its own
 * (audit H5/H7/H8/H10) — the parts of "payment reconciliation" that were
 * designed (payments.repository.ts's `expireStaleOpen`, payouts.repository
 * .ts's `listStuckPending`) but, until now, had no caller: no cron ever ran
 * them, so a customer's abandoned checkout order sat open forever and a
 * refund left stuck by a crash mid-dispatch never resumed on its own.
 *
 * Every action here is safe to run repeatedly, concurrently with itself, and
 * after any gap (a sleeping Render free instance, a restart, a delayed
 * tick): each step only touches rows whose age proves the original attempt
 * is over, and reuses the same idempotent primitives request-driven code
 * already relies on (the refund dispatch claim, the one-open-order index).
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly ledgers: PaymentLedgersRepository,
    private readonly refunds: PaymentRefundsService,
    private readonly payouts: PayoutsRepository,
  ) {}

  /**
   * An order a payer never completed checkout on (closed the tab, the
   * provider's widget failed to load, …) holds the fee/plan/booking's "one
   * open order" slot forever otherwise. Marking it `failed` after
   * STALE_ORDER_HOURS frees that slot for a real retry; the payer's original
   * order simply stops being reusable, exactly like it expiring naturally.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cronExpireStaleOrders(): Promise<void> {
    if (isInternalCronDisabled()) return;
    await this.expireStaleOrders();
  }

  async expireStaleOrders(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALE_ORDER_HOURS * 3_600_000);
      const count = await this.payments.expireStaleOpen(cutoff);
      if (count > 0) {
        this.logger.log(`Expired ${count} stale open payment order(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Stale payment order sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /**
   * A refund left `pending` past the dispatch-claim staleness window means
   * its previous caller crashed (or the process restarted) between claiming
   * the dispatch and finishing it — never that a refund is still legitimately
   * in flight (that claim would still be fresh). Safe to re-drive: dispatch()
   * always asks the provider "does a refund with our receipt already exist?"
   * before ever creating a new one, so this can never double-refund.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cronResumeStuckRefunds(): Promise<void> {
    if (isInternalCronDisabled()) return;
    await this.resumeStuckRefunds();
  }

  async resumeStuckRefunds(): Promise<void> {
    const cutoff = new Date(
      Date.now() - (DISPATCH_STALE_SECONDS + STUCK_REFUND_MINUTES * 60) * 1000,
    );
    let rows: Awaited<
      ReturnType<PaymentLedgersRepository['listPendingRefundsOlderThan']>
    >;
    try {
      rows = await this.ledgers.listPendingRefundsOlderThan(cutoff);
    } catch (err) {
      this.logger.error(
        'Stuck-refund lookup failed',
        err instanceof Error ? err.stack : err,
      );
      return;
    }
    for (const row of rows) {
      try {
        await this.refunds.dispatch(row.payment_id, row.id);
        this.logger.log(`Resumed stuck refund ${row.id}`);
      } catch (err) {
        // Left pending for the next sweep — never escalated to `failed`
        // here, since that would release the reserved amount while the
        // provider's true state is still unproven.
        this.logger.warn(
          `Refund ${row.id} still could not be resolved: ${String(err)}`,
        );
      }
    }
  }

  /**
   * A payout stuck `pending` (never even got a provider payout id) past
   * STUCK_PAYOUT_HOURS means the provider call itself never completed. This
   * is deliberately REPORT-ONLY: PayoutsProvider has no "does a payout for
   * this reference already exist?" lookup the way refunds do, so blindly
   * retrying here could pay someone twice. The payments stay attached to
   * the stuck payout row (never silently released) until a human confirms
   * the real state at the provider — see payouts.service.ts's own comment
   * on the same trade-off.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cronReportStuckPayouts(): Promise<void> {
    if (isInternalCronDisabled()) return;
    await this.reportStuckPayouts();
  }

  async reportStuckPayouts(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STUCK_PAYOUT_HOURS * 3_600_000);
      const stuck = await this.payouts.listStuckPending(cutoff);
      for (const payout of stuck) {
        this.logger.error(
          `Payout ${payout.id} (${payout.academy_id ? 'academy ' + payout.academy_id : 'tutor ' + payout.tutor_id}, ${payout.amount_minor} ${payout.currency}) has been pending with no provider id for over ${STUCK_PAYOUT_HOURS}h — verify at the provider before retrying.`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Stuck-payout report failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
