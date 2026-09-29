import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/http/error-codes';
import type {
  CreateOrderParams,
  PaymentsProvider,
  ProviderEvent,
  RefundParams,
} from './payments-provider.interface';

/**
 * What production runs when Razorpay is NOT configured. Production never
 * gets the mock provider (audit C1): the mock "captures" anything, so a
 * mis-set environment used to be able to record money that never moved.
 * Every money operation here fails loudly with 503 instead, and webhooks
 * are rejected — the app still boots and everything non-financial works.
 */
@Injectable()
export class DisabledPaymentsProvider implements PaymentsProvider {
  readonly name = 'disabled';
  private readonly logger = new Logger('Payments (disabled)');

  private notConfigured(): HttpException {
    return new HttpException(
      {
        error: 'PaymentsNotConfigured',
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message:
          'Online payments are not available right now. Please try again later.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async createOrder(_params: CreateOrderParams): Promise<{ orderId: string }> {
    this.logger.error(
      'createOrder refused: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set in production',
    );
    throw this.notConfigured();
  }

  async simulateCapture(_orderId: string): Promise<{ paymentId: string }> {
    throw this.notConfigured();
  }

  verifyWebhook(): ProviderEvent | null {
    return null;
  }

  async refund(_params: RefundParams): Promise<{ refundId: string }> {
    throw this.notConfigured();
  }

  async findRefundByReceipt(): Promise<{ refundId: string } | null> {
    throw this.notConfigured();
  }
}
