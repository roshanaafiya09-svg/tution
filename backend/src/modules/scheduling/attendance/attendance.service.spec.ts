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
  getViewableSession?: jest.Mock;
  findByIdOrThrow?: jest.Mock;
  findEnrollment?: jest.Mock;
  upsert?: jest.Mock;
  upsertJoinTap?: jest.Mock;
  listForSession?: jest.Mock;
}) {
  const getViewableSession =
    overrides.getViewableSession ??
    jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'scheduled',
    });
  const findByIdOrThrow =
    overrides.findByIdOrThrow ??
    jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'scheduled',
      meeting_url: null,
      scheduled_start_utc: new Date(),
      duration_min: 60,
    });
  const sessionsService = {
    getViewableSession,
    findByIdOrThrow,
  } as unknown as SessionsService;

  const findEnrollment =
    overrides.findEnrollment ??
    jest.fn().mockResolvedValue({ status: 'active' });
  const batchesRepository = { findEnrollment } as unknown as BatchesRepository;

  const upsert =
    overrides.upsert ?? jest.fn().mockResolvedValue({ id: 'attendance-1' });
  const upsertJoinTap =
    overrides.upsertJoinTap ??
    jest.fn().mockResolvedValue({ id: 'attendance-1' });
  const listForSession =
    overrides.listForSession ?? jest.fn().mockResolvedValue([]);
  const repository = {
    upsert,
    upsertJoinTap,
    listForSession,
  } as unknown as AttendanceRepository;

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

  return {
    service,
    getViewableSession,
    findByIdOrThrow,
    upsert,
    upsertJoinTap,
    listForSession,
  };
}

describe('AttendanceService.markManually — holiday/cancelled-class guard', () => {
  it('refuses to mark attendance on a cancelled class, so it can never create a false absence', async () => {
    const getViewableSession = jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'cancelled',
    });
    const upsert = jest.fn();
    const { service } = buildService({ getViewableSession, upsert });

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

  it('refuses to mark a student who is not an active enrollment in the session batch (TEST 10)', async () => {
    const findEnrollment = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findEnrollment });

    await expect(
      service.markManually(TUTOR_ID, SESSION_ID, 'stranger', 'present'),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to mark a student whose enrollment has left (not currently active)', async () => {
    const findEnrollment = jest.fn().mockResolvedValue({ status: 'left' });
    const { service } = buildService({ findEnrollment });

    await expect(
      service.markManually(TUTOR_ID, SESSION_ID, 'former-student', 'present'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AttendanceService.joinSession — join-tap must never clobber a manual mark', () => {
  it('refuses to join a cancelled class', async () => {
    const findByIdOrThrow = jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'cancelled',
    });
    const upsertJoinTap = jest.fn();
    const { service } = buildService({ findByIdOrThrow, upsertJoinTap });

    await expect(
      service.joinSession('student-1', SESSION_ID),
    ).rejects.toThrow(BadRequestException);
    expect(upsertJoinTap).not.toHaveBeenCalled();
  });

  it('refuses to join for a student not actively enrolled in the batch', async () => {
    const findEnrollment = jest.fn().mockResolvedValue(undefined);
    const upsertJoinTap = jest.fn();
    const { service } = buildService({ findEnrollment, upsertJoinTap });

    await expect(
      service.joinSession('stranger', SESSION_ID),
    ).rejects.toThrow(BadRequestException);
    expect(upsertJoinTap).not.toHaveBeenCalled();
  });

  it('delegates to the conditional upsertJoinTap (not the unconditional manual upsert), so a prior manual mark is preserved at the query layer', async () => {
    const upsert = jest.fn();
    const upsertJoinTap = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ upsert, upsertJoinTap });

    await service.joinSession('student-1', SESSION_ID);

    expect(upsertJoinTap).toHaveBeenCalledWith(
      SESSION_ID,
      'student-1',
      expect.any(Date),
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('still returns the meeting link even when the join-tap write was skipped (student already marked manually)', async () => {
    const findByIdOrThrow = jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-1',
      status: 'scheduled',
      meeting_url: 'https://meet.example/abc',
      scheduled_start_utc: new Date('2026-01-01T10:00:00Z'),
      duration_min: 60,
    });
    // Mirrors what the conditional DO UPDATE ... WHERE returns in
    // production when it skips the write: no row.
    const upsertJoinTap = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findByIdOrThrow, upsertJoinTap });

    const result = await service.joinSession('student-1', SESSION_ID);

    expect(result.meetingUrl).toBe('https://meet.example/abc');
  });
});

describe('AttendanceService.listForSession — roster-based listing (C4 fix)', () => {
  it("builds the roster from the session's batch, not from the session id alone, so listForSession queries the full expected roster rather than only rows that already exist", async () => {
    const getViewableSession = jest.fn().mockResolvedValue({
      id: SESSION_ID,
      batch_id: 'batch-42',
      status: 'scheduled',
    });
    const { service, listForSession } = buildService({ getViewableSession });

    await service.listForSession(TUTOR_ID, SESSION_ID);

    expect(listForSession).toHaveBeenCalledWith(SESSION_ID, 'batch-42');
  });

  it('still enforces ownership before listing — an unowned session throws before the roster is ever queried', async () => {
    const getViewableSession = jest
      .fn()
      .mockRejectedValue(new Error('not your session'));
    const { service, listForSession } = buildService({ getViewableSession });

    await expect(service.listForSession(TUTOR_ID, SESSION_ID)).rejects.toThrow(
      'not your session',
    );
    expect(listForSession).not.toHaveBeenCalled();
  });
});
