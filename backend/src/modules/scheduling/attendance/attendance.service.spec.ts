// Same ESM/database.module workaround as the other specs added for this
// feature — AttendanceService's own dependencies transitively touch
// database.module.ts and a real `sql` import from 'kysely'.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import type { AttendanceRepository } from './attendance.repository';
import type { SessionsService } from '../sessions/sessions.service';
import type { BatchesService } from '../batches/batches.service';
import type { BatchesRepository } from '../batches/batches.repository';
import type { AnalyticsService } from '../../analytics/analytics.service';
import type { NotificationsService } from '../../notifications/notifications.service';

const TUTOR_ID = 'tutor-1';
const SESSION_ID = 'session-1';

function buildService(overrides: {
  getOwnedSession?: jest.Mock;
  findEnrollment?: jest.Mock;
  upsert?: jest.Mock;
}) {
  const getOwnedSession =
    overrides.getOwnedSession ??
    jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'scheduled',
    });
  const sessionsService = { getOwnedSession } as unknown as SessionsService;

  const findEnrollment =
    overrides.findEnrollment ??
    jest.fn().mockResolvedValue({ status: 'active' });
  const batchesRepository = { findEnrollment } as unknown as BatchesRepository;

  const upsert =
    overrides.upsert ?? jest.fn().mockResolvedValue({ id: 'attendance-1' });
  const repository = { upsert } as unknown as AttendanceRepository;

  const batchesService = {} as unknown as BatchesService;
  const analytics = { capture: jest.fn() } as unknown as AnalyticsService;
  const notificationsService = {
    listRecentForUserByType: jest.fn().mockResolvedValue([]),
    notify: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;

  const service = new AttendanceService(
    repository,
    sessionsService,
    batchesService,
    batchesRepository,
    analytics,
    notificationsService,
  );

  return { service, getOwnedSession, upsert };
}

describe('AttendanceService.markManually — holiday/cancelled-class guard', () => {
  it('refuses to mark attendance on a cancelled class, so it can never create a false absence', async () => {
    const getOwnedSession = jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'cancelled',
    });
    const upsert = jest.fn();
    const { service } = buildService({ getOwnedSession, upsert });

    await expect(
      service.markManually(TUTOR_ID, SESSION_ID, 'student-1', 'absent'),
    ).rejects.toThrow(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('still marks attendance normally on a scheduled (not cancelled) class', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValue({ id: 'attendance-1', status: 'present' });
    const { service } = buildService({ upsert });

    await service.markManually(TUTOR_ID, SESSION_ID, 'student-1', 'present');

    expect(upsert).toHaveBeenCalled();
  });
});
