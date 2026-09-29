import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ParentPremiumModule } from './parent-premium/parent-premium.module';
import { BookingsModule } from '../marketplace/bookings/bookings.module';
import { ParentsModule } from '../parents/parents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { FeesRepository } from './fees/fees.repository';
import { FeeNotificationsService } from './fees/fee-notifications.service';
import { RecapController } from './recap/recap.controller';
import { RecapService } from './recap/recap.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentsRepository } from './payments/payments.repository';
import { PaymentLedgersRepository } from './payments/payment-ledgers.repository';
import { PaymentSettlementRepository } from './payments/payment-settlement.repository';
import { PaymentSettlementService } from './payments/payment-settlement.service';
import { PaymentRefundsService } from './payments/payment-refunds.service';
import { PaymentReconciliationService } from './payments/payment-reconciliation.service';
import { AcademyBillingRepository } from './payments/academy-billing.repository';
import { DisabledPaymentsProvider } from './payments/disabled-payments.provider';
import { chooseProvider } from './payments/provider-selection';
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
import { DisabledPayoutsProvider } from './payouts/disabled-payouts.provider';
import { AcademyPayoutsController } from './payouts/academy-payouts.controller';

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
 * blueprint §5), ParentPremiumModule (the parent premium purchase flow,
 * blueprint §5/§10 Phase 3), BookingsModule (the 1:1 booking purchase
 * flow, blueprint §5/§10 Phase 4), and ParentsModule (a paying parent
 * must have an active consented link — payments/payments.service.ts)
 * since none of them import anything back to Billing or Scheduling —
 * no cycle.
 * Owns tables: fee_ledger, payments.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    SubscriptionsModule,
    ParentPremiumModule,
    BookingsModule,
    ParentsModule,
    NotificationsModule,
  ],
  controllers: [
    FeesController,
    RecapController,
    PaymentsController,
    PayoutsController,
    AcademyPayoutsController,
  ],
  providers: [
    FeesService,
    FeesRepository,
    FeeNotificationsService,
    RecapService,
    PaymentsService,
    PaymentsRepository,
    PaymentLedgersRepository,
    PaymentSettlementRepository,
    PaymentSettlementService,
    PaymentRefundsService,
    PaymentReconciliationService,
    AcademyBillingRepository,
    MockPaymentsProvider,
    RazorpayPaymentsProvider,
    DisabledPaymentsProvider,
    {
      provide: PAYMENTS_PROVIDER,
      inject: [
        ConfigService,
        MockPaymentsProvider,
        RazorpayPaymentsProvider,
        DisabledPaymentsProvider,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockPaymentsProvider,
        razorpay: RazorpayPaymentsProvider,
        disabled: DisabledPaymentsProvider,
      ) => {
        const choice = chooseProvider({
          keyId: config.get<string>('razorpay.keyId'),
          keySecret: config.get<string>('razorpay.keySecret'),
          nodeEnv: config.get<string>('app.nodeEnv'),
        });
        if (choice === 'real') {
          paymentsLogger.log(
            'Razorpay configured — real fee collection enabled',
          );
          return razorpay;
        }
        if (choice === 'disabled') {
          paymentsLogger.error(
            'RAZORPAY_KEY_ID/SECRET not set in PRODUCTION — online payments are DISABLED (503). The mock provider is never used in production.',
          );
          return disabled;
        }
        paymentsLogger.warn(
          'RAZORPAY_KEY_ID/SECRET not set — fee collection uses a mock payments provider (development only)',
        );
        return mock;
      },
    },
    PayoutsService,
    PayoutsRepository,
    PayoutAccountsRepository,
    MockPayoutsProvider,
    RazorpayPayoutsProvider,
    DisabledPayoutsProvider,
    {
      provide: PAYOUTS_PROVIDER,
      inject: [
        ConfigService,
        MockPayoutsProvider,
        RazorpayPayoutsProvider,
        DisabledPayoutsProvider,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockPayoutsProvider,
        razorpay: RazorpayPayoutsProvider,
        disabled: DisabledPayoutsProvider,
      ) => {
        const choice = chooseProvider({
          keyId: config.get<string>('razorpay.keyId'),
          keySecret: config.get<string>('razorpay.keySecret'),
          nodeEnv: config.get<string>('app.nodeEnv'),
        });
        if (choice === 'real') {
          paymentsLogger.log('Razorpay configured — real payouts enabled');
          return razorpay;
        }
        if (choice === 'disabled') {
          paymentsLogger.error(
            'RAZORPAY_KEY_ID/SECRET not set in PRODUCTION — payouts are DISABLED (503). The mock provider is never used in production.',
          );
          return disabled;
        }
        paymentsLogger.warn(
          'RAZORPAY_KEY_ID/SECRET not set — payouts use a mock payouts provider (development only)',
        );
        return mock;
      },
    },
  ],
  exports: [FeesRepository, PaymentReconciliationService],
})
export class BillingModule {}
