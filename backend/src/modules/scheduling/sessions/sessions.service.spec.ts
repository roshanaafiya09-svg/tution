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
import type { SessionNotificationsService } from './session-notifications.service';
import type { SessionsRepository } from './sessions.repository';
import type { BatchesService } from '../batches/batches.service';
import type { TeachingContextService } from '../../teaching-context/teaching-context.service';
import { ErrorCode } from '../../../common/http/error-codes';
import type { AcademyHolidayCalendar } from '../../holidays/holiday-calendar';

const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';
const SESSION_ID = 'session-1';

function buildService(overrides: {
  hasScheduledOverlapForTutor?: jest.Mock;
  hasScheduledOverlapForBatch?: jest.Mock;
  createSeries?: jest.Mock;
  getOwnedBatch?: jest.Mock;
  getAcademyBatch?: jest.Mock;
  findByIdUnchecked?: jest.Mock;
  findById?: jest.Mock;
  findByIdInAcademy?: jest.Mock;
  cancelIfScheduled?: jest.Mock;
  completeIfScheduled?: jest.Mock;
  cancelSeries?: jest.Mock;
  rescheduleIfScheduled?: jest.Mock;
  updateMeetingUrl?: jest.Mock;
  holidaysFor?: jest.Mock;
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
    findById: overrides.findById ?? jest.fn().mockResolvedValue(undefined),
    findByIdInAcademy:
      overrides.findByIdInAcademy ?? jest.fn().mockResolvedValue(undefined),
    cancelIfScheduled:
      overrides.cancelIfScheduled ?? jest.fn().mockResolvedValue(undefined),
    completeIfScheduled:
      overrides.completeIfScheduled ?? jest.fn().mockResolvedValue(undefined),
    cancelSeries: overrides.cancelSeries ?? jest.fn().mockResolvedValue([]),
    rescheduleIfScheduled:
      overrides.rescheduleIfScheduled ?? jest.fn().mockResolvedValue(undefined),
    updateMeetingUrl:
      overrides.updateMeetingUrl ??
      jest.fn().mockResolvedValue({ id: SESSION_ID, meeting_url: null }),
  } as unknown as SessionsRepository;

  const batchesService = {
    getOwnedBatch:
      overrides.getOwnedBatch ??
      jest.fn().mockResolvedValue({
        id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'active',
      }),
    getAcademyBatch:
      overrides.getAcademyBatch ??
      jest.fn().mockResolvedValue({
        id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'active',
      }),
    findByIdUnchecked:
      overrides.findByIdUnchecked ??
      jest.fn().mockResolvedValue({
        id: BATCH_ID,
        tutor_id: TUTOR_ID,
        academy_id: null,
      }),
  } as unknown as BatchesService;

  const teachingContext = {
    assertActiveMember: jest.fn().mockResolvedValue(undefined),
  } as unknown as TeachingContextService;

  const notices = {
    notifyCancelled: jest.fn().mockResolvedValue(undefined),
    notifyRescheduled: jest.fn().mockResolvedValue(undefined),
    notifyCreated: jest.fn().mockResolvedValue(undefined),
  };

  // Default: no holidays — one null per occurrence.
  const holidayCalendar = {
    holidaysFor:
      overrides.holidaysFor ??
      jest.fn((_batch: unknown, starts: Date[]) =>
        Promise.resolve(starts.map(() => null)),
      ),
  };

  return {
    service: new SessionsService(
      repository,
      batchesService,
      teachingContext,
      notices as unknown as SessionNotificationsService,
      holidayCalendar as unknown as AcademyHolidayCalendar,
    ),
    repository,
    notices,
    holidayCalendar,
  };
}

/** A minimal `class_sessions` row good enough for cancel/complete guard
 *  tests — only the fields SessionsService actually reads. */
