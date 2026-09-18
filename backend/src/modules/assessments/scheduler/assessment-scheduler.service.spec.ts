jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));
// Same workaround as reminders.service.spec.ts: @nestjs/schedule ships
// pure ESM, which this project's ts-jest config doesn't transform —
// @Cron is a plain method decorator that does nothing at construction
// time, so a no-op stub is all this test needs.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_DAY_AT_1AM: '0 1 * * *',
    EVERY_DAY_AT_2AM: '0 2 * * *',
    EVERY_DAY_AT_9AM: '0 9 * * *',
    EVERY_HOUR: '0 * * * *',
  },
}));

import { AssessmentSchedulerService } from './assessment-scheduler.service';
import type { AssessmentsRepository } from '../assessments.repository';
import type { AssessmentsService } from '../assessments.service';
import type { OnlineAssessmentsService } from '../online/online-assessments.service';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { NotificationsService } from '../../notifications/notifications.service';

function buildScheduler(overrides: {
  listScheduledForDate?: jest.Mock;
  updateStatus?: jest.Mock;
  listOverdueCandidates?: jest.Mock;
  listOpenOnlineCandidates?: jest.Mock;
  listForTutorsInWeek?: jest.Mock;
  listDistinctTutorIdsWithActiveBatches?: jest.Mock;
  listRecentForUserByType?: jest.Mock;
  notify?: jest.Mock;
  checkOnlineCompletion?: jest.Mock;
}) {
  const repository = {
    listScheduledForDate:
      overrides.listScheduledForDate ?? jest.fn().mockResolvedValue([]),
    updateStatus: overrides.updateStatus ?? jest.fn().mockResolvedValue({}),
    listOverdueCandidates:
      overrides.listOverdueCandidates ?? jest.fn().mockResolvedValue([]),
    listOpenOnlineCandidates:
      overrides.listOpenOnlineCandidates ?? jest.fn().mockResolvedValue([]),
    listForTutorsInWeek:
      overrides.listForTutorsInWeek ?? jest.fn().mockResolvedValue([]),
  } as unknown as AssessmentsRepository;

  const assessments = {} as unknown as AssessmentsService;

  const onlineAssessments = {
    checkOnlineCompletion:
      overrides.checkOnlineCompletion ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as OnlineAssessmentsService;

  const batchesRepository = {
    listDistinctTutorIdsWithActiveBatches:
      overrides.listDistinctTutorIdsWithActiveBatches ??
      jest.fn().mockResolvedValue([]),
  } as unknown as BatchesRepository;

  const notify = overrides.notify ?? jest.fn().mockResolvedValue(undefined);
  const notificationsService = {
    notify,
    listRecentForUserByType:
      overrides.listRecentForUserByType ?? jest.fn().mockResolvedValue([]),
  } as unknown as NotificationsService;

  const scheduler = new AssessmentSchedulerService(
    repository,
    assessments,
    onlineAssessments,
    batchesRepository,
    notificationsService,
  );

  return { scheduler, repository, notificationsService, notify };
}

describe('AssessmentSchedulerService.openScorecardWindows', () => {
  it('flips every due SCHEDULED assessment to SCORECARD_PENDING', async () => {
    const updateStatus = jest.fn().mockResolvedValue({});
    const { scheduler } = buildScheduler({
      listScheduledForDate: jest
        .fn()
        .mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
      updateStatus,
    });

    await scheduler.openScorecardWindows();

    expect(updateStatus).toHaveBeenCalledWith('a1', 'scorecard_pending');
    expect(updateStatus).toHaveBeenCalledWith('a2', 'scorecard_pending');
  });

  it('never throws out of the cron tick on repository failure', async () => {
    const { scheduler } = buildScheduler({
      listScheduledForDate: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(scheduler.openScorecardWindows()).resolves.toBeUndefined();
  });
});

describe('AssessmentSchedulerService.sweepOverdue', () => {
  it('marks each candidate OVERDUE and notifies its teacher exactly once', async () => {
    const updateStatus = jest.fn().mockResolvedValue({});
    const notify = jest.fn().mockResolvedValue(undefined);
    const { scheduler } = buildScheduler({
      listOverdueCandidates: jest
        .fn()
        .mockResolvedValue([
          { id: 'a1', tutor_id: 'tutor-1', title: 'Algebra Test' },
        ]),
      updateStatus,
      notify,
    });

    await scheduler.sweepOverdue();

    expect(updateStatus).toHaveBeenCalledWith('a1', 'overdue');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['tutor-1'],
        type: 'assessment_overdue',
      }),
    );
  });

  it('does not re-notify a teacher already notified for the same assessment', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const { scheduler } = buildScheduler({
      listOverdueCandidates: jest
        .fn()
        .mockResolvedValue([
          { id: 'a1', tutor_id: 'tutor-1', title: 'Algebra Test' },
        ]),
      listRecentForUserByType: jest
        .fn()
        .mockResolvedValue([{ payload: { assessmentId: 'a1' } }]),
      notify,
    });

    await scheduler.sweepOverdue();

    expect(notify).not.toHaveBeenCalled();
  });
});

describe('AssessmentSchedulerService.sweepOnlineDeadlines', () => {
  it('runs the completion check for every open online assessment', async () => {
    const checkOnlineCompletion = jest.fn().mockResolvedValue(undefined);
    const { scheduler } = buildScheduler({
      listOpenOnlineCandidates: jest
        .fn()
        .mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
      checkOnlineCompletion,
    });

    await scheduler.sweepOnlineDeadlines();

    expect(checkOnlineCompletion).toHaveBeenCalledWith('a1');
    expect(checkOnlineCompletion).toHaveBeenCalledWith('a2');
  });
});

describe('AssessmentSchedulerService.remindWeeklyAssessment', () => {
  it('nudges only teachers with no assessment for the current week', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const { scheduler } = buildScheduler({
      listDistinctTutorIdsWithActiveBatches: jest
        .fn()
        .mockResolvedValue(['tutor-1', 'tutor-2']),
      listForTutorsInWeek: jest
        .fn()
        .mockResolvedValue([{ tutor_id: 'tutor-1' }]),
      notify,
    });

    await scheduler.remindWeeklyAssessment();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['tutor-2'],
        type: 'assessment_weekly_reminder',
      }),
    );
  });

  it('does nothing when every teacher already has an assessment this week', async () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const { scheduler } = buildScheduler({
      listDistinctTutorIdsWithActiveBatches: jest
        .fn()
        .mockResolvedValue(['tutor-1']),
      listForTutorsInWeek: jest
        .fn()
        .mockResolvedValue([{ tutor_id: 'tutor-1' }]),
      notify,
    });

    await scheduler.remindWeeklyAssessment();

    expect(notify).not.toHaveBeenCalled();
  });
});
