import {
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';
import { RemindersService } from '../reminders/reminders.service';
import { AssessmentSchedulerService } from '../assessments/scheduler/assessment-scheduler.service';
import { PaymentReconciliationService } from '../billing/payments/payment-reconciliation.service';

/**
 * External-scheduler-compatible triggers for every scheduled job (audit H7).
 * A Render free-tier instance can sleep between requests, so the in-process
 * `@Cron` timers alone cannot be trusted to fire on schedule — an HTTP hit
 * both wakes the instance and runs the job. Point an external scheduler
 * (Render's own paid Cron Job add-on, GitHub Actions' `schedule:` trigger, or
 * a free service like cron-job.org) at one `POST` per job below, on the
 * cadence documented in docs/scheduled-jobs.md, with header
 * `X-Cron-Secret: <CRON_SECRET>`.
 *
 * Deliberately ONE ROUTE PER NAMED JOB, never a "run everything" endpoint —
 * a caller states exactly what it wants to run. Every job it can reach is
 * independently idempotent (dedupe keys / status-based upserts / atomic
 * claims — see each service's own doc comments), so calling one while its
 * in-process timer is ALSO enabled (`DISABLE_INTERNAL_CRON` unset) is
 * redundant at worst, never harmful; calling one twice concurrently, or
 * repeatedly after a failure, is always safe.
 */
@Controller('internal/jobs')
@UseGuards(CronSecretGuard)
export class InternalJobsController {
  private readonly logger = new Logger(InternalJobsController.name);

  constructor(
    private readonly reminders: RemindersService,
    private readonly assessmentScheduler: AssessmentSchedulerService,
    private readonly paymentReconciliation: PaymentReconciliationService,
  ) {}

  private jobs(): Record<string, () => Promise<void>> {
    return {
      'class-reminders': () => this.reminders.sendUpcomingClassReminders(),
      'government-holidays': () => this.reminders.applyGovernmentHolidays(),
      'assessment-scorecard-windows': () =>
        this.assessmentScheduler.openScorecardWindows(),
      'assessment-overdue-sweep': () => this.assessmentScheduler.sweepOverdue(),
      'assessment-online-deadlines': () =>
        this.assessmentScheduler.sweepOnlineDeadlines(),
      'assessment-weekly-reminder': () =>
        this.assessmentScheduler.remindWeeklyAssessment(),
      'payments-expire-stale-orders': () =>
        this.paymentReconciliation.expireStaleOrders(),
      'payments-resume-stuck-refunds': () =>
        this.paymentReconciliation.resumeStuckRefunds(),
      'payments-report-stuck-payouts': () =>
        this.paymentReconciliation.reportStuckPayouts(),
    };
  }

  @Post(':job')
  @HttpCode(200)
  async run(@Param('job') job: string) {
    const handler = this.jobs()[job];
    if (!handler) {
      throw new NotFoundException(
        `Unknown job "${job}". Known jobs: ${Object.keys(this.jobs()).join(', ')}`,
      );
    }
    const startedAt = Date.now();
    // Each job's own service method already catches and logs its internal
    // errors (never lets one bad row abort the whole sweep) — a throw here
    // means the job itself is fundamentally broken, not a partial failure,
    // so it is worth a distinct log line and a non-200 for the scheduler to
    // alert on.
    try {
      await handler();
    } catch (err) {
      this.logger.error(
        `Job "${job}" threw`,
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
    const durationMs = Date.now() - startedAt;
    this.logger.log(`Job "${job}" ran in ${durationMs}ms`);
    return { job, ranAt: new Date().toISOString(), durationMs };
  }
}
