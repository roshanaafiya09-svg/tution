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
import { PayoutsRepository } from './payouts.repository';
import { PayoutAccountsRepository } from './payout-accounts.repository';
import {
  PaymentsRepository,
  type PayoutScope,
} from '../payments/payments.repository';
import { AcademyBillingRepository } from '../payments/academy-billing.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PAYOUTS_PROVIDER } from './payouts-provider.interface';
import type { PayoutsProvider } from './payouts-provider.interface';
import { ErrorCode } from '../../../common/http/error-codes';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Payouts hand collected FEE money to whoever owns it (audit H5 / H8):
 *  - an individual teacher is paid for fees on their own INDIVIDUAL batches;
 *  - an academy is paid (to its owner) for fees on batches it owns.
 * The ownership chain is derived on the server from the fee's batch:
 *   payer -> payment -> fee_ledger -> batch.academy_id | batch.tutor_id
 * and never from anything the client sends. A payout can only ever contain
 * payments that were actually applied to the ledger, are not refunded, and
 * are claimed atomically — so no payment can be paid out twice and
 * duplicated provider events cannot inflate a payout.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly repository: PayoutsRepository,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly payoutAccountsRepository: PayoutAccountsRepository,
    private readonly academies: AcademyBillingRepository,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    @Inject(PAYOUTS_PROVIDER) private readonly provider: PayoutsProvider,
  ) {}

  generate(tutorId: string, periodStart: string, periodEnd: string) {
    return this.generateFor(
      { kind: 'tutor', tutorId },
      tutorId,
      null,
      periodStart,
      periodEnd,
    );
  }

  async generateForAcademy(
    ownerUserId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const academy = await this.requireOwnAcademy(ownerUserId);
    return this.generateFor(
      { kind: 'academy', academyId: academy.id },
      ownerUserId,
      academy.id,
      periodStart,
      periodEnd,
    );
  }

  private async generateFor(
    scope: PayoutScope,
    payeeUserId: string,
    academyId: string | null,
    periodStart: string,
    periodEnd: string,
  ) {
    const from = new Date(`${periodStart}T00:00:00.000Z`);
    const to = new Date(`${periodEnd}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('periodStart/periodEnd must be dates');
    }
    to.setTime(to.getTime() + DAY_MS); // periodEnd is inclusive
    if (to <= from) {
      throw new BadRequestException(
        'periodEnd must be on or after periodStart',
      );
    }
    const excludeMock = this.config.get<string>('app.nodeEnv') === 'production';

    // 1. Claim + create, in ONE transaction. Losing a race for a payment
    //    just means it is not in this run.
    const run = await this.repository.transaction(async (trx) => {
      const payout = await this.repository.createTx(trx, {
        payeeUserId,
        academyId,
        currency: 'INR',
        periodStart,
        periodEnd,
      });
      const claimed = await this.paymentsRepository.claimForPayout(
        trx,
        scope,
        payout.id,
        from,
        to,
        excludeMock,
      );
      if (claimed.length === 0) {
        throw new BadRequestException('Nothing to pay out for this period');
      }
      const currency = claimed[0].currency;
      const grossMinor = claimed.reduce(
        (sum, p) => sum + Number(p.net_minor),
        0,
      );
      // Integer money math: the platform fee is held in basis points.
      const feePercent =
        this.config.get<number>('razorpay.platformFeePercent') ?? 0;
      const feeBps = Math.round(feePercent * 100);
      const platformFeeMinor = Math.floor((grossMinor * feeBps + 5000) / 10000);
      const payoutMinor = grossMinor - platformFeeMinor;
      const saved = await this.repository.setAmountTx(
        trx,
        payout.id,
        payoutMinor,
      );
      return {
        payout: saved,
        paymentCount: claimed.length,
        currency,
        grossMinor,
        payoutMinor,
      };
    });

    // 2. Tell the provider (a network call, outside the transaction).
    try {
      const account =
        await this.payoutAccountsRepository.findByTutorId(payeeUserId);
      const { payoutId } = await this.provider.initiatePayout({
        amountMinor: run.payoutMinor,
        currency: run.currency,
        tutorAccountId: account?.provider_account_id ?? null,
        reference: run.payout.id,
      });
      const updated = await this.repository.setProviderPayout(
        run.payout.id,
        payoutId,
        this.provider.name,
      );
      this.analytics.capture(payeeUserId, 'payout_generated', {
        payoutId: run.payout.id,
        scope: scope.kind,
        grossMinor: run.grossMinor,
        payoutMinor: run.payoutMinor,
        paymentCount: run.paymentCount,
      });
      return updated;
    } catch (err) {
      if (this.isDefinitiveFailure(err)) {
        // The provider refused (or we never called it): nothing was sent, so
        // the payments can safely go back into the pool.
        await this.repository.transaction(async (trx) => {
          await this.paymentsRepository.releasePayout(trx, run.payout.id);
          await this.repository.markFailedTx(trx, run.payout.id);
        });
        throw err;
      }
      // Ambiguous (timeout / 5xx / dropped connection): the provider MAY have
      // moved the money. Releasing the payments could pay them twice, so they
      // stay attached to this payout, which stays `pending` for a human to
      // confirm. The reconciliation job reports it and NEVER re-sends.
      this.logger.error(
        `Payout ${run.payout.id}: provider outcome unknown (${String(err)}). Payments left attached; verify at the provider before retrying.`,
      );
      throw new HttpException(
        {
          error: 'PayoutPending',
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message:
            'The payout is being processed and will not be sent twice. Check back shortly.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private isDefinitiveFailure(err: unknown): boolean {
    if (err instanceof HttpException) return true; // our own guard / client error
    const status = (err as { statusCode?: number }).statusCode;
    return typeof status === 'number' && status >= 400 && status < 500;
  }

  async simulateComplete(tutorId: string, payoutId: string) {
    this.assertNotProduction();
    const payout = await this.repository.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.tutor_id !== tutorId || payout.academy_id !== null) {
      throw new ForbiddenException('Not your payout');
    }
    return this.completeSimulated(payout);
  }

  async simulateCompleteForAcademy(ownerUserId: string, payoutId: string) {
    this.assertNotProduction();
    const academy = await this.requireOwnAcademy(ownerUserId);
    const payout = await this.repository.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.academy_id !== academy.id) {
      throw new ForbiddenException("Not your academy's payout");
    }
    return this.completeSimulated(payout);
  }

  private async completeSimulated(payout: {
    id: string;
    status: string;
    provider_payout_id: string | null;
  }) {
    if (payout.status !== 'processing' || !payout.provider_payout_id) {
      throw new BadRequestException(
        `Payout is ${payout.status}, not processing`,
      );
    }
    await this.provider.simulateComplete(payout.provider_payout_id);
    return this.repository.markPaid(payout.id);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  async listForAcademy(ownerUserId: string) {
    const academy = await this.requireOwnAcademy(ownerUserId);
    return this.repository.listForAcademy(academy.id);
  }

  private async requireOwnAcademy(ownerUserId: string) {
    const academy = await this.academies.findByOwner(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account');
    }
    return academy;
  }

  private assertNotProduction(): void {
    if (this.config.get<string>('app.nodeEnv') === 'production') {
      throw new BadRequestException(
        'Payout completion happens via the real payouts provider in production, not this endpoint.',
      );
    }
  }
}
