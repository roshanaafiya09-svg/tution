// BatchesService/BatchesRepository transitively import database.module.ts
// (real Kysely/pg pool, an ESM dependency this Jest config can't
// transform) — same workaround as the other service specs.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BatchesService } from '../scheduling/batches/batches.service';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { AnalyticsService } from '../analytics/analytics.service';
import { TeachingContextService } from './teaching-context.service';
import {
  INDIVIDUAL_CONTEXT,
  currentTeachingContext,
  parseTeachingContext,
  runInTeachingContext,
} from './teaching-context';

const ACADEMY = '11111111-1111-4111-8111-111111111111';
const OTHER_ACADEMY = '22222222-2222-4222-8222-222222222222';

describe('parseTeachingContext', () => {
  it('treats a missing or empty header as Individual — never as "everything"', () => {
    expect(parseTeachingContext(undefined)).toEqual(INDIVIDUAL_CONTEXT);
    expect(parseTeachingContext('')).toEqual(INDIVIDUAL_CONTEXT);
    expect(parseTeachingContext('individual')).toEqual(INDIVIDUAL_CONTEXT);
  });

  it('parses an academy context', () => {
    expect(parseTeachingContext(`academy:${ACADEMY}`)).toEqual({
      kind: 'academy',
      academyId: ACADEMY,
    });
  });

  it('rejects anything malformed', () => {
    for (const bad of ['academy:', 'academy:nope', 'all', 'academy:1;drop']) {
      expect(parseTeachingContext(bad)).toBeNull();
    }
  });
});

describe('TeachingContextService.resolve', () => {
  function build(isMember: boolean) {
    const findActiveMembership = jest
      .fn()
      .mockResolvedValue(isMember ? { id: 'm' } : undefined);
    const service = new TeachingContextService({
      findActiveMembership,
    } as never);
    return { service, findActiveMembership };
  }

  it('honours an academy context only for an ACTIVE member', async () => {
    const yes = build(true);
    await expect(
      yes.service.resolve('tutor-1', `academy:${ACADEMY}`),
    ).resolves.toEqual({ kind: 'academy', academyId: ACADEMY });
    expect(yes.findActiveMembership).toHaveBeenCalledWith(ACADEMY, 'tutor-1');

    const no = build(false);
    await expect(
      no.service.resolve('tutor-1', `academy:${ACADEMY}`),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never checks membership for Individual', async () => {
    const { service, findActiveMembership } = build(false);
    await expect(service.resolve('tutor-1', undefined)).resolves.toEqual(
      INDIVIDUAL_CONTEXT,
    );
    expect(findActiveMembership).not.toHaveBeenCalled();
  });
});

describe('BatchesService.getOwnedBatch — context rules', () => {
  function build(batch: Record<string, unknown> | undefined, isMember = true) {
    const repository = {
      findById: jest.fn().mockResolvedValue(batch),
      findByIdInAcademy: jest
        .fn()
        .mockImplementation((_id: string, academyId: string) =>
          Promise.resolve(
            batch && batch.academy_id === academyId ? batch : undefined,
          ),
        ),
    } as unknown as BatchesRepository;
    const teachingContext = new TeachingContextService({
      findActiveMembership: jest
        .fn()
        .mockResolvedValue(isMember ? { id: 'm' } : undefined),
    } as never);
    return new BatchesService(
      repository,
      { capture: jest.fn() } as unknown as AnalyticsService,
      teachingContext,
      { notifyCancelled: jest.fn() } as never,
    );
  }

  const individualBatch = { id: 'b-i', tutor_id: 'tutor-1', academy_id: null };
  const academyBatch = {
    id: 'b-a',
    tutor_id: 'tutor-1',
    academy_id: ACADEMY,
  };

  it("lets a teacher operate their own Individual batch (no academy involved), in any request that isn't declared Academy", async () => {
    await expect(
      build(individualBatch).getOwnedBatch('tutor-1', 'b-i'),
    ).resolves.toBe(individualBatch);
    await expect(
      runInTeachingContext(INDIVIDUAL_CONTEXT, () =>
        build(individualBatch).getOwnedBatch('tutor-1', 'b-i'),
      ),
    ).resolves.toBe(individualBatch);
  });

  it('refuses an Individual batch from an Academy profile, and an Academy batch from the Individual profile', async () => {
    await expect(
      runInTeachingContext({ kind: 'academy', academyId: ACADEMY }, () =>
        build(individualBatch).getOwnedBatch('tutor-1', 'b-i'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      runInTeachingContext(INDIVIDUAL_CONTEXT, () =>
        build(academyBatch).getOwnedBatch('tutor-1', 'b-a'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      runInTeachingContext({ kind: 'academy', academyId: OTHER_ACADEMY }, () =>
        build(academyBatch).getOwnedBatch('tutor-1', 'b-a'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an Academy batch stays operable only while the teacher is an active member', async () => {
    await expect(
      runInTeachingContext({ kind: 'academy', academyId: ACADEMY }, () =>
        build(academyBatch, true).getOwnedBatch('tutor-1', 'b-a'),
      ),
    ).resolves.toBe(academyBatch);
    await expect(
      build(academyBatch, false).getOwnedBatch('tutor-1', 'b-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("still requires the teacher to be the batch's teacher", async () => {
    await expect(
      build(individualBatch).getOwnedBatch('someone-else', 'b-i'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("the academy's lookup only finds ITS OWN batches — Individual and other academies' are 'not found'", async () => {
    const service = build(academyBatch);
    await expect(service.getAcademyBatch(ACADEMY, 'b-a')).resolves.toBe(
      academyBatch,
    );
    await expect(
      service.getAcademyBatch(OTHER_ACADEMY, 'b-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build(individualBatch).getAcademyBatch(ACADEMY, 'b-i'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('request context carrier', () => {
  it('is only visible inside run(), and never leaks out of it', () => {
    expect(currentTeachingContext()).toBeUndefined();
    runInTeachingContext({ kind: 'academy', academyId: ACADEMY }, () => {
      expect(currentTeachingContext()).toEqual({
        kind: 'academy',
        academyId: ACADEMY,
      });
    });
    expect(currentTeachingContext()).toBeUndefined();
  });
});
