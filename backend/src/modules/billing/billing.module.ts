import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { FeesRepository } from './fees/fees.repository';
import { RecapController } from './recap/recap.controller';
import { RecapService } from './recap/recap.service';

/**
 * Bounded context: fee tracking ledger (Phase 1, manual — no payment
 * processing yet). Phase 2 adds Razorpay payments/payouts here.
 * Trial/subscription state lives in the sibling SubscriptionsModule
 * instead (see subscriptions/subscriptions.module.ts) — this module
 * already imports SchedulingModule, and SchedulingModule needs the
 * subscriptions guard, so nesting it here would cycle. It's safe for
 * *this* module to import SubscriptionsModule (for the recap endpoint,
 * blueprint §5) since Subscriptions imports nothing back — no cycle.
 * Owns tables: fee_ledger.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, SubscriptionsModule],
  controllers: [FeesController, RecapController],
  providers: [FeesService, FeesRepository, RecapService],
  exports: [FeesRepository],
})
export class BillingModule {}
