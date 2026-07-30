import { Module } from '@nestjs/common';

/**
 * Bounded context: fee tracking ledger (Phase 1, manual — no payment
 * processing yet). Phase 2 adds subscriptions, trial enforcement,
 * Razorpay payments/payouts here.
 * Owns tables: fee_ledger. (subscriptions table exists in schema from
 * Phase 1 for the trial_ends_at column, unenforced until Phase 2.)
 */
@Module({})
export class BillingModule {}
