import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  InitiatePayoutParams,
  PayoutsProvider,
} from './payouts-provider.interface';

/**
 * Selected by BillingModule's factory when RAZORPAY_KEY_ID/SECRET are
 * unset — same shape as MockPaymentsProvider. Doesn't require Route
 * onboarding (tutorAccountId can be null) since there's nothing real
 * to onboard into yet.
 */
@Injectable()
export class MockPayoutsProvider implements PayoutsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('Payouts (mock)');

  async initiatePayout(
    params: InitiatePayoutParams,
  ): Promise<{ payoutId: string }> {
    const payoutId = `mock_payout_${randomBytes(8).toString('hex')}`;
    this.logger.warn(
      `Created MOCK payout ${payoutId} for ${params.amountMinor} ${params.currency} (reference ${params.reference}) — RAZORPAY_KEY_ID unset, not a real transfer`,
    );
    return { payoutId };
  }

  async simulateComplete(payoutId: string): Promise<{ status: 'paid' }> {
    this.logger.warn(`Simulated completion of MOCK payout ${payoutId}`);
    return { status: 'paid' };
  }
}
