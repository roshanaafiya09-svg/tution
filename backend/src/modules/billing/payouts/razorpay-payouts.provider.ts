import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type {
  InitiatePayoutParams,
  PayoutsProvider,
} from './payouts-provider.interface';

/**
 * Selected once RAZORPAY_KEY_ID/SECRET are set. Unexercised in this
 * environment for the same reason RazorpayPaymentsProvider is: no
 * account, and specifically here, no tutor has completed Route's
 * linked-account onboarding either (that's a real KYC + bank-details
 * flow on Razorpay's own dashboard/API — entirely out of band, nothing
 * this codebase can simulate meaningfully). Built against the real SDK
 * and reviewed; activates with zero further code changes once both
 * platform keys and at least one tutor's linked account exist.
 */
@Injectable()
export class RazorpayPayoutsProvider implements PayoutsProvider {
  readonly name = 'razorpay';
  private readonly client: Razorpay | null;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('razorpay.keyId');
    const keySecret = this.config.get<string>('razorpay.keySecret');
    this.client =
      keyId && keySecret
        ? new Razorpay({ key_id: keyId, key_secret: keySecret })
        : null;
  }

  async initiatePayout(
    params: InitiatePayoutParams,
  ): Promise<{ payoutId: string }> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client not initialized');
    }
    if (!params.tutorAccountId) {
      throw new BadRequestException(
        'This tutor has not completed Razorpay Route onboarding yet — no linked account to transfer to.',
      );
    }

    const transfer = await this.client.transfers.create({
      account: params.tutorAccountId,
      amount: params.amountMinor,
      currency: params.currency,
    });
    return { payoutId: transfer.id };
  }

  /** Real Route transfers settle to the linked account on Razorpay's
   *  own schedule — there is no legitimate "mark it paid now" action
   *  for our server to take. */
  async simulateComplete(_payoutId: string): Promise<{ status: 'paid' }> {
    throw new BadRequestException(
      'Route transfers settle automatically on Razorpay’s schedule — there is no manual completion step in production.',
    );
  }
}
