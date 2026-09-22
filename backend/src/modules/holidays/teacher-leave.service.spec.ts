// TeacherLeaveService transitively imports SessionsRepository, which
// imports database.module.ts (real Kysely/pg pool setup, an ESM
// dependency this Jest config can't transform) and `sql` as a real
// value from 'kysely' — same workaround as payments.service.spec.ts.
// The service is constructed directly below with mocked dependencies,
// so neither mock's actual shape matters, only that importing doesn't
// crash.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeacherLeaveService } from './teacher-leave.service';
import type { TeacherLeaveRepository } from './teacher-leave.repository';
import type { AcademyMembershipsRepository } from '../marketplace/academy-memberships/academy-memberships.repository';
import type { AcademiesRepository } from '../marketplace/academies/academies.repository';
import type { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import type {
  NotificationsService,
  NotifyInput,
} from '../notifications/notifications.service';

const TUTOR_ID = 'tutor-1';
const OTHER_TUTOR_ID = 'tutor-2';
const ACADEMY_ID = 'academy-1';
const OTHER_ACADEMY_ID = 'academy-2';
const REQUEST_ID = 'leave-1';
const SESSION = {
  id: 'session-1',
  batch_id: 'batch-1',
  tutor_id: TUTOR_ID,
  scheduled_start_utc: new Date('2026-09-20T10:30:00.000Z'),
  timezone: 'Asia/Kolkata',
  duration_min: 60,
  status: 'scheduled' as const,
};

const PENDING_REQUEST = {
  id: REQUEST_ID,
  tutor_id: TUTOR_ID,
  academy_id: ACADEMY_ID,
  status: 'pending' as const,
  start_date: '2026-09-20',
  end_date: '2026-09-20',
};

function buildService(overrides: {
  findById?: jest.Mock;
  findForAcademy?: jest.Mock;
  listSessionIdsForRequest?: jest.Mock;
  setStatus?: jest.Mock;
  decide?: jest.Mock;
  create?: jest.Mock;
  snapshotSessions?: jest.Mock;
  findActiveMembership?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  findAcademyById?: jest.Mock;
  findByIdsInAcademy?: jest.Mock;
  assignSubstitute?: jest.Mock;
  setHolidayOrLeaveCancellation?: jest.Mock;
  hasScheduledOverlapForTutor?: jest.Mock;
  listScheduledForAcademyBetween?: jest.Mock;
  listDistinctStudentIdsForBatches?: jest.Mock;
  findByIdBatch?: jest.Mock;
  listActiveParentIdsForStudents?: jest.Mock;
  notify?: jest.Mock;
}) {
  const repository = {
    findById: overrides.findById ?? jest.fn(),
    findForAcademy: overrides.findForAcademy ?? jest.fn(),
    listSessionIdsForRequest:
      overrides.listSessionIdsForRequest ??
      jest.fn().mockResolvedValue([SESSION.id]),
    // Truthy by default — matches a real successful atomic transition.
    // Override with a `mockResolvedValue(undefined)` mock to simulate
    // the "already decided by someone else" race.
    setStatus:
      overrides.setStatus ??
      jest.fn().mockResolvedValue({ id: REQUEST_ID, status: 'approved' }),
    // Default: a successful approval that cancelled the one snapshotted
    // session. Override with `mockResolvedValue(undefined)` to simulate
    // "already decided by someone else" (concurrent/repeated decision),
    // or with a different `sessions` array to simulate the DB-side
    // eligibility filter having excluded some/all of them.
    decide:
      overrides.decide ??
      jest.fn().mockResolvedValue({
        request: { ...PENDING_REQUEST, status: 'approved' as const },
        sessions: [SESSION],
      }),
    create:
      overrides.create ??
      jest.fn().mockResolvedValue({ id: REQUEST_ID, status: 'pending' }),
    snapshotSessions:
      overrides.snapshotSessions ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as TeacherLeaveRepository;

  const academyMembershipsRepository = {
    findActiveMembership:
      overrides.findActiveMembership ??
      jest.fn().mockResolvedValue({ id: 'm1' }),
    listActiveForAcademy:
      overrides.listActiveForAcademy ?? jest.fn().mockResolvedValue([]),
  } as unknown as AcademyMembershipsRepository;

  const academiesRepository = {
    findById:
      overrides.findAcademyById ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID, owner_user_id: 'owner-1' }),
  } as unknown as AcademiesRepository;

  const sessionsRepository = {
    listScheduledForAcademyBetween:
      overrides.listScheduledForAcademyBetween ??
      jest.fn().mockResolvedValue([SESSION]),
    findByIdsInAcademy:
      overrides.findByIdsInAcademy ?? jest.fn().mockResolvedValue([SESSION]),
    assignSubstitute:
      overrides.assignSubstitute ?? jest.fn().mockResolvedValue(undefined),
    setHolidayOrLeaveCancellation:
      overrides.setHolidayOrLeaveCancellation ??
      jest.fn().mockResolvedValue(undefined),
    hasScheduledOverlapForTutor:
      overrides.hasScheduledOverlapForTutor ??
      jest.fn().mockResolvedValue(false),
  } as unknown as SessionsRepository;

  const batchesRepository = {
    listDistinctStudentIdsForBatches:
      overrides.listDistinctStudentIdsForBatches ??
      jest.fn().mockResolvedValue(['student-1']),
    findById:
      overrides.findByIdBatch ??
      jest
        .fn()
        .mockResolvedValue({ id: SESSION.batch_id, title: 'Grade 10 Physics' }),
  } as unknown as BatchesRepository;

  const attendanceRepository = {
    listActiveParentIdsForStudents:
      overrides.listActiveParentIdsForStudents ??
      jest.fn().mockResolvedValue(['parent-1']),
  } as unknown as AttendanceRepository;

  const notify = overrides.notify ?? jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const service = new TeacherLeaveService(
    repository,
    academyMembershipsRepository,
    academiesRepository,
    sessionsRepository,
    batchesRepository,
    attendanceRepository,
    notificationsService,
  );

  return {
    service,
    repository,
    academyMembershipsRepository,
    academiesRepository,
    sessionsRepository,
    batchesRepository,
    attendanceRepository,
    notify,
  };
}

