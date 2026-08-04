import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { ParentsModule } from '../../parents/parents.module';
import { ParentPremiumController } from './parent-premium.controller';
import { ParentPremiumService } from './parent-premium.service';
import { ParentPremiumRepository } from './parent-premium.repository';
import { ParentPremiumGuard } from './guards/parent-premium.guard';
import { ParentPremiumForStudentGuard } from './guards/parent-premium-for-student.guard';

/**
 * Bounded context: parent premium subscription state (blueprint §5,
 * §10 Phase 3) — "₹99–149/mo for AI doubt solver + rich digests."
 * Deliberately its own module rather than nested under BillingModule,
 * same reasoning as SubscriptionsModule: BillingModule needs this
 * module's service for the payments flow, and ai/digests + ai/doubt-
 * solver need its guards, so importing it from Billing (rather than
 * routing through BillingModule's own exports) avoids a cycle.
 * Imports ParentsModule for isActiveForStudent's linked-parent lookup —
 * safe, ParentsModule imports nothing back here.
 * Owns table: parent_premium_subscriptions.
 */
@Module({
  imports: [IdentityModule, ParentsModule],
  controllers: [ParentPremiumController],
  providers: [
    ParentPremiumService,
    ParentPremiumRepository,
    ParentPremiumGuard,
    ParentPremiumForStudentGuard,
  ],
  exports: [
    ParentPremiumService,
    ParentPremiumGuard,
    ParentPremiumForStudentGuard,
  ],
})
export class ParentPremiumModule {}
