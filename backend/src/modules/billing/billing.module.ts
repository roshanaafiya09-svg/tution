import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { FeesRepository } from './fees/fees.repository';

/**
 * Bounded context: fee tracking ledger (Phase 1, manual — no payment
 * processing yet). Phase 2 adds subscriptions, trial enforcement,
 * Razorpay payments/payouts here.
 * Owns tables: fee_ledger. (subscriptions table exists in schema from
 * Phase 1 for the trial_ends_at column, unenforced until Phase 2.)
 */
@Module({
  imports: [IdentityModule, SchedulingModule],
  controllers: [FeesController],
  providers: [FeesService, FeesRepository],
  exports: [FeesRepository],
})
export class BillingModule {}
