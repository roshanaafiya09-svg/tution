// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// academy-owner-attendance.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { AcademyOwnerReportsService } from './academy-owner-reports.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { AcademyContactRequestsRepository } from '../academies/academy-contact-requests.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import type { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import type { HolidaysRepository } from '../../holidays/holidays.repository';
import type { TeacherLeaveRepository } from '../../holidays/teacher-leave.repository';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  listForTutorsBetween?: jest.Mock;
  listEnrollmentsForTutors?: jest.Mock;
  listForBatches?: jest.Mock;
  listForTutors?: jest.Mock;
  listDistinctStudentIdsForTutors?: jest.Mock;
  listForAcademy?: jest.Mock;
  listGovernment?: jest.Mock;
  listForAcademyWithTutor?: jest.Mock;
  listForAcademyContacts?: jest.Mock;
  summaryForStudentsBetween?: jest.Mock;
  countByHolidayForTutors?: jest.Mock;
  countByLeaveRequestForTutors?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({
        id: ACADEMY_ID,
        country_code: 'IN',
        state_code: 'TN',
      }),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest
        .fn()
        .mockResolvedValue([{ tutor_id: TUTOR_ID, display_name: 'Priya' }]),
  } as unknown as AcademyMembershipsRepository;

  const academyContactRequestsRepository = {
    listForAcademy:
      overrides.listForAcademyContacts ?? jest.fn().mockResolvedValue([]),
  } as unknown as AcademyContactRequestsRepository;

  const batchesRepository = {
    listForTutors: overrides.listForTutors ?? jest.fn().mockResolvedValue([]),
    listEnrollmentsForTutors:
      overrides.listEnrollmentsForTutors ?? jest.fn().mockResolvedValue([]),
    listDistinctStudentIdsForTutors:
      overrides.listDistinctStudentIdsForTutors ??
      jest.fn().mockResolvedValue([]),
  } as unknown as BatchesRepository;

  const sessionsRepository = {
    listForTutorsBetween:
      overrides.listForTutorsBetween ?? jest.fn().mockResolvedValue([]),
    countByHolidayForTutors:
      overrides.countByHolidayForTutors ??
      jest.fn().mockResolvedValue(new Map()),
    countByLeaveRequestForTutors:
      overrides.countByLeaveRequestForTutors ??
      jest.fn().mockResolvedValue(new Map()),
  } as unknown as SessionsRepository;

  const attendanceRepository = {
    listForBatches: overrides.listForBatches ?? jest.fn().mockResolvedValue([]),
    summaryForStudentsBetween:
      overrides.summaryForStudentsBetween ?? jest.fn().mockResolvedValue([]),
  } as unknown as AttendanceRepository;

  const holidaysRepository = {
    listForAcademy: overrides.listForAcademy ?? jest.fn().mockResolvedValue([]),
    listGovernment: overrides.listGovernment ?? jest.fn().mockResolvedValue([]),
  } as unknown as HolidaysRepository;

  const teacherLeaveRepository = {
    listForAcademyWithTutor:
      overrides.listForAcademyWithTutor ?? jest.fn().mockResolvedValue([]),
  } as unknown as TeacherLeaveRepository;

  return new AcademyOwnerReportsService(
    academiesRepository,
    academyMembershipsRepository,
    academyContactRequestsRepository,
    batchesRepository,
    sessionsRepository,
    attendanceRepository,
    holidaysRepository,
    teacherLeaveRepository,
  );
}

