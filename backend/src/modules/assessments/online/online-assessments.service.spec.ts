jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OnlineAssessmentsService } from './online-assessments.service';
import type { AssessmentsRepository } from '../assessments.repository';
import type { AssessmentsService } from '../assessments.service';
import type { MaterialsRepository } from '../../delivery/materials/materials.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { AnalyticsService } from '../../analytics/analytics.service';
import type { AssessmentAiService } from '../../ai/assessment-ai/assessment-ai.service';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';

const ASSESSMENT_ID = 'assessment-1';
const TUTOR_ID = 'tutor-1';
const STUDENT_ID = 'student-1';
const BATCH_IDS = ['batch-a', 'batch-b'];

const QUESTIONS = [
  {
    id: 'q1',
    assessment_id: ASSESSMENT_ID,
    order_index: 0,
    question_text: 'Q1',
    choices: ['a', 'b', 'c', 'd'],
    correct_choice_index: 1,
    marks: 2,
    difficulty: 'easy',
    explanation: null,
  },
  {
    id: 'q2',
    assessment_id: ASSESSMENT_ID,
    order_index: 1,
    question_text: 'Q2',
    choices: ['a', 'b', 'c', 'd'],
    correct_choice_index: 3,
    marks: 5,
    difficulty: 'hard',
    explanation: null,
  },
];

function buildService(overrides: {
  findById?: jest.Mock;
  listQuestions?: jest.Mock;
  listBatchIds?: jest.Mock;
  findResult?: jest.Mock;
  insertResult?: jest.Mock;
  countResultsForAssessment?: jest.Mock;
  updateStatus?: jest.Mock;
  requiredStudentIds?: jest.Mock;
  assertEnrolledInAny?: jest.Mock;
  notify?: jest.Mock;
  listForStudent?: jest.Mock;
  listForTutorsAcrossBatches?: jest.Mock;
  listOfflineResultsForStudent?: jest.Mock;
}) {
  const repository = {
    findById:
      overrides.findById ??
      jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'published',
        max_score: 7,
        available_until: null,
      }),
    listQuestions:
      overrides.listQuestions ?? jest.fn().mockResolvedValue(QUESTIONS),
    listBatchIds:
      overrides.listBatchIds ?? jest.fn().mockResolvedValue(BATCH_IDS),
    findResult: overrides.findResult ?? jest.fn().mockResolvedValue(undefined),
    insertResult:
      overrides.insertResult ??
      jest.fn().mockResolvedValue({ id: 'result-1', submitted_at: new Date() }),
    countResultsForAssessment:
      overrides.countResultsForAssessment ?? jest.fn().mockResolvedValue(1),
    updateStatus: overrides.updateStatus ?? jest.fn().mockResolvedValue({}),
    listForTutorsAcrossBatches:
      overrides.listForTutorsAcrossBatches ?? jest.fn().mockResolvedValue([]),
    listOfflineResultsForStudent:
      overrides.listOfflineResultsForStudent ?? jest.fn().mockResolvedValue([]),
  } as unknown as AssessmentsRepository;

  const assessments = {
    getOwnedAssessment: jest.fn(async (tutorId: string) => {
      const found = await repository.findById(ASSESSMENT_ID);
      if (!found || found.tutor_id !== tutorId) {
        throw new ForbiddenException('Not your assessment');
      }
      return found;
    }),
    assertEnrolledInAny:
      overrides.assertEnrolledInAny ??
      jest.fn().mockResolvedValue(BATCH_IDS[0]),
    requiredStudentIds:
      overrides.requiredStudentIds ?? jest.fn().mockResolvedValue([STUDENT_ID]),
  } as unknown as AssessmentsService;

  const materialsRepository = {} as unknown as MaterialsRepository;
  const batchesRepository = {
    listForStudent: overrides.listForStudent ?? jest.fn().mockResolvedValue([]),
  } as unknown as BatchesRepository;

  const notify = overrides.notify ?? jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;
  const analytics = { capture: jest.fn() } as unknown as AnalyticsService;
  const assessmentAi = {} as unknown as AssessmentAiService;
  const storage = {} as unknown as StorageProvider;

  const service = new OnlineAssessmentsService(
    repository,
    assessments,
    materialsRepository,
    batchesRepository,
    notificationsService,
    analytics,
    assessmentAi,
    storage,
  );

  return { service, repository, assessments, notify };
}

describe('OnlineAssessmentsService.publish', () => {
  it('rejects publishing with no questions', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'draft',
        max_score: null,
      }),
      listQuestions: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.publish(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects publishing without a max score', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'draft',
        max_score: null,
      }),
    });

    await expect(
      service.publish(TUTOR_ID, ASSESSMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes and notifies every active student across ALL selected batches', async () => {
    const requiredStudentIds = jest
      .fn()
      .mockResolvedValue(['student-1', 'student-2', 'student-3']);
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'draft',
        max_score: 7,
      }),
      requiredStudentIds,
      notify,
    });

    await service.publish(TUTOR_ID, ASSESSMENT_ID);

    expect(requiredStudentIds).toHaveBeenCalledWith(BATCH_IDS);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['student-1', 'student-2', 'student-3'],
        type: 'assessment_published',
      }),
    );
  });
});

