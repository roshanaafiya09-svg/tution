import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ParentsModule } from '../parents/parents.module';
import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { FeesRepository } from './fees/fees.repository';
import { RecapController } from './recap/recap.controller';
import { RecapService } from './recap/recap.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentsRepository } from './payments/payments.repository';
import { PAYMENTS_PROVIDER } from './payments/payments-provider.interface';
import { MockPaymentsProvider } from './payments/mock-payments.provider';
import { RazorpayPaymentsProvider } from './payments/razorpay-payments.provider';
import { PayoutsController } from './payouts/payouts.controller';
import { PayoutsService } from './payouts/payouts.service';
import { PayoutsRepository } from './payouts/payouts.repository';
import { PayoutAccountsRepository } from './payouts/payout-accounts.repository';
import { PAYOUTS_PROVIDER } from './payouts/payouts-provider.interface';
import { MockPayoutsProvider } from './payouts/mock-payouts.provider';
import { RazorpayPayoutsProvider } from './payouts/razorpay-payouts.provider';

const paymentsLogger = new Logger('BillingModule');

/**
 * Bounded context: fee tracking ledger (Phase 1, manual) and, as of
 * Phase 2, fee *collection* (payments/) via an env-gated Razorpay
 * provider — RAZORPAY_KEY_ID/SECRET unset -> MockPaymentsProvider, a
 * working stand-in (fake order + always-succeeds capture), same shape
 * as AiModule's ANTHROPIC_API_KEY gate.
 * Trial/subscription state lives in the sibling SubscriptionsModule
 * instead (see subscriptions/subscriptions.module.ts) — this module
 * already imports SchedulingModule, and SchedulingModule needs the
 * subscriptions guard, so nesting it here would cycle. It's safe for
 * *this* module to import SubscriptionsModule (for the recap endpoint,
 * blueprint §5) and ParentsModule (a paying parent must have an active
 * consented link — payments/payments.service.ts) since neither imports
 * anything back to Billing or Scheduling — no cycle.
 * Owns tables: fee_ledger, payments.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, SubscriptionsModule, ParentsModule],
  controllers: [FeesController, RecapController, PaymentsController, PayoutsController],
  providers: [
    FeesService,
    FeesRepository,
    RecapService,
    PaymentsService,
    PaymentsRepository,
    MockPaymentsProvider,
    RazorpayPaymentsProvider,
    {
      provide: PAYMENTS_PROVIDER,
      inject: [ConfigService, MockPaymentsProvider, RazorpayPaymentsProvider],
      useFactory: (
        config: ConfigService,
        mock: MockPaymentsProvider,
        razorpay: RazorpayPaymentsProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('razorpay.keyId') && config.get<string>('razorpay.keySecret'),
        );
        if (configured) {
          paymentsLogger.log('Razorpay configured — real fee collection enabled');
          return razorpay;
        }
        paymentsLogger.warn(
          'RAZORPAY_KEY_ID/SECRET not set — fee collection uses a mock payments provider',
        );
        return mock;
      },
    },
    PayoutsService,
    PayoutsRepository,
    PayoutAccountsRepository,
    MockPayoutsProvider,
    RazorpayPayoutsProvider,
    {
      provide: PAYOUTS_PROVIDER,
      inject: [ConfigService, MockPayoutsProvider, RazorpayPayoutsProvider],
      useFactory: (
        config: ConfigService,
        mock: MockPayoutsProvider,
        razorpay: RazorpayPayoutsProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('razorpay.keyId') && config.get<string>('razorpay.keySecret'),
        );
        if (configured) {
          paymentsLogger.log('Razorpay configured — real payouts enabled');
          return razorpay;
        }
        paymentsLogger.warn(
          'RAZORPAY_KEY_ID/SECRET not set — payouts use a mock payouts provider',
        );
        return mock;
      },
    },
  ],
  exports: [FeesRepository],
})
export class BillingModule {}