function makeSession(
  overrides: Partial<{
    id: string;
    tutor_id: string;
    batch_id: string;
    status: 'scheduled' | 'completed' | 'cancelled';
    scheduled_start_utc: Date;
    recurrence_parent_id: string | null;
    timezone: string;
    duration_min: number;
    substitute_tutor_id: string | null;
  }> = {},
) {
  return {
    id: SESSION_ID,
    tutor_id: TUTOR_ID,
    batch_id: BATCH_ID,
    status: 'scheduled' as const,
    scheduled_start_utc: new Date(Date.now() - 60_000), // started a minute ago
    recurrence_parent_id: null,
    timezone: 'Asia/Kolkata',
    duration_min: 60,
    substitute_tutor_id: null,
    ...overrides,
  };
}

const FUTURE = new Date(Date.now() + 60 * 60_000); // an hour from now
const PAST = new Date(Date.now() - 60 * 60_000); // an hour ago

describe('SessionsService.create — conflict detection', () => {
  it('creates the session when neither the tutor nor the batch has a conflict', async () => {
    const createSeries = jest.fn().mockResolvedValue([{ id: 'session-1' }]);
    const { service } = buildService({ createSeries });

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
    const { service } = buildService({
      hasScheduledOverlapForTutor,
      createSeries,
    });

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
    const { service } = buildService({
      hasScheduledOverlapForBatch,
      createSeries,
    });

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
    const { service } = buildService({
      hasScheduledOverlapForTutor,
      createSeries,
    });

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

  // H11: nothing used to stop scheduling a brand-new session on an
  // archived batch — archive's own cascade only cancels what already
  // existed at that moment.
  it('rejects creating a session on an archived batch (Individual path)', async () => {
    const createSeries = jest.fn();
    const { service } = buildService({
      createSeries,
      getOwnedBatch: jest.fn().mockResolvedValue({
        id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'archived',
      }),
    });

    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2026-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.BATCH_ARCHIVED },
    });
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('rejects creating a session on an archived batch (Academy path)', async () => {
    const createSeries = jest.fn();
    const { service } = buildService({
      createSeries,
      getAcademyBatch: jest.fn().mockResolvedValue({
        id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'archived',
      }),
    });

    await expect(
      service.createForAcademy('academy-1', {
        batchId: BATCH_ID,
        startLocal: '2026-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.BATCH_ARCHIVED },
    });
    expect(createSeries).not.toHaveBeenCalled();
  });
});

describe('SessionsService.create — academy holidays + class-created notice', () => {
  const HOLIDAY = { id: 'h-1', name: 'Founders Day' };
  const ACADEMY_BATCH = {
    id: BATCH_ID,
    tutor_id: TUTOR_ID,
    status: 'active',
    academy_id: 'academy-1',
  };

  it('notifies after a successful single-class creation, with the created row and its start', async () => {
    const parent = { id: 'session-1', batch_id: BATCH_ID };
    const createSeries = jest.fn().mockResolvedValue(parent);
    const { service, notices } = buildService({ createSeries });

    const result = await service.create(TUTOR_ID, {
      batchId: BATCH_ID,
      startLocal: '2030-09-21T16:00',
      durationMin: 60,
    });

    expect(notices.notifyCreated).toHaveBeenCalledTimes(1);
    const [notifiedParent, starts] = notices.notifyCreated.mock.calls[0] as [
      unknown,
      Date[],
    ];
    expect(notifiedParent).toBe(parent);
    expect(starts).toHaveLength(1);
    expect(result).toMatchObject({
      id: 'session-1',
      skipped_holiday_occurrences: [],
    });
  });

  it('a recurring series is ONE notifyCreated call carrying every created occurrence', async () => {
    const { service, notices } = buildService({
      createSeries: jest
        .fn()
        .mockResolvedValue({ id: 'p', batch_id: BATCH_ID }),
    });
    await service.create(TUTOR_ID, {
      batchId: BATCH_ID,
      startLocal: '2030-09-21T16:00',
      durationMin: 60,
      recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
    });
    expect(notices.notifyCreated).toHaveBeenCalledTimes(1);
    expect(
      (notices.notifyCreated.mock.calls[0] as [unknown, Date[]])[1],
    ).toHaveLength(4);
  });

  it('a failed creation (conflict) never notifies', async () => {
    const { service, notices } = buildService({
      hasScheduledOverlapForTutor: jest.fn().mockResolvedValue(true),
    });
    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2030-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notices.notifyCreated).not.toHaveBeenCalled();
  });

  it('a failed insert never notifies', async () => {
    const { service, notices } = buildService({
      createSeries: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2030-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toThrow('db down');
    expect(notices.notifyCreated).not.toHaveBeenCalled();
  });

  it('rejects a single academy class on a holiday with 409 ACADEMY_HOLIDAY — no insert, no notice, no conflict query', async () => {
    const createSeries = jest.fn();
    const hasScheduledOverlapForTutor = jest.fn();
    const { service, notices } = buildService({
      createSeries,
      hasScheduledOverlapForTutor,
      getAcademyBatch: jest.fn().mockResolvedValue(ACADEMY_BATCH),
      holidaysFor: jest.fn().mockResolvedValue([HOLIDAY]),
    });

    await expect(
      service.createForAcademy('academy-1', {
        batchId: BATCH_ID,
        startLocal: '2030-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.ACADEMY_HOLIDAY },
    });
    expect(createSeries).not.toHaveBeenCalled();
    expect(hasScheduledOverlapForTutor).not.toHaveBeenCalled();
    expect(notices.notifyCreated).not.toHaveBeenCalled();
  });

  it('the teacher path checks holidays against the batch row loaded by the ownership check (trusted academy_id)', async () => {
    const holidaysFor = jest.fn().mockResolvedValue([HOLIDAY]);
    const { service } = buildService({
      getOwnedBatch: jest.fn().mockResolvedValue(ACADEMY_BATCH),
      holidaysFor,
    });
    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2030-09-21T16:00',
        durationMin: 60,
      }),
    ).rejects.toMatchObject({ response: { code: ErrorCode.ACADEMY_HOLIDAY } });
    expect((holidaysFor.mock.calls as unknown[][])[0][0]).toBe(ACADEMY_BATCH);
  });

  it('recurring series: skips the holiday occurrence, creates and announces the rest, reports what was skipped', async () => {
    const createSeries = jest
      .fn()
      .mockResolvedValue({ id: 'p', batch_id: BATCH_ID });
    const hasScheduledOverlapForTutor = jest.fn().mockResolvedValue(false);
    const { service, notices } = buildService({
      createSeries,
      hasScheduledOverlapForTutor,
      getOwnedBatch: jest.fn().mockResolvedValue(ACADEMY_BATCH),
      // 2nd of 4 weekly occurrences is a holiday.
      holidaysFor: jest.fn().mockResolvedValue([null, HOLIDAY, null, null]),
    });

    const result = await service.create(TUTOR_ID, {
      batchId: BATCH_ID,
      startLocal: '2030-09-21T16:00',
      durationMin: 60,
      timezone: 'Asia/Kolkata',
      recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
    });

    const inserted = (createSeries.mock.calls as unknown[][])[0][0] as Array<{
      scheduledStartUtc: Date;
    }>;
    expect(inserted).toHaveLength(3);
    // The holiday week (2030-09-28) is not among the inserted rows.
    expect(
      inserted.map((r) => r.scheduledStartUtc.toISOString()),
    ).not.toContain('2030-09-28T10:30:00.000Z');
    // Conflicts are only checked for occurrences that will be created.
    expect(hasScheduledOverlapForTutor).toHaveBeenCalledTimes(3);
    expect(
      (notices.notifyCreated.mock.calls[0] as [unknown, Date[]])[1],
    ).toHaveLength(3);
    expect(result.skipped_holiday_occurrences).toEqual([
      {
        scheduled_start_utc: new Date('2030-09-28T10:30:00.000Z'),
        date: '2030-09-28',
        holiday_name: 'Founders Day',
      },
    ]);
  });

  it('recurring series where EVERY occurrence is a holiday is rejected outright', async () => {
    const createSeries = jest.fn();
    const { service, notices } = buildService({
      createSeries,
      getOwnedBatch: jest.fn().mockResolvedValue(ACADEMY_BATCH),
      holidaysFor: jest.fn().mockResolvedValue([HOLIDAY, HOLIDAY]),
    });
    await expect(
      service.create(TUTOR_ID, {
        batchId: BATCH_ID,
        startLocal: '2030-09-21T16:00',
        durationMin: 60,
        recurrenceRule: 'FREQ=DAILY;COUNT=2',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.ACADEMY_HOLIDAY },
    });
    expect(createSeries).not.toHaveBeenCalled();
    expect(notices.notifyCreated).not.toHaveBeenCalled();
  });
});

describe('SessionsService.complete — H2 lifecycle guards', () => {
  it('SCHEDULED → COMPLETED succeeds once the class has started', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: PAST,
    });
    const completeIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'completed' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      completeIfScheduled,
    });

    const result = await service.complete(TUTOR_ID, SESSION_ID);

    expect(result.status).toBe('completed');
    expect(completeIfScheduled).toHaveBeenCalledWith(SESSION_ID);
  });

  it('rejects completing a class before its scheduled start time (future session)', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const completeIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      completeIfScheduled,
    });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.SESSION_NOT_STARTED },
    });
    // No DB write for a rejected transition — nothing to send duplicate
    // notifications about.
    expect(completeIfScheduled).not.toHaveBeenCalled();
  });

  it('allows completing an overdue class (past session) with no upper time bound', async () => {
    const longOverdue = new Date(Date.now() - 30 * 24 * 3600_000);
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: longOverdue,
    });
    const completeIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'completed' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      completeIfScheduled,
    });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).resolves.toMatchObject(
      {
        status: 'completed',
      },
    );
  });

  it('CANCELLED → COMPLETED fails with INVALID_SESSION_TRANSITION', async () => {
    const session = makeSession({ status: 'cancelled' });
    const completeIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      completeIfScheduled,
    });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.INVALID_SESSION_TRANSITION },
    });
    expect(completeIfScheduled).not.toHaveBeenCalled();
  });

  it('COMPLETED → COMPLETED is rejected as SESSION_ALREADY_COMPLETED, not a silent no-op', async () => {
    const session = makeSession({ status: 'completed' });
    const completeIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      completeIfScheduled,
    });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_COMPLETED },
    });
    // Repeating the request never reaches the repository a second time —
    // nothing to duplicate.
    expect(completeIfScheduled).not.toHaveBeenCalled();
  });

  it('resolves a lost race (CAS affected zero rows) against the fresh status, not the stale one', async () => {
    // The initial load still sees 'scheduled' — another request won the
    // race and committed 'cancelled' before this UPDATE ran.
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: PAST,
    });
    const findById = jest
      .fn()
      .mockResolvedValueOnce(session) // getOwnedSession's load
      .mockResolvedValueOnce({ ...session, status: 'cancelled' }); // post-CAS re-check
    const completeIfScheduled = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findById, completeIfScheduled });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.INVALID_SESSION_TRANSITION },
    });
  });

  it("wrong user cannot complete someone else's session", async () => {
    const session = makeSession({
      status: 'scheduled',
      tutor_id: 'someone-else',
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(service.complete(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('SessionsService.cancel — H2 lifecycle guards', () => {
  it('SCHEDULED → CANCELLED succeeds before the class has started', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'cancelled' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    const result = await service.cancel(TUTOR_ID, SESSION_ID, false);

    expect(result).toEqual({ cancelled: 'single' });
    expect(cancelIfScheduled).toHaveBeenCalledWith(
      SESSION_ID,
      'teacher_manual',
    );
  });

  it('rejects cancelling a class that has already started', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: PAST,
    });
    const cancelIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await expect(
      service.cancel(TUTOR_ID, SESSION_ID, false),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.SESSION_ALREADY_STARTED },
    });
    expect(cancelIfScheduled).not.toHaveBeenCalled();
  });

  it('COMPLETED → CANCELLED fails with INVALID_SESSION_TRANSITION', async () => {
    const session = makeSession({
      status: 'completed',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await expect(
      service.cancel(TUTOR_ID, SESSION_ID, false),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.INVALID_SESSION_TRANSITION },
    });
    expect(cancelIfScheduled).not.toHaveBeenCalled();
  });

  it('CANCELLED → CANCELLED is rejected as SESSION_ALREADY_CANCELLED, not a silent no-op', async () => {
    const session = makeSession({
      status: 'cancelled',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await expect(
      service.cancel(TUTOR_ID, SESSION_ID, false),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_CANCELLED },
    });
    expect(cancelIfScheduled).not.toHaveBeenCalled();
  });

  it('a whole-series cancel only sweeps siblings after the target session itself is cancelled atomically', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
      recurrence_parent_id: 'parent-1',
    });
    const cancelIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'cancelled' });
    const cancelSeries = jest.fn().mockResolvedValue(['sibling-1']);
    const { service, notices } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
      cancelSeries,
    });

    const result = await service.cancel(TUTOR_ID, SESSION_ID, true);

    expect(result).toEqual({ cancelled: 'series' });
    // H4: one immediate notice for exactly the classes this event cancelled.
    expect(notices.notifyCancelled).toHaveBeenCalledTimes(1);
    expect(notices.notifyCancelled).toHaveBeenCalledWith(
      [SESSION_ID, 'sibling-1'],
      'teacher_manual',
    );
    expect(cancelIfScheduled).toHaveBeenCalledWith(
      SESSION_ID,
      'teacher_manual',
    );
    expect(cancelSeries).toHaveBeenCalledWith('parent-1', 'teacher_manual');
  });

  it('never sweeps the series when the target session itself fails to cancel', async () => {
    const session = makeSession({
      status: 'completed',
      scheduled_start_utc: FUTURE,
    });
    const cancelSeries = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelSeries,
    });

    await expect(
      service.cancel(TUTOR_ID, SESSION_ID, true),
    ).rejects.toMatchObject({ status: 409 });
    expect(cancelSeries).not.toHaveBeenCalled();
  });

  it('the Academy path applies the same guards as the tutor path', async () => {
    const session = makeSession({
      status: 'cancelled',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest.fn();
    const { service } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await expect(
      service.cancelForAcademy('academy-1', SESSION_ID, false),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_CANCELLED },
    });
    expect(cancelIfScheduled).not.toHaveBeenCalled();
  });

  it('an Academy session id that this academy does not own is not found (never leaks ownership boundaries)', async () => {
    const { service } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.cancelForAcademy('academy-1', SESSION_ID, false),
    ).rejects.toMatchObject({ status: 404 });
  });

  // H4: the reminder wording bug — both paths used to tag every manual
  // cancel identically ('manual'), so the reminder always said "cancelled
  // by the academy" even for a teacher's own cancel of a private
  // Individual class. Cancel now records WHO actually cancelled it.
  it('a teacher cancel is tagged teacher_manual, not the shared "manual" reason', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'cancelled' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await service.cancel(TUTOR_ID, SESSION_ID, false);

    expect(cancelIfScheduled).toHaveBeenCalledWith(
      SESSION_ID,
      'teacher_manual',
    );
  });

  it('an academy cancel is tagged academy_manual, not the shared "manual" reason', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const cancelIfScheduled = jest
      .fn()
      .mockResolvedValue({ ...session, status: 'cancelled' });
    const { service } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
    });

    await service.cancelForAcademy('academy-1', SESSION_ID, false);

    expect(cancelIfScheduled).toHaveBeenCalledWith(
      SESSION_ID,
      'academy_manual',
    );
  });
});

