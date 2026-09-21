// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// teacher-leave.service.spec.ts / sessions.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { AcademyOwnerAttendanceService } from './academy-owner-attendance.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import type { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  listForAcademy?: jest.Mock;
  listForAcademyBetween?: jest.Mock;
  listForBatches?: jest.Mock;
  listForBatch?: jest.Mock;
  listEnrollments?: jest.Mock;
  listEnrollmentsForAcademy?: jest.Mock;
  summaryForStudent?: jest.Mock;
  summaryForStudentBetween?: jest.Mock;
  listForStudent?: jest.Mock;
  findById?: jest.Mock;
  findActiveMembership?: jest.Mock;
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

  // Names for attributing the academy's own (historical) records: the real
  // repository returns every teacher who was ever a member; the fake derives
  // them from the same roster the test already provides.
  const membershipsFake = academyMembershipsRepository as unknown as {
    listActiveForAcademy: (
      id: string,
    ) => Promise<Array<{ tutor_id: string; display_name: string }>>;
    displayNamesForAcademy: (id: string) => Promise<Map<string, string>>;
  };
  membershipsFake.displayNamesForAcademy = async (id) =>
    new Map(
      (await membershipsFake.listActiveForAcademy(id)).map((t) => [
        t.tutor_id,
        t.display_name,
      ]),
    );

  const batchesRepository = {
    listForAcademy:
      overrides.listForAcademy ??
      jest
        .fn()
        .mockResolvedValue([
          { id: BATCH_ID, tutor_id: TUTOR_ID, enrolled_count: '2' },
        ]),
    listEnrollments:
      overrides.listEnrollments ?? jest.fn().mockResolvedValue([]),
    listEnrollmentsForAcademy:
      overrides.listEnrollmentsForAcademy ?? jest.fn().mockResolvedValue([]),
    findByIdInAcademy:
      overrides.findById ??
      jest.fn().mockResolvedValue({ id: BATCH_ID, tutor_id: TUTOR_ID }),
  } as unknown as BatchesRepository;

  const sessionsRepository = {
    listForAcademyBetween:
      overrides.listForAcademyBetween ?? jest.fn().mockResolvedValue([]),
  } as unknown as SessionsRepository;

  const attendanceRepository = {
    listForBatches: overrides.listForBatches ?? jest.fn().mockResolvedValue([]),
    listForBatch: overrides.listForBatch ?? jest.fn().mockResolvedValue([]),
    summaryForStudent:
      overrides.summaryForStudent ??
      jest.fn().mockResolvedValue({
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        attendanceRate: null,
      }),
    summaryForStudentBetween:
      overrides.summaryForStudentBetween ??
      jest.fn().mockResolvedValue({
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        rate: null,
      }),
    listForStudent: overrides.listForStudent ?? jest.fn().mockResolvedValue([]),
  } as unknown as AttendanceRepository;

  return new AcademyOwnerAttendanceService(
    academiesRepository,
    academyMembershipsRepository,
    batchesRepository,
    sessionsRepository,
    attendanceRepository,
  );
}

describe('AcademyOwnerAttendanceService.getTodaySummary', () => {
  it('excludes cancelled sessions from classes-today and students-expected', async () => {
    const listForAcademyBetween = jest.fn().mockResolvedValue([
      { id: 's1', batch_id: BATCH_ID, tutor_id: TUTOR_ID, status: 'scheduled' },
      { id: 's2', batch_id: BATCH_ID, tutor_id: TUTOR_ID, status: 'cancelled' },
    ]);
    const service = buildService({ listForAcademyBetween });

    const summary = await service.getTodaySummary(OWNER_ID);

    expect(summary.classesToday).toBe(1);
    expect(summary.studentsExpected).toBe(2); // one active session x 2 enrolled
  });

  it('never treats an unmarked seat as absent', async () => {
    const listForAcademyBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'scheduled',
      },
    ]);
    // No attendance rows exist yet for this session.
    const service = buildService({
      listForAcademyBetween,
      listForBatches: jest.fn().mockResolvedValue([]),
    });

    const summary = await service.getTodaySummary(OWNER_ID);

    expect(summary.present).toBe(0);
    expect(summary.absent).toBe(0);
    expect(summary.attendancePercent).toBeNull();
  });
});

describe('AcademyOwnerAttendanceService.listAttendanceTable', () => {
  it('only derives absences for completed sessions, not scheduled ones', async () => {
    const listForAcademyBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'scheduled',
        scheduled_start_utc: new Date(),
        batch_title: 'Grade 10 Physics',
      },
      {
        id: 's2',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'completed',
        scheduled_start_utc: new Date(),
        batch_title: 'Grade 10 Physics',
      },
    ]);
    // Only one of the two enrolled students was marked present for the completed session.
    const listForBatches = jest.fn().mockResolvedValue([
      {
        session_id: 's2',
        batch_id: BATCH_ID,
        student_id: 'student-1',
        status: 'present',
      },
    ]);
    const service = buildService({ listForAcademyBetween, listForBatches });

    const rows = await service.listAttendanceTable(OWNER_ID, {});
    const scheduledRow = rows.find((r) => r.sessionId === 's1')!;
    const completedRow = rows.find((r) => r.sessionId === 's2')!;

    expect(scheduledRow.present).toBe(0);
    expect(scheduledRow.absent).toBe(0); // not yet happened — never a false absence
    expect(completedRow.present).toBe(1);
    expect(completedRow.absent).toBe(1); // 2 enrolled - 1 marked present
  });
});

describe('AcademyOwnerAttendanceService academy isolation', () => {
  it('rejects a student not enrolled anywhere in this academy', async () => {
    const service = buildService({
      listEnrollmentsForAcademy: jest.fn().mockResolvedValue([]),
    });
    await expect(
      service.getStudentAttendance(OWNER_ID, 'someone-elses-student'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a batch this academy doesn't own (another academy's or a teacher's Individual batch) as not found", async () => {
    const findById = jest.fn().mockResolvedValue(undefined);
    const service = buildService({ findById });
    await expect(
      service.getBatchAttendance(OWNER_ID, 'someone-elses-batch'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findById).toHaveBeenCalledWith('someone-elses-batch', 'academy-1');
  });

  it("a student's attendance is limited to THIS academy's classes — their attendance in a teacher's Individual batch is never returned", async () => {
    const summaryForStudentBetween = jest.fn().mockResolvedValue({
      total: 1,
      present: 1,
      late: 0,
      absent: 0,
      rate: 100,
    });
    const listForStudent = jest.fn().mockResolvedValue([]);
    const service = buildService({
      listEnrollmentsForAcademy: jest
        .fn()
        .mockResolvedValue([{ student_id: 'student-1' }]),
      summaryForStudentBetween,
      listForStudent,
    });

    await service.getStudentAttendance(OWNER_ID, 'student-1');

    expect(summaryForStudentBetween).toHaveBeenCalledWith(
      'student-1',
      expect.any(Date),
      expect.any(Date),
      'academy-1',
    );
    expect(listForStudent).toHaveBeenCalledWith('student-1', 'academy-1');
  });

  it('rejects a caller with no academy at all', async () => {
    const service = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });
    await expect(service.getTodaySummary(OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
