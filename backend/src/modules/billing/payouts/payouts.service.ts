import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutsRepository } from './payouts.repository';
import { PayoutAccountsRepository } from './payout-accounts.repository';
import { PaymentsRepository } from '../payments/payments.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PAYOUTS_PROVIDER } from './payouts-provider.interface';
import type { PayoutsProvider } from './payouts-provider.interface';

/**
 * Tutor payouts (blueprint §6, §10 Phase 2): aggregates a tutor's
 * captured fee-collection payments over a period into one payout,
 * minus the platform's cut (0% by default — see razorpayConfig). This
 * is the "Route split, tutor payout" half of fee collection; the
 * payment side lives in payments/payments.service.ts.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly repository: PayoutsRepository,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly payoutAccountsRepository: PayoutAccountsRepository,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    @Inject(PAYOUTS_PROVIDER) private readonly provider: PayoutsProvider,
  ) {}

  async generate(tutorId: string, periodStart: string, periodEnd: string) {
    const from = new Date(`${periodStart}T00:00:00.000Z`);
    const to = new Date(`${periodEnd}T00:00:00.000Z`);
    to.setUTCDate(to.getUTCDate() + 1); // periodEnd is inclusive
    if (to <= from) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }

    const capturable = await this.paymentsRepository.listUnpaidOutCapturedForTutor(
      tutorId,
      from,
      to,
    );
    if (capturable.length === 0) {
      throw new BadRequestException('Nothing to pay out for this period');
    }

    const currency = capturable[0].currency;
    const grossMinor = capturable.reduce((sum, p) => sum + p.amount_minor, 0);
    const platformFeePercent = this.config.get<number>('razorpay.platformFeePercent') ?? 0;
    const platformFeeMinor = Math.round((grossMinor * platformFeePercent) / 100);
    const payoutMinor = grossMinor - platformFeeMinor;

    const payout = await this.repository.create(
      tutorId,
      payoutMinor,
      currency,
      periodStart,
      periodEnd,
    );
    const paymentIds = capturable.map((p) => p.id);
    await this.paymentsRepository.assignPayout(paymentIds, payout.id);

    try {
      const account = await this.payoutAccountsRepository.findByTutorId(tutorId);
      const { payoutId } = await this.provider.initiatePayout({
        amountMinor: payoutMinor,
        currency,
        tutorAccountId: account?.provider_account_id ?? null,
        reference: payout.id,
      });

      const updated = await this.repository.setProviderPayout(
        payout.id,
        payoutId,
        this.provider.name,
      );
      this.analytics.capture(tutorId, 'payout_generated', {
        payoutId: payout.id,
        grossMinor,
        payoutMinor,
        paymentCount: paymentIds.length,
      });
      return updated;
    } catch (err) {
      // The provider call is the only step that can fail here — undo
      // both writes above so these payments are eligible for the next
      // payout run instead of being silently stranded against a payout
      // that never actually initiated.
      await this.paymentsRepository.assignPayout(paymentIds, null);
      await this.repository.markFailed(payout.id);
      throw err;
    }
  }

  /** Dev/test path — see PayoutsProvider.simulateComplete. */
  async simulateComplete(tutorId: string, payoutId: string) {
    const payout = await this.repository.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.tutor_id !== tutorId) throw new ForbiddenException('Not your payout');
    if (payout.status !== 'processing' || !payout.provider_payout_id) {
      throw new BadRequestException(`Payout is ${payout.status}, not processing`);
    }

    await this.provider.simulateComplete(payout.provider_payout_id);
    return this.repository.markPaid(payout.id);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }
}
