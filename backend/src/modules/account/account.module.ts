import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustModule } from '../trust/trust.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

/**
 * Cross-cutting: data export + account deletion (blueprint §4/§9). Owns
 * no tables — it's a thin composition root over every other bounded
 * context's exported repositories/services, the same relationship
 * AppModule has to everything else. Nothing imports AccountModule back,
 * so this stays acyclic despite touching so much of the graph.
 */
@Module({
  imports: [
    IdentityModule,
    TrustModule,
    SchedulingModule,
    AssessmentModule,
    BillingModule,
    NotificationsModule,
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