describe('OnlineAssessmentsService.submit', () => {
  it("rejects a student not enrolled in any of the assessment's selected batches", async () => {
    const assertEnrolledInAny = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('not enrolled'));
    const { service } = buildService({ assertEnrolledInAny });

    await expect(
      service.submit(STUDENT_ID, ASSESSMENT_ID, [0, 0]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a second attempt from the same student', async () => {
    const { service } = buildService({
      findResult: jest.fn().mockResolvedValue({ id: 'existing' }),
    });

    await expect(
      service.submit(STUDENT_ID, ASSESSMENT_ID, [0, 0]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a mismatched answer count', async () => {
    const { service } = buildService({});

    await expect(
      service.submit(STUDENT_ID, ASSESSMENT_ID, [0]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("scores deterministically, weighted by each question's marks — no AI call involved", async () => {
    const insertResult = jest.fn().mockResolvedValue({
      id: 'result-1',
      submitted_at: new Date('2026-09-17'),
    });
    const { service } = buildService({ insertResult });

    // Q1 correct (2 marks), Q2 wrong (5 marks) -> total 2.
    const result = await service.submit(STUDENT_ID, ASSESSMENT_ID, [1, 0]);

    expect(result.score).toBe(2);
    expect(insertResult).toHaveBeenCalledWith(
      expect.objectContaining({ score: 2, source: 'online_submission' }),
    );
  });

  it('marks the assessment completed once every required student across all selected batches has a result', async () => {
    const updateStatus = jest.fn().mockResolvedValue({});
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      countResultsForAssessment: jest.fn().mockResolvedValue(3),
      requiredStudentIds: jest
        .fn()
        .mockResolvedValue(['student-1', 'student-2', 'student-3']),
      updateStatus,
      notify,
    });

    await service.submit(STUDENT_ID, ASSESSMENT_ID, [1, 3]);

    expect(updateStatus).toHaveBeenCalledWith(
      ASSESSMENT_ID,
      'completed',
      expect.objectContaining({ completedLate: false }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'assessment_completed' }),
    );
  });

  it('does not complete while students from other selected batches still have not submitted', async () => {
    const updateStatus = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      countResultsForAssessment: jest.fn().mockResolvedValue(1),
      requiredStudentIds: jest
        .fn()
        .mockResolvedValue(['student-1', 'student-2', 'student-3']),
      updateStatus,
    });

    await service.submit(STUDENT_ID, ASSESSMENT_ID, [1, 3]);

    expect(updateStatus).not.toHaveBeenCalled();
  });
});

describe('OnlineAssessmentsService.listForStudent', () => {
  const online = (over: Record<string, unknown>) => ({
    id: 'on-1',
    title: 'Online',
    subject_id: 'subj',
    status: 'published',
    published_at: new Date('2026-09-16'),
    max_score: 10,
    ...over,
  });

  it('returns an empty list (not an error) for a student with no batches and no offline results', async () => {
    const { service } = buildService({});
    await expect(service.listForStudent(STUDENT_ID)).resolves.toEqual([]);
  });

  it("includes the student's imported offline results, marked offline", async () => {
    const { service } = buildService({
      listOfflineResultsForStudent: jest.fn().mockResolvedValue([
        {
          id: 'off-1',
          title: 'Unit Test',
          subject_id: 'subj',
          assessment_date: '2026-09-15',
          score: 42,
          max_score: 50,
        },
      ]),
    });

    const list = await service.listForStudent(STUDENT_ID);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'off-1',
      mode: 'offline',
      attempted: true,
      score: 42,
      maxScore: 50,
      assessmentDate: '2026-09-15',
    });
  });

  it('lists open unattempted online assessments first, then attempted, then offline results', async () => {
    const { service } = buildService({
      listForStudent: jest.fn().mockResolvedValue([{ id: 'batch-a' }]),
      listForTutorsAcrossBatches: jest
        .fn()
        .mockResolvedValue([
          online({ id: 'done', status: 'completed' }),
          online({ id: 'open', status: 'published' }),
        ]),
      findResult: jest.fn((assessmentId: string) =>
        Promise.resolve(assessmentId === 'done' ? { score: 7 } : undefined),
      ),
      listOfflineResultsForStudent: jest.fn().mockResolvedValue([
        {
          id: 'off-1',
          title: 'Offline',
          subject_id: 'subj',
          assessment_date: '2026-09-15',
          score: 1,
          max_score: 2,
        },
      ]),
    });

    const list = await service.listForStudent(STUDENT_ID);

    expect(list.map((a) => a.id)).toEqual(['open', 'done', 'off-1']);
    expect(list[0]).toMatchObject({ attempted: false, score: null });
    expect(list[1]).toMatchObject({ attempted: true, score: 7 });
  });
});

describe('OnlineAssessmentsService.getToTake', () => {
  it('tells a student who missed a completed assessment that it is no longer open', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'completed',
        title: 'Closed',
        max_score: 7,
      }),
    });

    const result = await service.getToTake(STUDENT_ID, ASSESSMENT_ID);

    expect(result).toMatchObject({ attempted: false, open: false });
  });

  it('keeps a published, unattempted assessment open and hides the answer key', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: ASSESSMENT_ID,
        tutor_id: TUTOR_ID,
        mode: 'online',
        status: 'published',
        title: 'Live',
        max_score: 7,
      }),
    });

    const result = await service.getToTake(STUDENT_ID, ASSESSMENT_ID);

    expect(result).toMatchObject({ attempted: false, open: true });
    expect(JSON.stringify(result)).not.toContain('correctChoiceIndex');
  });
});