// H4 — new capabilities the audit found missing entirely: edit (today
// just meetingUrl) and a real reschedule workflow, both following the
// same atomic-guard shape H2 established for cancel/complete.
describe('SessionsService.reschedule', () => {
  const FUTURE_LOCAL = '2030-06-15T16:00';
  const PAST_LOCAL = '2020-01-01T10:00';

  it('succeeds for a scheduled, future, non-conflicting session', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const rescheduleIfScheduled = jest.fn().mockResolvedValue({
      ...session,
      scheduled_start_utc: new Date('2030-06-15T10:30:00Z'),
    });
    const hasScheduledOverlapForTutor = jest.fn().mockResolvedValue(false);
    const { service, notices } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      rescheduleIfScheduled,
      hasScheduledOverlapForTutor,
    });

    const result = await service.reschedule(TUTOR_ID, SESSION_ID, {
      newStartLocal: FUTURE_LOCAL,
    });

    expect(result.scheduled_start_utc).toEqual(
      new Date('2030-06-15T10:30:00Z'),
    );
    expect(rescheduleIfScheduled).toHaveBeenCalledWith(
      SESSION_ID,
      expect.any(Date),
      60, // session's existing duration, since none was given
      // Guarded on the time it read, so a raced reschedule can't also win.
      { scheduledStartUtc: FUTURE, durationMin: 60 },
    );
    // H4.1: announced after (never before) the committed change.
    expect(notices.notifyRescheduled).toHaveBeenCalledTimes(1);
    expect(notices.notifyRescheduled).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        scheduled_start_utc: new Date('2030-06-15T10:30:00Z'),
      }),
      // A teacher moving their own class: no academy-side teacher notice.
      { kind: 'teacher' },
    );
    expect(hasScheduledOverlapForTutor).toHaveBeenCalledWith(
      TUTOR_ID,
      expect.any(Date),
      expect.any(Date),
      SESSION_ID, // excludes its own current slot
    );
  });

  it('rejects a reschedule to a time in the past', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const rescheduleIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      rescheduleIfScheduled,
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: PAST_LOCAL }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.SESSION_RESCHEDULE_IN_PAST },
    });
    expect(rescheduleIfScheduled).not.toHaveBeenCalled();
  });

  it("rejects a reschedule that conflicts with another of the tutor's classes", async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const rescheduleIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      rescheduleIfScheduled,
      hasScheduledOverlapForTutor: jest.fn().mockResolvedValue(true),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_RESCHEDULE_CONFLICT },
    });
    expect(rescheduleIfScheduled).not.toHaveBeenCalled();
  });

  it('rejects a reschedule that conflicts with another class already on the batch', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const rescheduleIfScheduled = jest.fn();
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      rescheduleIfScheduled,
      hasScheduledOverlapForBatch: jest.fn().mockResolvedValue(true),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_RESCHEDULE_CONFLICT },
    });
    expect(rescheduleIfScheduled).not.toHaveBeenCalled();
  });

  it('rejects rescheduling a class that has already started (same time rule as cancel)', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: PAST,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.SESSION_ALREADY_STARTED },
    });
  });

  it('rejects rescheduling an already-cancelled class', async () => {
    const session = makeSession({
      status: 'cancelled',
      scheduled_start_utc: FUTURE,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_CANCELLED },
    });
  });

  it('a reschedule racing a concurrent cancel loses cleanly instead of silently applying', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const rescheduleIfScheduled = jest.fn().mockResolvedValue(undefined); // lost the race
    const { service } = buildService({
      findById: jest
        .fn()
        .mockResolvedValueOnce(session) // initial load
        .mockResolvedValueOnce({ ...session, status: 'cancelled' }), // re-check after losing
      rescheduleIfScheduled,
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_CANCELLED },
    });
  });

  it('the Academy path applies the same guards as the tutor path', async () => {
    const session = makeSession({
      status: 'cancelled',
      scheduled_start_utc: FUTURE,
    });
    const { service } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.rescheduleForAcademy('academy-1', SESSION_ID, {
        newStartLocal: FUTURE_LOCAL,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('the Academy path announces with the academy actor, resolved from the academy-owned session', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const moved = {
      ...session,
      scheduled_start_utc: new Date('2030-06-15T10:30:00Z'),
    };
    const findByIdInAcademy = jest.fn().mockResolvedValue(session);
    const { service, notices } = buildService({
      findByIdInAcademy,
      rescheduleIfScheduled: jest.fn().mockResolvedValue(moved),
    });

    await service.rescheduleForAcademy('academy-1', SESSION_ID, {
      newStartLocal: FUTURE_LOCAL,
    });

    expect(findByIdInAcademy).toHaveBeenCalledWith(SESSION_ID, 'academy-1');
    expect(notices.notifyRescheduled).toHaveBeenCalledTimes(1);
    expect(notices.notifyRescheduled).toHaveBeenCalledWith(session, moved, {
      kind: 'academy',
      academyId: 'academy-1',
    });
  });

  it('an Academy reschedule of a class the academy does not own is a 404 and announces nothing', async () => {
    const { service, notices } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.rescheduleForAcademy('academy-1', SESSION_ID, {
        newStartLocal: FUTURE_LOCAL,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });

  it('a failed Academy reschedule (time conflict) announces nothing', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const { service, notices } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(session),
      hasScheduledOverlapForTutor: jest.fn().mockResolvedValue(true),
    });

    await expect(
      service.rescheduleForAcademy('academy-1', SESSION_ID, {
        newStartLocal: FUTURE_LOCAL,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });
});

describe('SessionsService.updateMeetingUrl (H4 edit)', () => {
  it('updates the meeting link for a scheduled session', async () => {
    const session = makeSession({ status: 'scheduled' });
    const updateMeetingUrl = jest
      .fn()
      .mockResolvedValue({ ...session, meeting_url: 'https://meet.example/x' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      updateMeetingUrl,
    });

    const result = await service.updateMeetingUrl(TUTOR_ID, SESSION_ID, {
      meetingUrl: 'https://meet.example/x',
    });

    expect(result.meeting_url).toBe('https://meet.example/x');
    expect(updateMeetingUrl).toHaveBeenCalledWith(
      SESSION_ID,
      'https://meet.example/x',
    );
  });

  it('clearing the link (null) is a distinct case from omitting it (undefined, no-op)', async () => {
    const session = makeSession({ status: 'scheduled' });
    const updateMeetingUrl = jest
      .fn()
      .mockResolvedValue({ ...session, meeting_url: null });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      updateMeetingUrl,
    });

    await service.updateMeetingUrl(TUTOR_ID, SESSION_ID, { meetingUrl: null });
    expect(updateMeetingUrl).toHaveBeenCalledWith(SESSION_ID, null);

    updateMeetingUrl.mockClear();
    await service.updateMeetingUrl(TUTOR_ID, SESSION_ID, {});
    expect(updateMeetingUrl).not.toHaveBeenCalled();
  });

  it('rejects editing a class that is no longer scheduled', async () => {
    const session = makeSession({ status: 'completed' });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.updateMeetingUrl(TUTOR_ID, SESSION_ID, {
        meetingUrl: 'https://meet.example/x',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_ALREADY_COMPLETED },
    });
  });
});

