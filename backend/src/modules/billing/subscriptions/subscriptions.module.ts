import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { AcademySubscriptionsService } from './academy-subscriptions.service';
import { AcademySubscriptionsRepository } from './academy-subscriptions.repository';
import { ActiveSubscriptionGuard } from './guards/active-subscription.guard';

/**
 * Bounded context: subscription/trial state (blueprint §5, §10 Phase 2) —
 * the teacher's Individual plan (`subscriptions`) and, separately, the
 * academy's own plan (`academy_subscriptions`). Deliberately its own
 * module, not nested under BillingModule —
 * BillingModule already imports SchedulingModule (for fee tracking), and
 * SchedulingModule needs this module's guard to gate batch creation, so
 * nesting here would create a module import cycle.
 * Owns tables: subscriptions, academy_subscriptions.
 */
@Module({
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    AcademySubscriptionsService,
    AcademySubscriptionsRepository,
    ActiveSubscriptionGuard,
  ],
  exports: [
    SubscriptionsService,
    AcademySubscriptionsService,
    ActiveSubscriptionGuard,
  ],
})
export class SubscriptionsModule {}
