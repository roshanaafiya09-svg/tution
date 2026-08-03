import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { ActiveSubscriptionGuard } from './guards/active-subscription.guard';

/**
 * Bounded context: tutor subscription/trial state (blueprint §5, §10
 * Phase 2). Deliberately its own module, not nested under BillingModule —
 * BillingModule already imports SchedulingModule (for fee tracking), and
 * SchedulingModule needs this module's guard to gate batch creation, so
 * nesting here would create a module import cycle.
 * Owns table: subscriptions.
 */
@Module({
  providers: [SubscriptionsService, SubscriptionsRepository, ActiveSubscriptionGuard],
  exports: [SubscriptionsService, ActiveSubscriptionGuard],
})
export class SubscriptionsModule {}