// H6 — a substitute teacher previously had zero access to the class
// they were assigned to cover: getOwnedSession only ever matched
// tutor_id. getViewableSession (view + attendance only, per product
// decision — never cancel/complete/reschedule/edit) is the fix.
describe('SessionsService.getViewableSession (H6 substitute access)', () => {
  const SUBSTITUTE_ID = 'substitute-1';

  it('the original teacher can view their own session, same as before', async () => {
    const session = makeSession({
      tutor_id: TUTOR_ID,
      substitute_tutor_id: null,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.getViewableSession(TUTOR_ID, SESSION_ID),
    ).resolves.toEqual(session);
  });

  it('an assigned substitute can view the session they are covering', async () => {
    const session = makeSession({
      tutor_id: TUTOR_ID,
      substitute_tutor_id: SUBSTITUTE_ID,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.getViewableSession(SUBSTITUTE_ID, SESSION_ID),
    ).resolves.toEqual(session);
  });

  it('a random teacher who is neither the owner nor the assigned substitute is rejected (direct-ID probe)', async () => {
    const session = makeSession({
      tutor_id: TUTOR_ID,
      substitute_tutor_id: SUBSTITUTE_ID,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
    });

    await expect(
      service.getViewableSession('random-teacher', SESSION_ID),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("a substitute's own ownership check never runs getOwnedBatch (which would always reject a non-owner)", async () => {
    const session = makeSession({
      tutor_id: TUTOR_ID,
      substitute_tutor_id: SUBSTITUTE_ID,
    });
    const getOwnedBatch = jest.fn();
    const findByIdUnchecked = jest.fn().mockResolvedValue({
      id: BATCH_ID,
      tutor_id: TUTOR_ID,
      academy_id: null,
    });
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      getOwnedBatch,
      findByIdUnchecked,
    });

    await service.getViewableSession(SUBSTITUTE_ID, SESSION_ID);

    expect(getOwnedBatch).not.toHaveBeenCalled();
    expect(findByIdUnchecked).toHaveBeenCalledWith(BATCH_ID);
  });
});

describe('SessionsService — H4 immediate notices only after a committed change', () => {
  const FUTURE_LOCAL = '2030-06-15T16:00';

  it('a single cancel announces exactly that class, with the teacher as actor', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const { service, notices } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled: jest
        .fn()
        .mockResolvedValue({ ...session, status: 'cancelled' }),
    });

    await service.cancel(TUTOR_ID, SESSION_ID, false);

    expect(notices.notifyCancelled).toHaveBeenCalledWith(
      [SESSION_ID],
      'teacher_manual',
    );
  });

  it('an academy cancel is attributed to the academy', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const { service, notices } = buildService({
      findByIdInAcademy: jest.fn().mockResolvedValue(session),
      cancelIfScheduled: jest
        .fn()
        .mockResolvedValue({ ...session, status: 'cancelled' }),
    });

    await service.cancelForAcademy('academy-1', SESSION_ID, false);

    expect(notices.notifyCancelled).toHaveBeenCalledWith(
      [SESSION_ID],
      'academy_manual',
    );
  });

  it('a cancel that lost the race (or repeats) announces nothing', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const findById = jest
      .fn()
      .mockResolvedValueOnce(session)
      .mockResolvedValue({ ...session, status: 'cancelled' });
    const { service, notices } = buildService({
      findById,
      cancelIfScheduled: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.cancel(TUTOR_ID, SESSION_ID, false),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(notices.notifyCancelled).not.toHaveBeenCalled();
  });

  it('a rejected reschedule announces nothing', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const { service, notices } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      hasScheduledOverlapForTutor: jest.fn().mockResolvedValue(true),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({ status: 409 });
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });

  it('rescheduling to the time it already has is a silent no-op (a double submit notifies once)', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: new Date('2030-06-15T10:30:00Z'), // = 16:00 IST
    });
    const rescheduleIfScheduled = jest.fn();
    const { service, notices } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      rescheduleIfScheduled,
    });

    const result = await service.reschedule(TUTOR_ID, SESSION_ID, {
      newStartLocal: FUTURE_LOCAL,
    });

    expect(result).toBe(session);
    expect(rescheduleIfScheduled).not.toHaveBeenCalled();
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });

  it('losing a race to an identical concurrent reschedule returns the result without a second notice', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const moved = {
      ...session,
      scheduled_start_utc: new Date('2030-06-15T10:30:00Z'),
    };
    const findById = jest
      .fn()
      .mockResolvedValueOnce(session)
      .mockResolvedValue(moved);
    const { service, notices } = buildService({
      findById,
      rescheduleIfScheduled: jest.fn().mockResolvedValue(undefined),
    });

    const result = await service.reschedule(TUTOR_ID, SESSION_ID, {
      newStartLocal: FUTURE_LOCAL,
    });

    expect(result).toEqual(moved);
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });

  it('losing a race to a DIFFERENT concurrent reschedule is a 409, not a silent overwrite', async () => {
    const session = makeSession({
      status: 'scheduled',
      scheduled_start_utc: FUTURE,
    });
    const findById = jest
      .fn()
      .mockResolvedValueOnce(session)
      .mockResolvedValue({
        ...session,
        scheduled_start_utc: new Date('2030-07-01T10:30:00Z'),
      });
    const { service, notices } = buildService({
      findById,
      rescheduleIfScheduled: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.reschedule(TUTOR_ID, SESSION_ID, { newStartLocal: FUTURE_LOCAL }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: ErrorCode.SESSION_RESCHEDULE_CONFLICT },
    });
    expect(notices.notifyRescheduled).not.toHaveBeenCalled();
  });
});
