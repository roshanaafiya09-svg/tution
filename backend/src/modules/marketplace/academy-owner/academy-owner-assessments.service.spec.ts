jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AcademyOwnerAssessmentsService,
  pickPrimaryAssessment,
  summarizeCompliance,
} from './academy-owner-assessments.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { AssessmentsRepository } from '../../assessments/assessments.repository';
import type { OfflineAssessmentsService } from '../../assessments/offline/offline-assessments.service';

const OWNER_USER_ID = 'owner-1';
const ACADEMY_ID = 'academy-1';
const TUTOR_ID = 'tutor-1';
const ASSESSMENT_ID = 'assessment-1';

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  findActiveMembership?: jest.Mock;
  findById?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  listForTutorsInWeek?: jest.Mock;
  listBatchesForAssessment?: jest.Mock;
  listResultsForAssessment?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID }),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    findActiveMembership:
      overrides.findActiveMembership ??
      jest.fn().mockResolvedValue({ id: 'm1' }),
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest
        .fn()
        .mockResolvedValue([
          { tutor_id: TUTOR_ID, display_name: 'Teacher One' },
        ]),
  } as unknown as AcademyMembershipsRepository;

  const assessmentsRepository = {
    findById:
      overrides.findById ??
      jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'offline',
        status: 'completed',
      }),
    listForTutorsInWeek:
      overrides.listForTutorsInWeek ?? jest.fn().mockResolvedValue([]),
    listBatchesForAssessment:
      overrides.listBatchesForAssessment ?? jest.fn().mockResolvedValue([]),
    listResultsForAssessment:
      overrides.listResultsForAssessment ?? jest.fn().mockResolvedValue([]),
    listScorecardImports: jest.fn().mockResolvedValue([]),
  } as unknown as AssessmentsRepository;

  const offlineAssessments = {
    resolveQuestionPaperUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://signed-url' }),
  } as unknown as OfflineAssessmentsService;

  const service = new AcademyOwnerAssessmentsService(
    academiesRepository,
    academyMembershipsRepository,
    assessmentsRepository,
    offlineAssessments,
  );

  return { service };
}

