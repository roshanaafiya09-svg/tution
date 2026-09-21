jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademyTodayService } from './academy-today.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { AcademyContactRequestsRepository } from '../academies/academy-contact-requests.repository';
import type { AcademyReviewsService } from '../academy-reviews/academy-reviews.service';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import type { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import type { TeacherLeaveService } from '../../holidays/teacher-leave.service';
import type { AssessmentsRepository } from '../../assessments/assessments.repository';
import type { AcademyOwnerAssessmentsService } from './academy-owner-assessments.service';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const TUTOR_ID = 'tutor-1';
const OTHER_TUTOR_ID = 'tutor-2';
const BATCH_ID = 'batch-1';

const TODAY = DateTime.now().setZone('Asia/Kolkata').toISODate()!;
const TOMORROW = DateTime.now()
  .setZone('Asia/Kolkata')
  .plus({ days: 1 })
  .toISODate()!;

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    batch_id: BATCH_ID,
    tutor_id: TUTOR_ID,
    batch_title: 'Grade 8 Science',
    subject_id: 'subject-1',
    scheduled_start_utc: new Date(),
    timezone: 'Asia/Kolkata',
    duration_min: 60,
    status: 'scheduled',
    cancellation_reason: null,
    substitute_tutor_id: null,
    substitute_display_name: null,
    ...overrides,
  };
}

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  listBatchesForAcademy?: jest.Mock;
  todaySessions?: unknown[];
  tomorrowSessions?: unknown[];
  listForBatches?: jest.Mock;
  listAllForAcademy?: jest.Mock;
  listForAcademy?: jest.Mock;
  listForAcademyReviews?: jest.Mock;
  todayAssessments?: unknown[];
  tomorrowAssessments?: unknown[];
  listOverdueForAcademy?: jest.Mock;
  getWeeklyCompliance?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID }),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest.fn().mockResolvedValue([
        {
          membership_id: 'm1',
          tutor_id: TUTOR_ID,
          display_name: 'Priya',
          joined_at: new Date(),
        },
      ]),
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

  const academyContactRequestsRepository = {
    listForAcademy: overrides.listForAcademy ?? jest.fn().mockResolvedValue([]),
  } as unknown as AcademyContactRequestsRepository;

  const academyReviewsService = {
    listForAcademy:
      overrides.listForAcademyReviews ??
      jest
        .fn()
        .mockResolvedValue({ reviews: [], summary: { count: 0, average: 0 } }),
  } as unknown as AcademyReviewsService;

  const batchesRepository = {
    listForAcademy:
      overrides.listBatchesForAcademy ??
      jest.fn().mockResolvedValue([
        {
          id: BATCH_ID,
          tutor_id: TUTOR_ID,
          title: 'Grade 8 Science',
          enrolled_count: '20',
          created_at: new Date(),
        },
      ]),
  } as unknown as BatchesRepository;

  const listForAcademyBetween = jest
    .fn()
    .mockResolvedValueOnce(overrides.todaySessions ?? [])
    .mockResolvedValueOnce(overrides.tomorrowSessions ?? []);
  const sessionsRepository = {
    listForAcademyBetween,
  } as unknown as SessionsRepository;

  const attendanceRepository = {
    listForBatches: overrides.listForBatches ?? jest.fn().mockResolvedValue([]),
  } as unknown as AttendanceRepository;

  const teacherLeaveService = {
    listAllForAcademy:
      overrides.listAllForAcademy ?? jest.fn().mockResolvedValue([]),
  } as unknown as TeacherLeaveService;

  const listForAcademyOnDate = jest
    .fn()
    .mockResolvedValueOnce(overrides.todayAssessments ?? [])
    .mockResolvedValueOnce(overrides.tomorrowAssessments ?? []);
  const assessmentsRepository = {
    listForAcademyOnDate,
    listOverdueForAcademy:
      overrides.listOverdueForAcademy ?? jest.fn().mockResolvedValue([]),
  } as unknown as AssessmentsRepository;

  const academyOwnerAssessmentsService = {
    getWeeklyCompliance:
      overrides.getWeeklyCompliance ??
      jest.fn().mockResolvedValue({
        weekStartDate: TODAY,
        summary: {
          teachers: 1,
          completed: 0,
          pending: 0,
          overdue: 0,
          notScheduled: 0,
        },
        teachers: [],
      }),
  } as unknown as AcademyOwnerAssessmentsService;

  const service = new AcademyTodayService(
    academiesRepository,
    academyMembershipsRepository,
    academyContactRequestsRepository,
    academyReviewsService,
    batchesRepository,
    sessionsRepository,
    attendanceRepository,
    teacherLeaveService,
    assessmentsRepository,
    academyOwnerAssessmentsService,
  );

  return { service, listForAcademyBetween, listForAcademyOnDate };
}

