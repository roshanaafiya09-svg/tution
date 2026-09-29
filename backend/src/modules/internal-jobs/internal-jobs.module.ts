import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { BillingModule } from '../billing/billing.module';
import { InternalJobsController } from './internal-jobs.controller';
import { CronSecretGuard } from './cron-secret.guard';

/** Wires the external-scheduler endpoint (audit H7) to the services that
 *  already own each scheduled job — no job logic lives here. */
@Module({
  imports: [RemindersModule, AssessmentsModule, BillingModule],
  controllers: [InternalJobsController],
  providers: [CronSecretGuard],
})
export class InternalJobsModule {}
