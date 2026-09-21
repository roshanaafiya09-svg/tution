// See teacher-leave.service.spec.ts for why this boilerplate exists:
// AssessmentsRepository/BatchesRepository transitively import
// database.module.ts (real Kysely/pg pool, an ESM dep Jest can't
// transform) and `sql` as a real value from 'kysely'.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import type { AssessmentsRepository } from './assessments.repository';
import type { BatchesService } from '../scheduling/batches/batches.service';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { TeachingContextService } from '../teaching-context/teaching-context.service';

function buildService(overrides: {
  getOwnedBatch?: jest.Mock;
  findEnrollment?: jest.Mock;
  listDistinctStudentIdsForBatches?: jest.Mock;
}) {
  const repository = {} as unknown as AssessmentsRepository;

  const getOwnedBatch =
    overrides.getOwnedBatch ?? jest.fn().mockResolvedValue({ id: 'batch-1' });
  const batchesService = {
    getOwnedBatch,
  } as unknown as BatchesService;

  const batchesRepository = {
    findEnrollment:
      overrides.findEnrollment ?? jest.fn().mockResolvedValue(undefined),
    listDistinctStudentIdsForBatches:
      overrides.listDistinctStudentIdsForBatches ??
      jest.fn().mockResolvedValue([]),
  } as unknown as BatchesRepository;

  const teachingContext = {
    assertActiveMember: jest.fn().mockResolvedValue(undefined),
  } as unknown as TeachingContextService;

  const service = new AssessmentsService(
    repository,
    batchesService,
    batchesRepository,
    teachingContext,
  );

  return { service, getOwnedBatch, batchesRepository };
}

describe('AssessmentsService.assertOwnsBatches', () => {
  it('checks ownership of every distinct batch id, once each', async () => {
    const getOwnedBatch = jest.fn().mockResolvedValue({ id: 'ok' });
    const { service } = buildService({ getOwnedBatch });

    await service.assertOwnsBatches('tutor-1', [
      'batch-a',
      'batch-b',
      'batch-a',
    ]);

    expect(getOwnedBatch).toHaveBeenCalledTimes(2);
    expect(getOwnedBatch).toHaveBeenCalledWith('tutor-1', 'batch-a');
    expect(getOwnedBatch).toHaveBeenCalledWith('tutor-1', 'batch-b');
  });

  it('rejects when any selected batch is not owned by the caller — never trusts client-supplied ids', async () => {
    const getOwnedBatch = jest
      .fn()
      .mockResolvedValueOnce({ id: 'batch-a' })
      .mockRejectedValueOnce(new ForbiddenException('Not your batch'));
    const { service } = buildService({ getOwnedBatch });

    await expect(
      service.assertOwnsBatches('tutor-1', ['batch-a', 'batch-not-mine']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts 1, 2, or many batches', async () => {
    const getOwnedBatch = jest.fn().mockResolvedValue({ id: 'ok' });
    const { service } = buildService({ getOwnedBatch });

    // Individual batches (no academy_id) -> Individual context (null).
    await expect(
      service.assertOwnsBatches('tutor-1', ['b1']),
    ).resolves.toBeNull();
    await expect(
      service.assertOwnsBatches('tutor-1', ['b1', 'b2', 'b3', 'b4', 'b5']),
    ).resolves.toBeNull();
  });

  it("returns the academy id when every batch belongs to that academy's context", async () => {
    const getOwnedBatch = jest
      .fn()
      .mockResolvedValue({ id: 'ok', academy_id: 'academy-A' });
    const { service } = buildService({ getOwnedBatch });

    await expect(
      service.assertOwnsBatches('tutor-1', ['b1', 'b2']),
    ).resolves.toBe('academy-A');
  });

  it('rejects an assessment that mixes Individual and Academy batches', async () => {
    const getOwnedBatch = jest
      .fn()
      .mockResolvedValueOnce({ id: 'b1', academy_id: null })
      .mockResolvedValueOnce({ id: 'b2', academy_id: 'academy-A' });
    const { service } = buildService({ getOwnedBatch });

    await expect(
      service.assertOwnsBatches('tutor-1', ['b1', 'b2']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AssessmentsService.assertEnrolledInAny', () => {
  it('returns the first batch the student is actively enrolled in', async () => {
    const findEnrollment = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'active' });
    const { service } = buildService({ findEnrollment });

    const batchId = await service.assertEnrolledInAny('student-1', [
      'batch-a',
      'batch-b',
    ]);
    expect(batchId).toBe('batch-b');
  });

  it("rejects a student not enrolled in any of the assessment's selected batches", async () => {
    const findEnrollment = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findEnrollment });

    await expect(
      service.assertEnrolledInAny('student-1', ['batch-a', 'batch-b']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a student whose enrollment in the only checked batch has lapsed', async () => {
    const findEnrollment = jest.fn().mockResolvedValue({ status: 'left' });
    const { service } = buildService({ findEnrollment });

    await expect(
      service.assertEnrolledInAny('student-1', ['batch-a']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