describe('AcademyTodayService.getToday — overview', () => {
  it('excludes cancelled sessions from classesToday but still lists them in classes', async () => {
    const { service } = buildService({
      todaySessions: [
        baseSession({ id: 's1', status: 'scheduled' }),
        baseSession({
          id: 's2',
          status: 'cancelled',
          cancellation_reason: 'teacher_leave',
        }),
      ],
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.overview.classesToday).toBe(1);
    expect(today.overview.classesCancelledToday).toBe(1);
    expect(today.classes).toHaveLength(2);
  });

  it('counts attendanceRecordedCount only for sessions that actually have an attendance row', async () => {
    const { service } = buildService({
      todaySessions: [
        baseSession({ id: 's1', status: 'completed' }),
        baseSession({ id: 's2', status: 'completed' }),
      ],
      listForBatches: jest.fn().mockResolvedValue([
        {
          session_id: 's1',
          batch_id: BATCH_ID,
          student_id: 'stu-1',
          status: 'present',
        },
      ]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.overview.attendanceRecordedCount).toBe(1);
    expect(today.classes.find((c) => c.id === 's1')!.attendanceRecorded).toBe(
      true,
    );
    expect(today.classes.find((c) => c.id === 's2')!.attendanceRecorded).toBe(
      false,
    );
  });

  it('derives teachersOnLeaveToday from approved leave covering today, not merely from session data', async () => {
    const { service } = buildService({
      todaySessions: [], // a teacher can be on approved leave with zero classes scheduled
      listAllForAcademy: jest.fn().mockResolvedValue([
        {
          id: 'leave-1',
          tutor_id: TUTOR_ID,
          status: 'approved',
          start_date: TODAY,
          end_date: TODAY,
          created_at: new Date(),
          tutor_display_name: 'Priya',
        },
        {
          id: 'leave-2',
          tutor_id: OTHER_TUTOR_ID,
          status: 'pending',
          start_date: TODAY,
          end_date: TODAY,
          created_at: new Date(),
          tutor_display_name: 'Ravi',
        },
      ]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.overview.teachersOnLeaveToday).toBe(1);
    expect(today.needsAttention.pendingLeaveRequests).toBe(1);
  });
});

describe('AcademyTodayService.getToday — Needs Attention', () => {
  it('only counts a completed, non-cancelled session with zero attendance rows as missing attendance', async () => {
    const { service } = buildService({
      todaySessions: [
        baseSession({ id: 's-completed-missing', status: 'completed' }),
        baseSession({ id: 's-completed-recorded', status: 'completed' }),
        baseSession({ id: 's-scheduled', status: 'scheduled' }),
        baseSession({
          id: 's-cancelled-holiday',
          status: 'cancelled',
          cancellation_reason: 'government_holiday',
        }),
      ],
      listForBatches: jest.fn().mockResolvedValue([
        {
          session_id: 's-completed-recorded',
          batch_id: BATCH_ID,
          student_id: 'stu-1',
          status: 'present',
        },
      ]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.needsAttention.missingAttendance).toBe(1);
  });

  it('counts overdue scorecards straight from AssessmentsRepository.listOverdueForAcademy', async () => {
    const { service } = buildService({
      listOverdueForAcademy: jest
        .fn()
        .mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.needsAttention.overdueScorecards).toBe(3);
  });

  it('only counts contact requests still in the "new" status as pending', async () => {
    const { service } = buildService({
      listForAcademy: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          status: 'new',
          student_display_name: 'A',
          created_at: new Date(),
          read_at: null,
        },
        {
          id: 'c2',
          status: 'contacted',
          student_display_name: 'B',
          created_at: new Date(),
          read_at: null,
        },
      ]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.needsAttention.pendingContactRequests).toBe(1);
  });

  it('passes through the weekly assessment compliance count unchanged (teacher+week, not teacher+week+batch)', async () => {
    const { service } = buildService({
      getWeeklyCompliance: jest.fn().mockResolvedValue({
        weekStartDate: TODAY,
        summary: {
          teachers: 3,
          completed: 1,
          pending: 0,
          overdue: 0,
          notScheduled: 2,
        },
        teachers: [],
      }),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.needsAttention.teachersWithoutWeeklyAssessment).toBe(2);
  });

  it('reports an all-caught-up state as every count being zero', async () => {
    const { service } = buildService({});

    const today = await service.getToday(OWNER_ID);

    expect(Object.values(today.needsAttention).every((v) => v === 0)).toBe(
      true,
    );
  });
});

describe('AcademyTodayService.getToday — Upcoming', () => {
  it('counts tomorrow classes/assessments/teacher leave independently of today', async () => {
    const { service } = buildService({
      tomorrowSessions: [
        baseSession({ id: 'ts1', status: 'scheduled' }),
        baseSession({ id: 'ts2', status: 'cancelled' }),
      ],
      tomorrowAssessments: [{ id: 'a1', status: 'scheduled' }],
      listAllForAcademy: jest.fn().mockResolvedValue([
        {
          id: 'leave-1',
          tutor_id: TUTOR_ID,
          status: 'approved',
          start_date: TOMORROW,
          end_date: TOMORROW,
          created_at: new Date(),
          tutor_display_name: 'Priya',
        },
      ]),
    });

    const today = await service.getToday(OWNER_ID);

    expect(today.upcoming.date).toBe(TOMORROW);
    expect(today.upcoming.classes).toBe(1);
    expect(today.upcoming.assessments).toBe(1);
    expect(today.upcoming.teacherLeave).toBe(1);
  });
});

describe('AcademyTodayService.getToday — academy isolation', () => {
  it('rejects a caller with no academy at all', async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });
    await expect(service.getToday(OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("only ever queries the academy's OWN records (by academy id) — never 'sessions of my active teachers', which would include their Individual classes", async () => {
    const listActiveForAcademy = jest.fn().mockResolvedValue([
      {
        membership_id: 'm1',
        tutor_id: TUTOR_ID,
        display_name: 'Priya',
        joined_at: new Date(),
      },
    ]);
    const { service, listForAcademyBetween, listForAcademyOnDate } =
      buildService({
        listActiveForAcademy,
      });

    await service.getToday(OWNER_ID);

    expect(listActiveForAcademy).toHaveBeenCalledWith(ACADEMY_ID);
    expect(listForAcademyBetween).toHaveBeenCalledWith(
      ACADEMY_ID,
      expect.any(Date),
      expect.any(Date),
    );
    expect(listForAcademyOnDate).toHaveBeenCalledWith(ACADEMY_ID, TODAY);
  });
});
