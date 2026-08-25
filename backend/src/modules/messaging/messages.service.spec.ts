// MessagesRepository imports database.module.ts, which pulls in
// Kysely's real (ESM) package at the top level — this Jest config can't
// transform that. The test never touches Nest's DI container
// (MessagesService is constructed directly below with mocked
// dependencies), so only importing it without crashing matters here.
// Same workaround as auth.service.spec.ts / users.repository.spec.ts.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { MessagesService } from './messages.service';
import type { MessagesRepository } from './messages.repository';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { ParentLinksRepository } from '../parents/parent-links.repository';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';

/**
 * SEC-03: listForThread had no limit/cursor at all — an active thread's
 * entire history was fetched in one unbounded query on every page load.
 * These tests cover the fix's actual behavior change: the server-side
 * clamp and the newest-first-to-oldest-first reversal, not
 * resolveAccess (unit-tested implicitly via the "tutor with an
 * enrolled batch" happy path needed to reach listForThread at all).
 */
function buildService(overrides: { listForThread?: jest.Mock }) {
  const listForThread =
    overrides.listForThread ?? jest.fn().mockResolvedValue([]);
  const repository = { listForThread } as unknown as MessagesRepository;

  const batchesRepository = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'batch-1', tutor_id: 'tutor-1' }),
    findEnrollment: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
  } as unknown as BatchesRepository;

  const parentLinksRepository = {} as unknown as ParentLinksRepository;
  const analytics = { capture: jest.fn() } as unknown as AnalyticsService;
  const notificationsService = {} as unknown as NotificationsService;

  const service = new MessagesService(
    repository,
    batchesRepository,
    parentLinksRepository,
    analytics,
    notificationsService,
  );

  const tutorUser: AccessTokenPayload = { sub: 'tutor-1', roles: ['tutor'] };
  return { service, listForThread, tutorUser };
}

describe('MessagesService.listThread — pagination (SEC-03)', () => {
  it('defaults to a bounded page size when the caller passes none', async () => {
    const { service, listForThread, tutorUser } = buildService({});

    await service.listThread(tutorUser, 'batch-1', 'student-1');

    expect(listForThread).toHaveBeenCalledWith('batch-1', 'student-1', {
      limit: 50,
      before: undefined,
    });
  });

  it('clamps a caller-requested limit above the server max instead of trusting it', async () => {
    const { service, listForThread, tutorUser } = buildService({});

    await service.listThread(tutorUser, 'batch-1', 'student-1', {
      limit: 100000,
    });

    expect(listForThread).toHaveBeenCalledWith(
      'batch-1',
      'student-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('ignores a zero/negative requested limit and falls back to the default', async () => {
    const { service, listForThread, tutorUser } = buildService({});

    await service.listThread(tutorUser, 'batch-1', 'student-1', { limit: -5 });

    expect(listForThread).toHaveBeenCalledWith(
      'batch-1',
      'student-1',
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('passes the before cursor straight through for the next older page', async () => {
    const { service, listForThread, tutorUser } = buildService({});

    await service.listThread(tutorUser, 'batch-1', 'student-1', {
      before: 'msg-cursor',
    });

    expect(listForThread).toHaveBeenCalledWith(
      'batch-1',
      'student-1',
      expect.objectContaining({ before: 'msg-cursor' }),
    );
  });

  it('reverses the repository’s newest-first page back to oldest-first for display', async () => {
    const { service, tutorUser } = buildService({
      listForThread: jest
        .fn()
        .mockResolvedValue([{ id: 'msg-3' }, { id: 'msg-2' }, { id: 'msg-1' }]),
    });

    const result = await service.listThread(tutorUser, 'batch-1', 'student-1');

    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });
});