describe('AcademyOwnerAssessmentsService — cross-academy access', () => {
  it("rejects reading an assessment whose teacher is not an active member of the caller's academy", async () => {
    const { service } = buildService({
      findActiveMembership: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getAssessmentDetail(OWNER_USER_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when no academy is linked to the caller's account", async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getAssessmentDetail(OWNER_USER_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unknown assessment id', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getAssessmentDetail(OWNER_USER_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows reading an assessment belonging to an active member teacher', async () => {
    const { service } = buildService({});
    const detail = await service.getAssessmentDetail(
      OWNER_USER_ID,
      ASSESSMENT_ID,
    );
    expect(detail.id).toBe(ASSESSMENT_ID);
  });

  it('question paper access is gated the same way as assessment detail access', async () => {
    const { service } = buildService({
      findActiveMembership: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getQuestionPaperDownloadUrl(OWNER_USER_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AcademyOwnerAssessmentsService.getWeeklyCompliance', () => {
  it('reports NOT SCHEDULED for a teacher with no assessment this week', async () => {
    const { service } = buildService({
      listForTutorsInWeek: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.teachers).toHaveLength(1);
    expect(result.teachers[0].status).toBe('not_scheduled');
    expect(result.summary.notScheduled).toBe(1);
  });

  it('reports COMPLETED for a teacher whose weekly assessment is done, even with additional assessments that week', async () => {
    const { service } = buildService({
      listForTutorsInWeek: jest.fn().mockResolvedValue([
        {
          id: 'a1',
          tutor_id: TUTOR_ID,
          mode: 'online',
          status: 'published',
          created_at: new Date('2026-09-15'),
        },
        {
          id: 'a2',
          tutor_id: TUTOR_ID,
          mode: 'offline',
          status: 'completed',
          created_at: new Date('2026-09-16'),
        },
      ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.teachers[0].status).toBe('completed');
    expect(result.teachers[0].additionalAssessmentCount).toBe(1);
    expect(result.summary.completed).toBe(1);
  });

  it('returns valid zero compliance (not an error) for an academy with no active teachers', async () => {
    const listForTutorsInWeek = jest.fn().mockResolvedValue([]);
    const { service } = buildService({
      listActiveForAcademy: jest.fn().mockResolvedValue([]),
      listForTutorsInWeek,
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result).toEqual({
      weekStartDate: '2026-09-14',
      summary: {
        teachers: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        notScheduled: 0,
      },
      teachers: [],
    });
    expect(listForTutorsInWeek).toHaveBeenCalledWith([], '2026-09-14');
  });

  it('reports PENDING for scheduled / published / scorecard_pending and OVERDUE for overdue', async () => {
    const teachers = ['t-a', 't-b', 't-c', 't-d'].map((tutor_id) => ({
      tutor_id,
      display_name: tutor_id,
    }));
    const { service } = buildService({
      listActiveForAcademy: jest.fn().mockResolvedValue(teachers),
      listForTutorsInWeek: jest.fn().mockResolvedValue([
        { id: 'a', tutor_id: 't-a', mode: 'offline', status: 'scheduled' },
        { id: 'b', tutor_id: 't-b', mode: 'online', status: 'published' },
        {
          id: 'c',
          tutor_id: 't-c',
          mode: 'offline',
          status: 'scorecard_pending',
        },
        { id: 'd', tutor_id: 't-d', mode: 'offline', status: 'overdue' },
      ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.summary).toEqual({
      teachers: 4,
      completed: 0,
      pending: 3,
      overdue: 1,
      notScheduled: 0,
    });
  });

  it('summarises multiple teachers with mixed completed / pending / no-record states', async () => {
    const { service } = buildService({
      listActiveForAcademy: jest.fn().mockResolvedValue([
        { tutor_id: 't-done', display_name: 'Done' },
        { tutor_id: 't-wait', display_name: 'Waiting' },
        { tutor_id: 't-none', display_name: 'None' },
      ]),
      listForTutorsInWeek: jest.fn().mockResolvedValue([
        { id: 'a1', tutor_id: 't-done', mode: 'online', status: 'completed' },
        { id: 'a2', tutor_id: 't-wait', mode: 'offline', status: 'scheduled' },
      ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.summary).toEqual({
      teachers: 3,
      completed: 1,
      pending: 1,
      overdue: 0,
      notScheduled: 1,
    });
    expect(result.teachers.map((t) => [t.tutorId, t.status])).toEqual([
      ['t-done', 'completed'],
      ['t-wait', 'scheduled'],
      ['t-none', 'not_scheduled'],
    ]);
    expect(result.teachers[2].assessment).toBeNull();
  });

  it('throws NotFound (which the web page gates on hasAcademy) when the account has no academy', async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getWeeklyCompliance(OWNER_USER_ID, '2026-09-14'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('weekly compliance — status priority and week handling', () => {
  it('shows an OVERDUE assessment ahead of a newer pending one so the academy sees the problem', async () => {
    const { service } = buildService({
      listForTutorsInWeek: jest.fn().mockResolvedValue([
        { id: 'new', tutor_id: TUTOR_ID, mode: 'online', status: 'published' },
        { id: 'old', tutor_id: TUTOR_ID, mode: 'offline', status: 'overdue' },
      ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.teachers[0].status).toBe('overdue');
    expect(result.teachers[0].assessment?.id).toBe('old');
    expect(result.teachers[0].additionalAssessmentCount).toBe(1);
  });

  it('prefers a real scheduled assessment over a newer bare draft', async () => {
    const { service } = buildService({
      listForTutorsInWeek: jest.fn().mockResolvedValue([
        { id: 'draft', tutor_id: TUTOR_ID, mode: 'online', status: 'draft' },
        {
          id: 'sched',
          tutor_id: TUTOR_ID,
          mode: 'offline',
          status: 'scheduled',
        },
      ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );

    expect(result.teachers[0].status).toBe('scheduled');
    expect(result.summary.pending).toBe(1);
  });

  it('counts a teacher whose only assessment is a draft as not scheduled, so the tiles add up', async () => {
    const { service } = buildService({
      listForTutorsInWeek: jest
        .fn()
        .mockResolvedValue([
          { id: 'draft', tutor_id: TUTOR_ID, mode: 'online', status: 'draft' },
        ]),
    });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-14',
    );
    const { teachers, completed, pending, overdue, notScheduled } =
      result.summary;

    expect(result.teachers[0].status).toBe('draft');
    expect(notScheduled).toBe(1);
    expect(completed + pending + overdue + notScheduled).toBe(teachers);
  });

  it("snaps any date inside the week to that week's Monday", async () => {
    const listForTutorsInWeek = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ listForTutorsInWeek });

    const result = await service.getWeeklyCompliance(
      OWNER_USER_ID,
      '2026-09-17',
    );

    expect(result.weekStartDate).toBe('2026-09-14');
    expect(listForTutorsInWeek).toHaveBeenCalledWith([TUTOR_ID], '2026-09-14');
  });

  it('exposes student names on assessment detail results', async () => {
    const listResultsForAssessment = jest.fn().mockResolvedValue([
      {
        batch_id: 'b1',
        student_id: 's1',
        display_name: 'Asha',
        score: 4,
        max_score: 5,
        source: 'offline_scorecard',
        submitted_at: new Date(),
      },
    ]);
    const { service } = buildService({
      listBatchesForAssessment: jest
        .fn()
        .mockResolvedValue([{ id: 'b1', title: 'Batch 1' }]),
      listResultsForAssessment,
    });

    const detail = await service.getAssessmentDetail(
      OWNER_USER_ID,
      ASSESSMENT_ID,
    );

    expect(detail.batches[0].results[0]).toMatchObject({
      studentId: 's1',
      studentName: 'Asha',
    });
  });
});

describe('pickPrimaryAssessment / summarizeCompliance', () => {
  it('returns null for no assessments and keeps the newest among equals', () => {
    expect(pickPrimaryAssessment([])).toBeNull();
    const rows = [
      { id: 'newest', status: 'scheduled' as const },
      { id: 'older', status: 'published' as const },
    ];
    expect(pickPrimaryAssessment(rows)?.id).toBe('newest');
  });

  it('puts every status in exactly one bucket', () => {
    const summary = summarizeCompliance([
      'completed',
      'overdue',
      'scheduled',
      'published',
      'scorecard_pending',
      'draft',
      'not_scheduled',
    ]);
    expect(summary).toEqual({
      teachers: 7,
      completed: 1,
      overdue: 1,
      pending: 3,
      notScheduled: 2,
    });
  });
});
