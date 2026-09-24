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
import { ErrorCode } from '../../../common/http/error-codes';

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
    cancelSeries:
      overrides.cancelSeries ?? jest.fn().mockResolvedValue(undefined),
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

  return {
    service: new SessionsService(repository, batchesService, teachingContext),
    repository,
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
    const cancelSeries = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(session),
      cancelIfScheduled,
      cancelSeries,
    });

    const result = await service.cancel(TUTOR_ID, SESSION_ID, true);

    expect(result).toEqual({ cancelled: 'series' });
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
    const { service } = buildService({
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
