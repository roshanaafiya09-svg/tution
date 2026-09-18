jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AcademyOwnerAssessmentsService } from './academy-owner-assessments.service';
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
    listBatchesForAssessment: jest.fn().mockResolvedValue([]),
    listResultsForAssessment: jest.fn().mockResolvedValue([]),
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
});
