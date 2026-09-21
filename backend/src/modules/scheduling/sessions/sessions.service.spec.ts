// SessionsService transitively imports SessionsRepository, which imports
// database.module.ts (real Kysely/pg pool setup, an ESM dependency this
// Jest config can't transform) — same workaround as
// teacher-leave.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import type { SessionsRepository } from './sessions.repository';
import type { BatchesService } from '../batches/batches.service';
import type { TeachingContextService } from '../../teaching-context/teaching-context.service';

const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';

function buildService(overrides: {
  hasScheduledOverlapForTutor?: jest.Mock;
  hasScheduledOverlapForBatch?: jest.Mock;
  createSeries?: jest.Mock;
  getOwnedBatch?: jest.Mock;
}) {
  const repository = {
    hasScheduledOverlapForTutor:
      overrides.hasScheduledOverlapForTutor ??
      jest.fn().mockResolvedValue(false),
    hasScheduledOverlapForBatch:
      overrides.hasScheduledOverlapForBatch ??
      jest.fn().mockResolvedValue(false),
    createSeries:
      overrides.createSeries ??
      jest.fn().mockResolvedValue([{ id: 'session-1' }]),
  } as unknown as SessionsRepository;

  const batchesService = {
    getOwnedBatch:
      overrides.getOwnedBatch ??
      jest.fn().mockResolvedValue({ id: BATCH_ID, tutor_id: TUTOR_ID }),
  } as unknown as BatchesService;

  const teachingContext = {
    assertActiveMember: jest.fn().mockResolvedValue(undefined),
  } as unknown as TeachingContextService;

  return new SessionsService(repository, batchesService, teachingContext);
}

describe('SessionsService.create — conflict detection', () => {
  it('creates the session when neither the tutor nor the batch has a conflict', async () => {
    const createSeries = jest.fn().mockResolvedValue([{ id: 'session-1' }]);
    const service = buildService({ createSeries });

    await service.create(TUTOR_ID, {
      batchId: BATCH_ID,
      startLocal: '2026-09-21T16:00',
      durationMin: 60,
    });

    expect(createSeries).toHaveBeenCalledTimes(1);
  });

  it('rejects when the tutor already has an overlapping scheduled class', async () => {
    const hasScheduledOverlapForTutor = jest.fn().mockResolvedValue(true);
    const createSeries = jest.fn();
    const service = buildService({ hasScheduledOverlapForTutor, createSeries });

    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2026-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('rejects when the batch already has an overlapping scheduled class', async () => {
    const hasScheduledOverlapForBatch = jest.fn().mockResolvedValue(true);
    const createSeries = jest.fn();
    const service = buildService({ hasScheduledOverlapForBatch, createSeries });

    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2026-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('checks every occurrence of a recurring series, not just the first', async () => {
    // Conflicts only on the 3rd occurrence — should still be caught.
    const hasScheduledOverlapForTutor = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const createSeries = jest.fn();
    const service = buildService({ hasScheduledOverlapForTutor, createSeries });

    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2026-09-21T16:00',
        durationMin: 60,
        recurrenceRule: 'FREQ=WEEKLY;COUNT=5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createSeries).not.toHaveBeenCalled();
  });
});