describe('TeacherLeaveService.create', () => {
  it('starts a new request as pending and snapshots the matching scheduled sessions', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ id: REQUEST_ID, status: 'pending' });
    const snapshotSessions = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ create, snapshotSessions });

    const result = await service.create(TUTOR_ID, {
      academyId: ACADEMY_ID,
      startDate: '2026-09-20',
      leaveType: 'full_day',
    } as never);

    expect(result.status).toBe('pending');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tutorId: TUTOR_ID, academyId: ACADEMY_ID }),
    );
    expect(snapshotSessions).toHaveBeenCalledWith(REQUEST_ID, [SESSION.id]);
  });

  it('only considers the classes this teacher runs FOR THIS ACADEMY — never their Individual classes', async () => {
    const listScheduledForAcademyBetween = jest
      .fn()
      .mockResolvedValue([SESSION]);
    const { service } = buildService({ listScheduledForAcademyBetween });

    await service.create(TUTOR_ID, {
      academyId: ACADEMY_ID,
      startDate: '2026-09-20',
      leaveType: 'full_day',
    } as never);

    expect(listScheduledForAcademyBetween).toHaveBeenCalledWith(
      ACADEMY_ID,
      expect.any(Date),
      expect.any(Date),
      [TUTOR_ID],
    );
  });

  it('rejects a request for an academy the tutor is not an active member of', async () => {
    const findActiveMembership = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findActiveMembership });

    await expect(
      service.create(TUTOR_ID, {
        academyId: ACADEMY_ID,
        startDate: '2026-09-20',
        leaveType: 'full_day',
      } as never),
    ).rejects.toThrow(ForbiddenException);
  });

  it('notifies the academy owner of the new pending request', async () => {
    const findAcademyById = jest
      .fn()
      .mockResolvedValue({ id: ACADEMY_ID, owner_user_id: 'owner-1' });
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const { service } = buildService({ findAcademyById, notify });

    await service.create(TUTOR_ID, {
      academyId: ACADEMY_ID,
      startDate: '2026-09-20',
      leaveType: 'full_day',
    } as never);

    expect(notify).toHaveBeenCalledTimes(1);
    const [call] = notify.mock.calls.map((c) => c[0]);
    expect(call.userIds).toEqual(['owner-1']);
    expect(call.type).toBe('teacher_leave_requested');
    expect(call.payload).toEqual(
      expect.objectContaining({ tutorId: TUTOR_ID }),
    );
  });

  it('skips the notification, without failing, when the academy has no owner yet', async () => {
    const findAcademyById = jest
      .fn()
      .mockResolvedValue({ id: ACADEMY_ID, owner_user_id: null });
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findAcademyById, notify });

    const result = await service.create(TUTOR_ID, {
      academyId: ACADEMY_ID,
      startDate: '2026-09-20',
      leaveType: 'full_day',
    } as never);

    expect(result.status).toBe('pending');
    expect(notify).not.toHaveBeenCalled();
  });

  it('still creates the request even if notifying the owner fails', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('boom'));
    const { service } = buildService({ notify });

    const result = await service.create(TUTOR_ID, {
      academyId: ACADEMY_ID,
      startDate: '2026-09-20',
      leaveType: 'full_day',
    } as never);

    expect(result.status).toBe('pending');
  });
});

