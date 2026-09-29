import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type {
  CreateOrderParams,
  PaymentsProvider,
  ProviderEvent,
  RefundParams,
} from './payments-provider.interface';

/** Constant-time hex comparison of two HMAC digests. */
function signaturesMatch(expectedHex: string, givenHex: string): boolean {
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(givenHex, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: { id?: string; order_id?: string; amount?: number };
    };
    refund?: {
      entity?: { id?: string; payment_id?: string; amount?: number };
    };
  };
}

/**
 * Selected by BillingModule's factory once RAZORPAY_KEY_ID/SECRET are set.
 * Built against the real SDK; verified by unit tests with signed payloads.
 */
@Injectable()
export class RazorpayPaymentsProvider implements PaymentsProvider {
  readonly name = 'razorpay';
  private readonly logger = new Logger('Payments (razorpay)');
  private readonly client: Razorpay | null;
  private readonly webhookSecret: string | undefined;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('razorpay.keyId');
    const keySecret = this.config.get<string>('razorpay.keySecret');
    this.webhookSecret = this.config.get<string>('razorpay.webhookSecret');
    this.client =
      keyId && keySecret
        ? new Razorpay({ key_id: keyId, key_secret: keySecret })
        : null;
  }

  async createOrder(params: CreateOrderParams): Promise<{ orderId: string }> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client not initialized');
    }
    const order = await this.client.orders.create({
      amount: params.amountMinor,
      currency: params.currency,
      receipt: params.receipt,
    });
    return { orderId: order.id };
  }

  /** Real capture only ever happens via the signed webhook below — there
   *  is no legitimate reason for our own server to short-circuit it. */
  async simulateCapture(_orderId: string): Promise<{ paymentId: string }> {
    throw new BadRequestException(
      'Payment capture happens via the Razorpay webhook in production, not this endpoint.',
    );
  }

  async refund(params: RefundParams): Promise<{ refundId: string }> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client not initialized');
    }
    const refund = await this.client.payments.refund(params.providerPaymentId, {
      amount: params.amountMinor,
      receipt: params.receipt,
    });
    return { refundId: refund.id };
  }

  async findRefundByReceipt(
    providerPaymentId: string,
    receipt: string,
  ): Promise<{ refundId: string } | null> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client not initialized');
    }
    const result = (await this.client.payments.fetchMultipleRefund(
      providerPaymentId,
      { count: 100 },
    )) as { items?: Array<{ id: string; receipt?: string | null }> };
    const hit = (result.items ?? []).find((r) => r.receipt === receipt);
    return hit ? { refundId: hit.id } : null;
  }

  verifyWebhook(
    rawBody: string,
    signature: string,
    eventIdHeader?: string,
  ): ProviderEvent | null {
    if (!this.webhookSecret) {
      this.logger.error(
        'RAZORPAY_WEBHOOK_SECRET is unset — rejecting webhook, signature cannot be verified',
      );
      return null;
    }
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (!signature || !signaturesMatch(expected, signature)) {
      this.logger.warn('Webhook signature verification failed — rejecting');
      return null;
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
      return null;
    }
    // A signed body can still be `null`, a number, or an array.
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    // The provider's own delivery id. Without one (older webhook configs) a
    // hash of the signed body is just as stable: an identical replay hashes
    // identically.
    const eventId =
      eventIdHeader && eventIdHeader.trim()
        ? eventIdHeader.trim()
        : `body:${createHash('sha256').update(rawBody).digest('hex')}`;
    const rawType = payload.event ?? '';

    const pay = payload.payload?.payment?.entity;
    const paymentEvents: Record<string, 'captured' | 'authorized' | 'failed'> =
      {
        'payment.captured': 'captured',
        'payment.authorized': 'authorized',
        'payment.failed': 'failed',
      };
    const paymentType = paymentEvents[rawType];
    if (paymentType) {
      if (!pay?.id || !pay.order_id || typeof pay.amount !== 'number') {
        return null;
      }
      return {
        type: paymentType,
        eventId,
        providerOrderId: pay.order_id,
        providerPaymentId: pay.id,
        amountMinor: pay.amount,
      };
    }

    const ref = payload.payload?.refund?.entity;
    if (rawType === 'refund.processed' || rawType === 'refund.failed') {
      if (!ref?.id || !ref.payment_id || typeof ref.amount !== 'number') {
        return null;
      }
      return {
        type:
          rawType === 'refund.processed' ? 'refund_processed' : 'refund_failed',
        eventId,
        providerPaymentId: ref.payment_id,
        providerRefundId: ref.id,
        amountMinor: ref.amount,
      };
    }

    // Anything else (order.paid, payment.dispute.*, refund.created, …) is a
    // valid, signed event we deliberately take no action on. It must NOT be
    // treated as a payment failure (the old code did exactly that).
    return { type: 'ignored', eventId, rawType };
  }
}
