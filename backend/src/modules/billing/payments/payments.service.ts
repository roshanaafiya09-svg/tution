import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { FeesRepository } from '../fees/fees.repository';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PAYMENTS_PROVIDER } from './payments-provider.interface';
import type { PaymentsProvider } from './payments-provider.interface';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';

/**
 * Fee *collection* (blueprint §10 Phase 2) — the online-payment
 * counterpart to fee_ledger's Phase 1 manual tracking. A payment
 * settles the outstanding balance on one fee_ledger row; recording the
 * result reuses FeesRepository so online and manually-recorded payments
 * land through the same status/paid_at logic.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly feesRepository: FeesRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly analytics: AnalyticsService,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
  ) {}

  async initiateOrder(user: AccessTokenPayload, feeLedgerId: string) {
    const fee = await this.feesRepository.findById(feeLedgerId);
    if (!fee) throw new NotFoundException('Fee entry not found');
    await this.assertCanPay(user, fee.student_id);

    if (fee.status === 'paid' || fee.status === 'waived') {
      throw new BadRequestException(`This fee is already ${fee.status}`);
    }

    const outstandingMinor = fee.expected_minor - (fee.recorded_paid_minor ?? 0);
    if (outstandingMinor <= 0) {
      throw new BadRequestException('Nothing outstanding on this fee');
    }

    const payment = await this.repository.create(
      fee.id,
      user.sub,
      outstandingMinor,
      fee.currency,
    );

    const { orderId } = await this.provider.createOrder({
      amountMinor: outstandingMinor,
      currency: fee.currency,
      receipt: payment.id,
    });

    const updated = await this.repository.setOrder(payment.id, orderId, this.provider.name);
    this.analytics.capture(user.sub, 'payment_order_created', {
      feeLedgerId,
      amountMinor: outstandingMinor,
      provider: this.provider.name,
    });
    return updated;
  }

  /** Dev/test path — see PaymentsProvider.simulateCapture. The real
   *  provider rejects this; production capture is webhook-driven. */
  async simulateCapture(user: AccessTokenPayload, paymentId: string) {
    const payment = await this.repository.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.payer_id !== user.sub) {
      throw new ForbiddenException('Not your payment');
    }
    if (payment.status !== 'created' || !payment.provider_order_id) {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const { paymentId: providerPaymentId } = await this.provider.simulateCapture(
      payment.provider_order_id,
    );
    return this.capture(payment.id, payment.fee_ledger_id, payment.amount_minor, providerPaymentId);
  }

  async handleWebhook(rawBody: string, signature: string) {
    const result = this.provider.verifyWebhook(rawBody, signature);
    if (!result) throw new ForbiddenException('Invalid webhook signature');

    const payment = await this.repository.findByProviderOrderId(result.providerOrderId);
    if (!payment) throw new NotFoundException('No payment for this order');

    if (result.status === 'failed') {
      return this.repository.markFailed(payment.id, 'Provider reported payment.failed');
    }
    return this.capture(
      payment.id,
      payment.fee_ledger_id,
      payment.amount_minor,
      result.providerPaymentId,
    );
  }

  private async capture(
    paymentId: string,
    feeLedgerId: string,
    amountMinor: number,
    providerPaymentId: string,
  ) {
    const captured = await this.repository.markCaptured(paymentId, providerPaymentId);

    const fee = await this.feesRepository.findById(feeLedgerId);
    if (fee) {
      const newRecordedMinor = (fee.recorded_paid_minor ?? 0) + amountMinor;
      const status = newRecordedMinor >= fee.expected_minor ? 'paid' : 'partial';
      await this.feesRepository.recordPayment(
        feeLedgerId,
        newRecordedMinor,
        status,
        `Paid online via ${captured.provider} (payment ${paymentId})`,
      );
    }

    this.analytics.capture(captured.payer_id, 'payment_captured', {
      feeLedgerId,
      amountMinor,
      provider: captured.provider,
    });
    return captured;
  }

  private async assertCanPay(user: AccessTokenPayload, studentId: string): Promise<void> {
    if (user.roles.includes('student') && user.sub === studentId) return;
    if (user.roles.includes('parent')) {
      const link = await this.parentLinksRepository.findByParentAndStudent(
        user.sub,
        studentId,
      );
      if (link?.status === 'active') return;
    }
    throw new ForbiddenException('You cannot pay this fee');
  }
}
