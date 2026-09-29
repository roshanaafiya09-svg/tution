import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CreateOrderParams,
  PaymentsProvider,
  ProviderEvent,
  RefundParams,
} from './payments-provider.interface';

/**
 * Working stand-in for Razorpay for LOCAL DEVELOPMENT AND TESTS ONLY (fake
 * order, always-succeeds capture, deterministic refund ids). BillingModule
 * never selects it in production — see DisabledPaymentsProvider.
 */
@Injectable()
export class MockPaymentsProvider implements PaymentsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('Payments (mock)');
  private readonly refunds = new Map<string, string>();

  async createOrder(params: CreateOrderParams): Promise<{ orderId: string }> {
    const orderId = `mock_order_${randomBytes(8).toString('hex')}`;
    this.logger.warn(
      `Created MOCK order ${orderId} for ${params.amountMinor} ${params.currency} (receipt ${params.receipt}) — RAZORPAY_KEY_ID unset, not a real order`,
    );
    return { orderId };
  }

  async simulateCapture(orderId: string): Promise<{ paymentId: string }> {
    const paymentId = `mock_pay_${randomBytes(8).toString('hex')}`;
    this.logger.warn(
      `Simulated capture of MOCK order ${orderId} as ${paymentId}`,
    );
    return { paymentId };
  }

  verifyWebhook(
    _rawBody: string,
    _signature: string,
    _eventIdHeader?: string,
  ): ProviderEvent | null {
    this.logger.warn(
      'Webhook received while running the mock payments provider — mock orders are captured via simulateCapture, not a webhook. Rejecting.',
    );
    return null;
  }

  /** Idempotent by receipt, like a well-behaved provider: asking again for
   *  the same receipt returns the refund that already exists. */
  async refund(params: RefundParams): Promise<{ refundId: string }> {
    const existing = this.refunds.get(params.receipt);
    if (existing) return { refundId: existing };
    const refundId = `mock_rfnd_${randomBytes(8).toString('hex')}`;
    this.refunds.set(params.receipt, refundId);
    this.logger.warn(
      `Simulated refund of ${params.amountMinor} for MOCK payment ${params.providerPaymentId} as ${refundId}`,
    );
    return { refundId };
  }

  async findRefundByReceipt(
    _providerPaymentId: string,
    receipt: string,
  ): Promise<{ refundId: string } | null> {
    const existing = this.refunds.get(receipt);
    return existing ? { refundId: existing } : null;
  }
}
