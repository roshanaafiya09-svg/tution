import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CreateOrderParams,
  PaymentsProvider,
  WebhookVerificationResult,
} from './payments-provider.interface';

/**
 * Selected by BillingModule's factory when RAZORPAY_KEY_ID/SECRET are
 * unset — same "working stand-in, not an error" shape as MockAiProvider.
 * Fakes order creation and always-succeeds capture so the full fee-
 * collection flow (order -> capture -> fee_ledger settlement) is
 * buildable and live-testable before a real Razorpay account exists.
 * IDs are prefixed `mock_` so they're never mistaken for real Razorpay
 * ids (which start `order_`/`pay_`) in logs or the database.
 */
@Injectable()
export class MockPaymentsProvider implements PaymentsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('Payments (mock)');

  async createOrder(params: CreateOrderParams): Promise<{ orderId: string }> {
    const orderId = `mock_order_${randomBytes(8).toString('hex')}`;
    this.logger.warn(
      `Created MOCK order ${orderId} for ${params.amountMinor} ${params.currency} (receipt ${params.receipt}) — RAZORPAY_KEY_ID unset, not a real order`,
    );
    return { orderId };
  }

  async simulateCapture(orderId: string): Promise<{ paymentId: string }> {
    const paymentId = `mock_pay_${randomBytes(8).toString('hex')}`;
    this.logger.warn(`Simulated capture of MOCK order ${orderId} as ${paymentId}`);
    return { paymentId };
  }

  verifyWebhook(_rawBody: string, _signature: string): WebhookVerificationResult | null {
    this.logger.warn(
      'Webhook received while running the mock payments provider — mock orders are captured via simulateCapture, not a webhook. Rejecting.',
    );
    return null;
  }
}
