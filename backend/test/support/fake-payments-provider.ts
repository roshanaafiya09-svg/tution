import type {
  CreateOrderParams,
  PaymentsProvider,
  ProviderEvent,
  RefundParams,
} from '../../src/modules/billing/payments/payments-provider.interface';

/**
 * A controllable stand-in for Razorpay used by the money-flow e2e suites.
 * It behaves like a real provider where it matters for idempotency:
 *  - webhooks are "signed": the signature header must equal `sig-ok`;
 *  - refunds are idempotent per receipt and can be made to TIME OUT after the
 *    provider has already created them (the dangerous case), or to fail
 *    before doing anything;
 *  - `orderLatencyMs` widens race windows so concurrency tests are real.
 */
export class FakePaymentsProvider implements PaymentsProvider {
  readonly name = 'razorpay';
  orderLatencyMs = 25;
  orders: string[] = [];
  /** receipt -> provider refund id (what the provider "actually did") */
  createdRefunds = new Map<string, string>();
  refundCalls = 0;
  /** none: normal. `timeout-after-create`: provider creates the refund then
   *  the call throws (ambiguous). `timeout-before-create`: ambiguous, nothing
   *  happened. `reject`: definitive 4xx. Consumed after one refund call. */
  refundMode:
    'none' | 'timeout-after-create' | 'timeout-before-create' | 'reject' =
    'none';
  private seq = 0;

  async createOrder(params: CreateOrderParams): Promise<{ orderId: string }> {
    if (this.orderLatencyMs) {
      await new Promise((r) => setTimeout(r, this.orderLatencyMs));
    }
    const orderId = `order_fake_${++this.seq}_${params.receipt.slice(-6)}`;
    this.orders.push(orderId);
    return { orderId };
  }

  async simulateCapture(orderId: string): Promise<{ paymentId: string }> {
    return { paymentId: `pay_sim_${orderId}` };
  }

  verifyWebhook(rawBody: string, signature: string): ProviderEvent | null {
    if (signature !== 'sig-ok') return null;
    let b: {
      id: string;
      type: string;
      orderId?: string;
      paymentId?: string;
      amount?: number;
      refundId?: string;
    };
    try {
      b = JSON.parse(rawBody) as typeof b;
    } catch {
      return null;
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
    // Same required-field rules as the real Razorpay provider.
    const isPay = ['captured', 'authorized', 'failed'].includes(b.type);
    const isRefund = ['refund_processed', 'refund_failed'].includes(b.type);
    if (isPay && !(b.orderId && b.paymentId && typeof b.amount === 'number')) {
      return null;
    }
    if (
      isRefund &&
      !(b.refundId && b.paymentId && typeof b.amount === 'number')
    ) {
      return null;
    }
    switch (b.type) {
      case 'captured':
      case 'authorized':
      case 'failed':
        return {
          type: b.type,
          eventId: b.id,
          providerOrderId: b.orderId!,
          providerPaymentId: b.paymentId!,
          amountMinor: b.amount!,
        };
      case 'refund_processed':
      case 'refund_failed':
        return {
          type: b.type,
          eventId: b.id,
          providerPaymentId: b.paymentId!,
          providerRefundId: b.refundId!,
          amountMinor: b.amount!,
        };
      default:
        return { type: 'ignored', eventId: b.id, rawType: b.type };
    }
  }

  async refund(params: RefundParams): Promise<{ refundId: string }> {
    this.refundCalls++;
    const existing = this.createdRefunds.get(params.receipt);
    const mode = this.refundMode;
    this.refundMode = 'none';
    if (mode === 'reject') {
      throw Object.assign(new Error('provider rejected the refund'), {
        statusCode: 400,
      });
    }
    if (mode === 'timeout-before-create') {
      throw new Error('socket hang up');
    }
    const refundId = existing ?? `rfnd_fake_${++this.seq}`;
    this.createdRefunds.set(params.receipt, refundId);
    if (mode === 'timeout-after-create') {
      throw new Error('ETIMEDOUT');
    }
    return { refundId };
  }

  async findRefundByReceipt(
    _providerPaymentId: string,
    receipt: string,
  ): Promise<{ refundId: string } | null> {
    const refundId = this.createdRefunds.get(receipt);
    return refundId ? { refundId } : null;
  }
}

export const hook = (
  id: string,
  type: string,
  fields: Record<string, unknown> = {},
) => JSON.stringify({ id, type, ...fields });
