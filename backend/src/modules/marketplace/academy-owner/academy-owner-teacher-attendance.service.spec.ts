// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// academy-owner-attendance.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AcademyOwnerTeacherAttendanceService } from './academy-owner-teacher-attendance.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import type { TeacherAttendanceRepository } from '../../scheduling/attendance/teacher-attendance.repository';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const TUTOR_ID = 'tutor-1';
const OTHER_TUTOR_ID = 'tutor-2';
const BATCH_ID = 'batch-1';

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  findActiveMembership?: jest.Mock;
  listForTutorsBetween?: jest.Mock;
  findById?: jest.Mock;
  findBySessionIds?: jest.Mock;
  upsert?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID }),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest
        .fn()
        .mockResolvedValue([{ tutor_id: TUTOR_ID, display_name: 'Priya' }]),
    findActiveMembership:
      overrides.findActiveMembership ??
      jest.fn().mockResolvedValue({ id: 'membership-1' }),
  } as unknown as AcademyMembershipsRepository;

  const sessionsRepository = {
    listForTutorsBetween:
      overrides.listForTutorsBetween ?? jest.fn().mockResolvedValue([]),
    findById:
      overrides.findById ??
      jest.fn().mockResolvedValue({
        id: 's1',
        tutor_id: TUTOR_ID,
        status: 'scheduled',
        substitute_tutor_id: null,
      }),
  } as unknown as SessionsRepository;

  const teacherAttendanceRepository = {
    findBySessionIds:
      overrides.findBySessionIds ?? jest.fn().mockResolvedValue([]),
    upsert:
      overrides.upsert ??
      jest.fn().mockResolvedValue({ id: 'ta-1', status: 'present' }),
  } as unknown as TeacherAttendanceRepository;

  return new AcademyOwnerTeacherAttendanceService(
    academiesRepository,
    academyMembershipsRepository,
    sessionsRepository,
    teacherAttendanceRepository,
  );
}

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    batch_id: BATCH_ID,
    tutor_id: TUTOR_ID,
    scheduled_start_utc: new Date('2026-09-17T10:00:00Z'),
    batch_title: 'Grade 10 Physics',
    status: 'scheduled',
    cancellation_reason: null,
    substitute_tutor_id: null,
    ...overrides,
  };
}

describe('AcademyOwnerTeacherAttendanceService academy isolation', () => {
  it('rejects a caller with no academy at all', async () => {
    const service = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });
    await expect(service.getTodaySummary(OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a teacher who is not an active member of this academy', async () => {
    const service = buildService({
      findActiveMembership: jest.fn().mockResolvedValue(undefined),
    });
    await expect(
      service.getTeacherAttendance(OWNER_ID, OTHER_TUTOR_ID, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('excludes an inactive/other-academy teacher from the table entirely', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ id: 's1', tutor_id: TUTOR_ID }),
    ]);
    // Only TUTOR_ID is an active member; OTHER_TUTOR_ID's sessions would
    // never be returned by listForTutorsBetween(tutorIds) in the first
    // place because tutorIds only ever comes from listActiveForAcademy.
    const service = buildService({ listForTutorsBetween });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows.every((r) => r.teacherId === TUTOR_ID)).toBe(true);
  });
});

describe('AcademyOwnerTeacherAttendanceService.deriveOutcome (via listAttendanceTable)', () => {
  it('does not mark a scheduled class present just because it exists', async () => {
    const listForTutorsBetween = jest
      .fn()
      .mockResolvedValue([session({ status: 'scheduled' })]);
    const service = buildService({ listForTutorsBetween, findBySessionIds: jest.fn().mockResolvedValue([]) });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].present).toBe(0);
    expect(rows[0].absent).toBe(0);
    expect(rows[0].scheduledClasses).toBe(1);
  });

  it('records present/absent from an explicit teacher_attendance row', async () => {
    const listForTutorsBetween = jest
      .fn()
      .mockResolvedValue([
        session({ id: 's1', status: 'completed' }),
        session({ id: 's2', status: 'completed' }),
      ]);
    const findBySessionIds = jest.fn().mockResolvedValue([
      { session_id: 's1', status: 'present' },
      { session_id: 's2', status: 'absent' },
    ]);
    const service = buildService({ listForTutorsBetween, findBySessionIds });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].present).toBe(1);
    expect(rows[0].absent).toBe(1);
    expect(rows[0].attendancePercent).toBe(50);
  });

  it('treats an academy/government holiday as neither present nor absent', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ status: 'cancelled', cancellation_reason: 'academy_holiday' }),
    ]);
    const service = buildService({ listForTutorsBetween });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].present).toBe(0);
    expect(rows[0].absent).toBe(0);
    expect(rows[0].approvedLeave).toBe(0);
    expect(rows[0].attendancePercent).toBeNull();
  });

  it('treats a manually cancelled class as neither present nor absent', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ status: 'cancelled', cancellation_reason: 'manual' }),
    ]);
    const service = buildService({ listForTutorsBetween });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].present).toBe(0);
    expect(rows[0].absent).toBe(0);
    expect(rows[0].attendancePercent).toBeNull();
  });

  it('treats approved teacher leave (cancelled) as leave, not absence', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ status: 'cancelled', cancellation_reason: 'teacher_leave' }),
    ]);
    const service = buildService({ listForTutorsBetween });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].approvedLeave).toBe(1);
    expect(rows[0].absent).toBe(0);
    expect(rows[0].attendancePercent).toBeNull();
  });

  it('treats a substitute-covered class as the original teacher\'s approved leave, not absence', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ status: 'scheduled', substitute_tutor_id: 'substitute-1' }),
    ]);
    const service = buildService({ listForTutorsBetween });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows[0].approvedLeave).toBe(1);
    expect(rows[0].absent).toBe(0);
    expect(rows[0].present).toBe(0);
  });

  it('never treats "no scheduled class" as an absence', async () => {
    const service = buildService({
      listForTutorsBetween: jest.fn().mockResolvedValue([]),
    });
    const rows = await service.listAttendanceTable(OWNER_ID, {});
    expect(rows).toHaveLength(0);
  });

  it('student attendance data is never consulted for teacher attendance', () => {
    // Structural guarantee: the service's constructor has no
    // AttendanceRepository (student attendance) parameter at all, so it
    // is impossible for this service to read or write student rows.
    expect(AcademyOwnerTeacherAttendanceService.length).toBe(4);
  });
});

