import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { AssessmentsRepository } from '../assessments.repository';
import { AssessmentsService } from '../assessments.service';
import { OnlineAssessmentsService } from '../online/online-assessments.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { academicWeekStart, ASSESSMENT_TIMEZONE } from '../academic-week.util';

/**
 * No controller — background jobs only, same shape as RemindersService
 * (../../reminders/reminders.service.ts). Every job wraps its own work in
 * try/catch/log so one bad tick never blocks the next, and every
 * notification goes through the listRecentForUserByType dedupe pattern
 * (see HolidayService.applyHolidayForAcademy) so a re-run — or the daily
 * cron catching the same row again before its status flips — never
 * double-notifies.
 */
@Injectable()
export class AssessmentSchedulerService {
  private readonly logger = new Logger(AssessmentSchedulerService.name);

  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly assessments: AssessmentsService,
    private readonly onlineAssessments: OnlineAssessmentsService,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** SCHEDULED -> SCORECARD_PENDING once the assessment date has arrived
   *  (§16). */
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: ASSESSMENT_TIMEZONE })
  async openScorecardWindows(): Promise<void> {
    try {
      const today = DateTime.now()
        .setZone(ASSESSMENT_TIMEZONE)
        .toFormat('yyyy-LL-dd');
      const due = await this.repository.listScheduledForDate(today);
      for (const assessment of due) {
        await this.repository.updateStatus(assessment.id, 'scorecard_pending');
      }
      if (due.length > 0) {
        this.logger.log(
          `Opened scorecard window for ${due.length} assessment(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Scorecard-window sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** SCORECARD_PENDING -> OVERDUE past the deadline (assessment_date + 2
   *  days, Asia/Kolkata — §16). */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: ASSESSMENT_TIMEZONE })
  async sweepOverdue(): Promise<void> {
    try {
      const now = new Date();
      const overdue = await this.repository.listOverdueCandidates(now);
      for (const assessment of overdue) {
        await this.repository.updateStatus(assessment.id, 'overdue');
        await this.notifyOnce(
          assessment.tutor_id,
          'assessment_overdue',
          { assessmentId: assessment.id },
          `Overdue: ${assessment.title}`,
          'The scorecard deadline has passed — upload it as soon as possible',
        );
      }
      if (overdue.length > 0) {
        this.logger.log(`Marked ${overdue.length} assessment(s) overdue`);
      }
    } catch (err) {
      this.logger.error(
        'Overdue sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** Published online assessments whose `available_until` deadline has
   *  passed complete even if not every student submitted (§8's
   *  "completion logic must account for ALL selected batches" still
   *  applies — checkOnlineCompletion only completes early once every
   *  required student has a result; this sweep is purely the deadline
   *  fallback for the assessments that never got there naturally). */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepOnlineDeadlines(): Promise<void> {
    try {
      const open = await this.repository.listOpenOnlineCandidates();
      for (const assessment of open) {
        await this.onlineAssessments.checkOnlineCompletion(assessment.id);
      }
    } catch (err) {
      this.logger.error(
        'Online deadline sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** Weekly nudge (§40) for any teacher with an active batch who hasn't
   *  scheduled/published/completed an assessment for the current
   *  Asia/Kolkata academic week yet — once per teacher per week. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: ASSESSMENT_TIMEZONE })
  async remindWeeklyAssessment(): Promise<void> {
    try {
      const weekStartDate = academicWeekStart();
      // Compliance is per (teacher, teaching context): a teacher who has
      // run an Individual assessment this week is not thereby compliant
      // for an academy they teach in (and vice versa).
      const contexts = await this.batchesRepository.listActiveTutorContexts();
      if (contexts.length === 0) return;
      const contextKey = (tutorId: string, academyId: string | null) =>
        `${tutorId}:${academyId ?? 'individual'}`;

      const thisWeek = await this.repository.listInWeekForReminders(
        [...new Set(contexts.map((c) => c.tutor_id))],
        weekStartDate,
      );
      // A bare draft isn't compliance (nothing scheduled or published) —
      // same rule the Academy weekly-compliance tiles use, so a teacher
      // the academy sees as "not scheduled" is also the one nudged.
      const compliant = new Set(
        thisWeek
          .filter((a) => a.status !== 'draft')
          .map((a) => contextKey(a.tutor_id, a.academy_id)),
      );
      const pending = contexts.filter(
        (c) => !compliant.has(contextKey(c.tutor_id, c.academy_id)),
      );

      for (const { tutor_id: tutorId, academy_id: academyId } of pending) {
        await this.notifyOnce(
          tutorId,
          'assessment_weekly_reminder',
          { weekStartDate, context: academyId ?? 'individual' },
          "This week's assessment is still pending",
          academyId
            ? 'Every teacher needs at least one assessment per week — create one for your academy batches.'
            : 'Every teacher needs at least one assessment per week — create one for your individual batches.',
        );
      }
    } catch (err) {
      this.logger.error(
        'Weekly assessment reminder sweep failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private async notifyOnce(
    userId: string,
    type: string,
    dedupeKey: Record<string, string>,
    title: string,
    body: string,
  ): Promise<void> {
    const recent = await this.notificationsService.listRecentForUserByType(
      userId,
      type,
      new Date(0),
    );
    const alreadyNotified = recent.some((n) => {
      const payload = n.payload;
      return Object.entries(dedupeKey).every(
        ([key, value]) => payload[key] === value,
      );
    });
    if (alreadyNotified) return;

    await this.notificationsService.notify({
      userIds: [userId],
      type,
      title,
      body,
      payload: dedupeKey,
    });
  }
}