describe('AcademyOwnerReportsService.attendance', () => {
  it('never produces an absence row for a scheduled or cancelled (holiday/leave) session', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'scheduled',
        scheduled_start_utc: new Date(),
        timezone: 'Asia/Kolkata',
        batch_title: 'Physics',
        subject_id: 'subj-1',
      },
      {
        id: 's2',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'cancelled',
        cancellation_reason: 'academy_holiday',
        scheduled_start_utc: new Date(),
        timezone: 'Asia/Kolkata',
        batch_title: 'Physics',
        subject_id: 'subj-1',
      },
    ]);
    const listEnrollmentsForTutors = jest
      .fn()
      .mockResolvedValue([
        { student_id: 'student-1', batch_id: BATCH_ID, display_name: 'Ravi' },
      ]);
    const service = buildService({
      listForTutorsBetween,
      listEnrollmentsForTutors,
    });

    const result = await service.attendance(OWNER_ID, {});

    expect(result.rows).toHaveLength(0);
  });

  it('emits exactly one absent row per student per completed session — never double-counting a student who also has an explicit absent row', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'completed',
        scheduled_start_utc: new Date('2026-09-10T04:00:00Z'),
        timezone: 'Asia/Kolkata',
        batch_title: 'Physics',
        subject_id: 'subj-1',
      },
    ]);
    const listEnrollmentsForTutors = jest.fn().mockResolvedValue([
      { student_id: 'student-1', batch_id: BATCH_ID, display_name: 'Ravi' },
      { student_id: 'student-2', batch_id: BATCH_ID, display_name: 'Meena' },
    ]);
    // student-1 explicitly marked absent, student-2 has no row at all
    // (unmarked seat in a completed class).
    const listForBatches = jest.fn().mockResolvedValue([
      {
        session_id: 's1',
        batch_id: BATCH_ID,
        student_id: 'student-1',
        status: 'absent',
        display_name: 'Ravi',
      },
    ]);
    const service = buildService({
      listForTutorsBetween,
      listEnrollmentsForTutors,
      listForBatches,
    });

    const result = await service.attendance(OWNER_ID, {});

    expect(result.totalAbsences).toBe(2);
    const student1Rows = result.rows.filter((r) => r.studentId === 'student-1');
    expect(student1Rows).toHaveLength(1); // not 2
    expect(result.rows.some((r) => r.studentId === 'student-2')).toBe(true);
  });

  it("recovers a since-left student's own historical row for a session during their enrollment", async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'completed',
        scheduled_start_utc: new Date('2026-09-10T04:00:00Z'),
        timezone: 'Asia/Kolkata',
        batch_title: 'Physics',
        subject_id: 'subj-1',
      },
    ]);
    // The student has since left — no longer in active enrollments.
    const listEnrollmentsForTutors = jest.fn().mockResolvedValue([]);
    const listForBatches = jest.fn().mockResolvedValue([
      {
        session_id: 's1',
        batch_id: BATCH_ID,
        student_id: 'left-student',
        status: 'absent',
        display_name: 'Former Student',
      },
    ]);
    const service = buildService({
      listForTutorsBetween,
      listEnrollmentsForTutors,
      listForBatches,
    });

    const result = await service.attendance(OWNER_ID, {});

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].studentId).toBe('left-student');
    expect(result.rows[0].displayName).toBe('Former Student');
  });

  it('never flags a present or late student as absent', async () => {
    const listForTutorsBetween = jest.fn().mockResolvedValue([
      {
        id: 's1',
        batch_id: BATCH_ID,
        tutor_id: TUTOR_ID,
        status: 'completed',
        scheduled_start_utc: new Date(),
        timezone: 'Asia/Kolkata',
        batch_title: 'Physics',
        subject_id: 'subj-1',
      },
    ]);
    const listEnrollmentsForTutors = jest.fn().mockResolvedValue([
      { student_id: 'student-1', batch_id: BATCH_ID, display_name: 'Ravi' },
      { student_id: 'student-2', batch_id: BATCH_ID, display_name: 'Meena' },
    ]);
    const listForBatches = jest.fn().mockResolvedValue([
      {
        session_id: 's1',
        batch_id: BATCH_ID,
        student_id: 'student-1',
        status: 'present',
      },
      {
        session_id: 's1',
        batch_id: BATCH_ID,
        student_id: 'student-2',
        status: 'late',
      },
    ]);
    const service = buildService({
      listForTutorsBetween,
      listEnrollmentsForTutors,
      listForBatches,
    });

    const result = await service.attendance(OWNER_ID, {});
    expect(result.rows).toHaveLength(0);
  });
});

describe('AcademyOwnerReportsService cross-academy isolation', () => {
  it('rejects a caller with no academy at all, on every report', async () => {
    const service = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(service.summary(OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.attendance(OWNER_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.students(OWNER_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