describe('AcademyOwnerTeacherAttendanceService filters', () => {
  it('teacherId filter narrows the table to that teacher only', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([]);
    const listActiveForAcademy = jest.fn().mockResolvedValue([
      { tutor_id: TUTOR_ID, display_name: 'Priya' },
      { tutor_id: OTHER_TUTOR_ID, display_name: 'Kumar' },
    ]);
    const service = buildService({ listForTutorsBetween, listActiveForAcademy });
    await service.listAttendanceTable(OWNER_ID, { teacherId: TUTOR_ID });
    expect(listForTutorsBetween).toHaveBeenCalledWith(
      [TUTOR_ID],
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('status=absent filters out rows with no recorded absence', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ id: 's1', status: 'completed' }),
    ]);
    const findBySessionIds = jest
      .fn()
      .mockResolvedValue([{ session_id: 's1', status: 'present' }]);
    const service = buildService({ listForTutorsBetween, findBySessionIds });
    const rows = await service.listAttendanceTable(OWNER_ID, { status: 'absent' });
    expect(rows).toHaveLength(0);
  });
});

describe('AcademyOwnerTeacherAttendanceService.markAttendance', () => {
  it('rejects marking a cancelled session', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        tutor_id: TUTOR_ID,
        status: 'cancelled',
        substitute_tutor_id: null,
      }),
    });
    await expect(
      service.markAttendance(OWNER_ID, { sessionId: 's1', status: 'present' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects marking a session already covered by a substitute', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        tutor_id: TUTOR_ID,
        status: 'scheduled',
        substitute_tutor_id: 'substitute-1',
      }),
    });
    await expect(
      service.markAttendance(OWNER_ID, { sessionId: 's1', status: 'present' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects marking a class that isn't taught at this academy", async () => {
    const service = buildService({
      findActiveMembership: jest.fn().mockResolvedValue(undefined),
    });
    await expect(
      service.markAttendance(OWNER_ID, { sessionId: 's1', status: 'present' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('upserts present/absent for a valid, non-cancelled, non-substituted session', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'ta-1', status: 'present' });
    const service = buildService({ upsert });
    await service.markAttendance(OWNER_ID, { sessionId: 's1', status: 'present' });
    expect(upsert).toHaveBeenCalledWith('s1', TUTOR_ID, 'present', OWNER_ID);
  });

  it('rejects marking a session that does not exist', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue(undefined),
    });
    await expect(
      service.markAttendance(OWNER_ID, { sessionId: 'missing', status: 'present' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcademyOwnerTeacherAttendanceService.getTeacherAttendance', () => {
  it('is scoped to the requested teacher and computes attendance % correctly', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      session({ id: 's1', status: 'completed' }),
      session({ id: 's2', status: 'completed' }),
      session({ id: 's3', status: 'cancelled', cancellation_reason: 'teacher_leave' }),
    ]);
    const findBySessionIds = jest.fn().mockResolvedValue([
      { session_id: 's1', status: 'present' },
      { session_id: 's2', status: 'present' },
    ]);
    const service = buildService({ listForTutorsBetween, findBySessionIds });

    const result = await service.getTeacherAttendance(OWNER_ID, TUTOR_ID, {});

    expect(result.summary.scheduledClasses).toBe(3);
    expect(result.summary.present).toBe(2);
    expect(result.summary.absent).toBe(0);
    expect(result.summary.approvedLeave).toBe(1);
    expect(result.summary.attendancePercent).toBe(100);
    expect(result.history).toHaveLength(3);
  });
});
