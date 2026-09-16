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

function buildService(overrides: {
  findById?: jest.Mock;
  findForAcademy?: jest.Mock;
  listSessionIdsForRequest?: jest.Mock;
  setStatus?: jest.Mock;
  create?: jest.Mock;
  snapshotSessions?: jest.Mock;
  findActiveMembership?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  findAcademyById?: jest.Mock;
  findByIds?: jest.Mock;
  assignSubstitute?: jest.Mock;
  setHolidayOrLeaveCancellation?: jest.Mock;
  hasScheduledOverlapForTutor?: jest.Mock;
  listScheduledForTutorsBetween?: jest.Mock;
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
    setStatus: overrides.setStatus ?? jest.fn().mockResolvedValue(undefined),
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
    listScheduledForTutorsBetween:
      overrides.listScheduledForTutorsBetween ??
      jest.fn().mockResolvedValue([SESSION]),
    findByIds: overrides.findByIds ?? jest.fn().mockResolvedValue([SESSION]),
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
  it("cancels the affected sessions and notifies only the tutor and that class's students/parents", async () => {
    const findForAcademy = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
    });
    const setHolidayOrLeaveCancellation = jest
      .fn()
      .mockResolvedValue(undefined);
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const { service } = buildService({
      findForAcademy,
      setHolidayOrLeaveCancellation,
      notify,
    });

    await service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1');

    expect(setHolidayOrLeaveCancellation).toHaveBeenCalledWith(
      SESSION.id,
      'teacher_leave',
      expect.objectContaining({ teacherLeaveRequestId: REQUEST_ID }),
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
  });

  it('assigns a substitute instead of cancelling when one is given, and rejects a double-booked substitute', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
    });
    const assignSubstitute = jest.fn().mockResolvedValue(undefined);
    const setHolidayOrLeaveCancellation = jest.fn();
    const { service } = buildService({
      findForAcademy,
      assignSubstitute,
      setHolidayOrLeaveCancellation,
    });

    await service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1', 'substitute-1');

    expect(assignSubstitute).toHaveBeenCalledWith(
      SESSION.id,
      'substitute-1',
      REQUEST_ID,
    );
    expect(setHolidayOrLeaveCancellation).not.toHaveBeenCalled();
  });

  it('refuses a substitute who already has a class at the same time', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
    });
    const hasScheduledOverlapForTutor = jest.fn().mockResolvedValue(true);
    const { service } = buildService({
      findForAcademy,
      hasScheduledOverlapForTutor,
    });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1', 'substitute-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it("won't let an academy approve a request that isn't theirs", async () => {
    const findForAcademy = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy });

    await expect(
      service.approve(OTHER_ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to re-decide an already-decided request', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'approved',
    });
    const { service } = buildService({ findForAcademy });

    await expect(
      service.approve(ACADEMY_ID, REQUEST_ID, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TeacherLeaveService.reject', () => {
  it('notifies only the requesting tutor, never the whole academy', async () => {
    const findForAcademy = jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      tutor_id: TUTOR_ID,
      status: 'pending',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
    });
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findForAcademy, notify });

    await service.reject(ACADEMY_ID, REQUEST_ID, 'admin-1');

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [TUTOR_ID],
        type: 'teacher_leave_rejected',
      }),
    );
  });
});