describe('TeacherLeaveService ownership', () => {
  it('lets a teacher withdraw only their own pending request', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: OTHER_TUTOR_ID,
      status: 'pending',
    });
    const { service } = buildService({ findById });

    await expect(
      service.getOwnedForTutor(TUTOR_ID, REQUEST_ID),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('TeacherLeaveService.approve', () => {
  it("commits the atomic decision and notifies only the tutor and that class's students/parents (TEST 5, 18, 19)", async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue({
      request: { ...PENDING_REQUEST, status: 'approved' as const },
      sessions: [SESSION],
    });
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy, decide, notify });

    await service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1');

    // The atomic claim + session mutation happen together, inside the
    // repository's own transaction — see decide's doc comment.
    expect(decide).toHaveBeenCalledWith(
      REQUEST_ID,
      ACADEMY_ID,
      'approved',
      'admin-1',
      null,
    );
    // One notify() call for the tutor's own approval, one for the class's roster.
    expect(notify).toHaveBeenCalledTimes(2);
    const [approvalCall, rosterCall] = notify.mock.calls.map((call) => call[0]);
    expect(approvalCall.userIds).toEqual([TUTOR_ID]);
    expect(approvalCall.type).toBe('teacher_leave_approved');
    expect(rosterCall.userIds).toEqual(
      expect.arrayContaining(['student-1', 'parent-1']),
    );
    expect(rosterCall.type).toBe('class_cancelled_leave');
    // TEST 19 — never the teacher's OWN Individual students, only the
    // roster actually resolved from the affected Academy sessions.
    expect(rosterCall.userIds).not.toContain(TUTOR_ID);
  });

  it('passes a substitute straight through to the atomic decision instead of cancelling', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue({
      request: { ...PENDING_REQUEST, status: 'approved' as const },
      sessions: [SESSION],
    });
    const { service } = buildService({ findForAcademy, decide });

    await service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1', 'substitute-1');

    expect(decide).toHaveBeenCalledWith(
      REQUEST_ID,
      ACADEMY_ID,
      'approved',
      'admin-1',
      'substitute-1',
    );
  });

  it('refuses a substitute who already has a class at the same time, before ever attempting the decision', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const hasScheduledOverlapForTutor = jest.fn().mockResolvedValue(true);
    const decide = jest.fn();
    const { service } = buildService({
      findForAcademy,
      hasScheduledOverlapForTutor,
      decide,
    });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1', 'substitute-1'),
    ).rejects.toThrow(BadRequestException);
    expect(decide).not.toHaveBeenCalled();
  });

  it("won't let an academy approve a request that isn't theirs (TEST 17)", async () => {
    const findForAcademy = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy });

    await expect(
      service.approve(OTHER_ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to re-decide an already-decided request read as such up front', async () => {
    const findForAcademy = jest
      .fn()
      .mockResolvedValue({ ...PENDING_REQUEST, status: 'approved' });
    const { service } = buildService({ findForAcademy });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('TEST 7/10 — refuses to approve once the teacher is no longer an active academy member', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const findActiveMembership = jest.fn().mockResolvedValue(undefined);
    const decide = jest.fn();
    const notify = jest.fn();
    const { service } = buildService({
      findForAcademy,
      findActiveMembership,
      decide,
      notify,
    });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(ConflictException);
    // Zero Individual (or any) side effects — the decision was never
    // even attempted, let alone committed.
    expect(decide).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('TEST 9 — never cancels sessions or notifies when a concurrent decision wins the race', async () => {
    // Regression test for the decide() TOCTOU: findForAcademy still
    // reports 'pending' (read before the race), but the atomic UPDATE
    // inside decide() itself finds the row already decided and matches
    // zero rows — decide() resolving undefined models exactly that.
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue(undefined);
    const notify = jest.fn();
    const { service } = buildService({ findForAcademy, decide, notify });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(ConflictException);
    expect(notify).not.toHaveBeenCalled();
  });

  it('still validates a substitute before attempting to claim the decision', async () => {
    // A bad substitute must fail before decide() is ever called, so a
    // failed approval attempt never leaves the request half-decided.
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    // The teacher-membership re-check and the substitute-membership
    // check both go through findActiveMembership — only the substitute
    // lookup should fail here.
    const findActiveMembership = jest
      .fn()
      .mockImplementation((_academyId: string, tutorId: string) =>
        Promise.resolve(tutorId === TUTOR_ID ? { id: 'm1' } : undefined),
      );
    const decide = jest.fn();
    const { service } = buildService({
      findForAcademy,
      findActiveMembership,
      decide,
    });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1', 'substitute-1'),
    ).rejects.toThrow(BadRequestException);
    expect(decide).not.toHaveBeenCalled();
  });

  it('TEST 20 — sessions the DB-side eligibility check excluded (completed/cancelled/wrong context) are simply absent from the notified roster', async () => {
    // decide() itself performs the eligibility filtering inside its
    // transaction (see its repository-level doc comment / e2e coverage);
    // at the service level what matters is that the service only ever
    // acts on whatever `decide()` says was actually mutated.
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue({
      request: { ...PENDING_REQUEST, status: 'approved' as const },
      sessions: [], // nothing was eligible this time
    });
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy, decide, notify });

    await service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1');

    // Only the tutor's own approval notice — no roster notification for
    // classes that were never actually cancelled.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'teacher_leave_approved' }),
    );
  });
});

