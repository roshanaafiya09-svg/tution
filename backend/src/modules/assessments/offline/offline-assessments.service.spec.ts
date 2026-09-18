jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OfflineAssessmentsService } from './offline-assessments.service';
import type { AssessmentsRepository } from '../assessments.repository';
import type { AssessmentsService } from '../assessments.service';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { AnalyticsService } from '../../analytics/analytics.service';
import type { ScorecardTemplateService } from './scorecard-template.service';
import type { ScorecardImportService } from './scorecard-import.service';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';

const ASSESSMENT_ID = 'assessment-1';
const TUTOR_ID = 'tutor-1';

function baseAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    tutor_id: TUTOR_ID,
    mode: 'offline',
    status: 'draft',
    max_score: 100,
    assessment_date: '2026-09-20',
    question_paper_object_key: null,
    ...overrides,
  };
}

function buildService(overrides: {
  findById?: jest.Mock;
  setQuestionPaper?: jest.Mock;
  updateStatus?: jest.Mock;
  setScorecardDeadline?: jest.Mock;
  listBatchIds?: jest.Mock;
  createPresignedUpload?: jest.Mock;
}) {
  const repository = {
    findById:
      overrides.findById ?? jest.fn().mockResolvedValue(baseAssessment()),
    setQuestionPaper:
      overrides.setQuestionPaper ?? jest.fn().mockResolvedValue({}),
    updateStatus:
      overrides.updateStatus ??
      jest.fn().mockResolvedValue(baseAssessment({ status: 'scheduled' })),
    setScorecardDeadline:
      overrides.setScorecardDeadline ?? jest.fn().mockResolvedValue({}),
    listBatchIds: overrides.listBatchIds ?? jest.fn().mockResolvedValue(['b1']),
  } as unknown as AssessmentsRepository;

  const assessments = {
    getOwnedAssessment: jest.fn(async (tutorId: string) => {
      const found = await repository.findById(ASSESSMENT_ID);
      if (!found || found.tutor_id !== tutorId) {
        throw new ForbiddenException('Not your assessment');
      }
      return found;
    }),
  } as unknown as AssessmentsService;

  const batchesRepository = {} as unknown as BatchesRepository;
  const notificationsService = {
    notify: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
  const analytics = { capture: jest.fn() } as unknown as AnalyticsService;
  const scorecardTemplate = {} as unknown as ScorecardTemplateService;
  const scorecardImport = {} as unknown as ScorecardImportService;
  const storage = {
    createPresignedUpload:
      overrides.createPresignedUpload ??
      jest.fn().mockResolvedValue({ uploadUrl: 'https://x', objectKey: 'k' }),
  } as unknown as StorageProvider;

  const service = new OfflineAssessmentsService(
    repository,
    assessments,
    batchesRepository,
    notificationsService,
    analytics,
    scorecardTemplate,
    scorecardImport,
    storage,
  );

  return { service, repository };
}

describe('OfflineAssessmentsService.schedule — mandatory question paper gate (spec §10/§12/§34)', () => {
  it('rejects scheduling when no question paper has been uploaded', async () => {
    const { service } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue(baseAssessment({ question_paper_object_key: null })),
    });

    await expect(service.schedule(TUTOR_ID, ASSESSMENT_ID)).rejects.toThrow(
      'Question paper is required before scheduling an offline assessment.',
    );
  });

  it('rejects scheduling with no assessment date', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        baseAssessment({
          question_paper_object_key: 'assessment-question-papers/t/a/x.pdf',
          assessment_date: null,
        }),
      ),
    });

    await expect(
      service.schedule(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scheduling with no valid max score', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        baseAssessment({
          question_paper_object_key: 'assessment-question-papers/t/a/x.pdf',
          max_score: 0,
        }),
      ),
    });

    await expect(
      service.schedule(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('schedules once title/subject/batches/date/maxScore/question paper are all present', async () => {
    const updateStatus = jest
      .fn()
      .mockResolvedValue(baseAssessment({ status: 'scheduled' }));
    const setScorecardDeadline = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        baseAssessment({
          question_paper_object_key: 'assessment-question-papers/t/a/x.pdf',
        }),
      ),
      updateStatus,
      setScorecardDeadline,
    });

    await service.schedule(TUTOR_ID, ASSESSMENT_ID);

    expect(updateStatus).toHaveBeenCalledWith(ASSESSMENT_ID, 'scheduled');
    // Deadline = assessment date (2026-09-20, Asia/Kolkata) + 2 days.
    expect(setScorecardDeadline).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      expect.any(Date),
    );
    const calls = setScorecardDeadline.mock.calls as [string, Date][];
    const deadline = calls[0][1];
    expect(deadline.toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('rejects scheduling an assessment that is not draft (no re-scheduling)', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        baseAssessment({
          status: 'scheduled',
          question_paper_object_key: 'assessment-question-papers/t/a/x.pdf',
        }),
      ),
    });

    await expect(
      service.schedule(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('OfflineAssessmentsService.createQuestionPaperUploadUrl', () => {
  it('rejects a disallowed mime type', async () => {
    const { service } = buildService({});
    await expect(
      service.createQuestionPaperUploadUrl(
        TUTOR_ID,
        ASSESSMENT_ID,
        'application/zip',
        1000,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an oversized file', async () => {
    const { service } = buildService({});
    await expect(
      service.createQuestionPaperUploadUrl(
        TUTOR_ID,
        ASSESSMENT_ID,
        'application/pdf',
        999_999_999,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts PDF/DOC/DOCX within the size cap and persists the object key before minting the upload URL', async () => {
    const setQuestionPaper = jest.fn().mockResolvedValue({});
    const { service } = buildService({ setQuestionPaper });

    await service.createQuestionPaperUploadUrl(
      TUTOR_ID,
      ASSESSMENT_ID,
      'application/pdf',
      1000,
    );

    expect(setQuestionPaper).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      expect.stringContaining(
        `assessment-question-papers/${TUTOR_ID}/${ASSESSMENT_ID}/`,
      ),
      'application/pdf',
    );
  });
});

describe('OfflineAssessmentsService — cross-teacher access', () => {
  it("rejects operating on another teacher's assessment", async () => {
    const { service } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue(baseAssessment({ tutor_id: 'someone-else' })),
    });

    await expect(
      service.schedule(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
