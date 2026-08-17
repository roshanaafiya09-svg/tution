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
  WebhookVerificationResult,
} from './payments-provider.interface';

/**
 * Selected by BillingModule's factory once RAZORPAY_KEY_ID/SECRET are
 * set. Unexercised in this environment (no Razorpay account yet) — same
 * position as ClaudeAiProvider: built against the real SDK, verified by
 * type-checking and code review, activates with zero further code
 * changes the moment real keys land in .env.
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

  async simulateRefund(
    providerPaymentId: string,
    amountMinor: number,
  ): Promise<{ refundId: string }> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client not initialized');
    }
    const refund = await this.client.payments.refund(providerPaymentId, {
      amount: amountMinor,
    });
    return { refundId: refund.id };
  }

  verifyWebhook(
    rawBody: string,
    signature: string,
  ): WebhookVerificationResult | null {
    if (!this.webhookSecret) {
      this.logger.error(
        'RAZORPAY_WEBHOOK_SECRET is unset — rejecting webhook, signature cannot be verified',
      );
      return null;
    }

    const valid = Razorpay.validateWebhookSignature(
      rawBody,
      signature,
      this.webhookSecret,
    );
    if (!valid) {
      this.logger.warn('Webhook signature verification failed — rejecting');
      return null;
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
          };
        };
      };
    };
    const paymentEntity = payload.payload?.payment?.entity;
    if (
      !paymentEntity?.id ||
      !paymentEntity?.order_id ||
      typeof paymentEntity.amount !== 'number'
    ) {
      return null;
    }

    return {
      providerOrderId: paymentEntity.order_id,
      providerPaymentId: paymentEntity.id,
      status: payload.event === 'payment.captured' ? 'captured' : 'failed',
      amountMinor: paymentEntity.amount,
    };
  }
}