describe('TeacherLeaveService.reject', () => {
  it('notifies only the requesting tutor, never the whole academy (TEST 6, 11)', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue({
      request: { ...PENDING_REQUEST, status: 'rejected' as const },
      sessions: [],
    });
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy, decide, notify });

    await service.reject(ACADEMY_ID, REQUEST_ID, 'admin-1');

    expect(decide).toHaveBeenCalledWith(
      REQUEST_ID,
      ACADEMY_ID,
      'rejected',
      'admin-1',
      null,
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [TUTOR_ID],
        type: 'teacher_leave_rejected',
      }),
    );
  });

  it('TEST 8 — repeated rejection is idempotent: a second decide() call reports the conflict, no duplicate notification', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({ ...PENDING_REQUEST });
    const decide = jest.fn().mockResolvedValue(undefined);
    const notify = jest.fn();
    const { service } = buildService({ findForAcademy, decide, notify });

    await expect(
      service.reject(ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(ConflictException);
    expect(notify).not.toHaveBeenCalled();
  });

  it("won't let an academy reject a request that isn't theirs (TEST 17)", async () => {
    const findForAcademy = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy });

    await expect(
      service.reject(OTHER_ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TeacherLeaveService.withdraw', () => {
  it('cancels a pending request the tutor owns', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
    });
    const setStatus = jest
      .fn()
      .mockResolvedValue({ id: REQUEST_ID, status: 'cancelled' });
    const { service } = buildService({ findById, setStatus });

    const result = await service.withdraw(TUTOR_ID, REQUEST_ID);

    expect(setStatus).toHaveBeenCalledWith(REQUEST_ID, 'cancelled', null);
    expect(result.status).toBe('cancelled');
  });

  it('refuses to withdraw a request that has already been decided', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'approved',
    });
    const { service } = buildService({ findById });

    await expect(service.withdraw(TUTOR_ID, REQUEST_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('surfaces a conflict when a concurrent decision wins the race', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
    });
    const setStatus = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findById, setStatus });

    await expect(service.withdraw(TUTOR_ID, REQUEST_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});
