import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/http/error-codes';
import type {
  InitiatePayoutParams,
  PayoutsProvider,
} from './payouts-provider.interface';

/** What production runs when Razorpay is not configured — never the mock
 *  (audit C1). Every payout attempt fails loudly with 503. */
@Injectable()
export class DisabledPayoutsProvider implements PayoutsProvider {
  readonly name = 'disabled';

  private notConfigured(): HttpException {
    return new HttpException(
      {
        error: 'PayoutsNotConfigured',
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payouts are not available right now.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async initiatePayout(
    _params: InitiatePayoutParams,
  ): Promise<{ payoutId: string }> {
    throw this.notConfigured();
  }

  async simulateComplete(_payoutId: string): Promise<{ status: 'paid' }> {
    throw this.notConfigured();
  }
}
