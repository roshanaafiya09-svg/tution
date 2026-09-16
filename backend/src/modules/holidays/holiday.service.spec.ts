// See teacher-leave.service.spec.ts's identical comment — HolidayService
// also pulls in SessionsRepository transitively, which needs the same
// two workaround mocks.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { BadRequestException } from '@nestjs/common';
import { HolidayService } from './holiday.service';
import type { HolidaysRepository } from './holidays.repository';
import type { AcademiesRepository } from '../marketplace/academies/academies.repository';
import type { AcademyMembershipsRepository } from '../marketplace/academy-memberships/academy-memberships.repository';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import type { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import type {
  NotificationsService,
  NotifyInput,
} from '../notifications/notifications.service';

const ACADEMY_ID = 'academy-1';
const HOLIDAY = {
  id: 'holiday-1',
  type: 'academy_holiday' as const,
  name: 'Founders Day',
  start_date: '2026-09-20',
  end_date: '2026-09-20',
  scope: 'academy' as const,
  academy_id: ACADEMY_ID,
  country_code: 'IN',
  state_code: null,
};
const ACADEMY = {
  id: ACADEMY_ID,
  name: 'Test Academy',
  country_code: 'IN',
  state_code: 'TN',
  auto_observe_govt_holidays: false,
};
const SESSION = {
  id: 'session-1',
  batch_id: 'batch-1',
  tutor_id: 'tutor-1',
  status: 'scheduled' as const,
};

function buildService(overrides: {
  findById?: jest.Mock;
  listGovernment?: jest.Mock;
  listForAcademy?: jest.Mock;
  listBatchIdsForHoliday?: jest.Mock;
  createAcademyHoliday?: jest.Mock;
  setBatchScope?: jest.Mock;
  findAcademy?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  listScheduledForTutorsBetween?: jest.Mock;
  setHolidayOrLeaveCancellation?: jest.Mock;
  listDistinctStudentIdsForBatches?: jest.Mock;
  listDistinctTutorIdsForBatches?: jest.Mock;
  listDistinctStudentIdsForTutors?: jest.Mock;
  listActiveParentIdsForStudents?: jest.Mock;
  listRecentForUserByType?: jest.Mock;
  notify?: jest.Mock;
}) {
  const repository = {
    findById: overrides.findById ?? jest.fn().mockResolvedValue(HOLIDAY),
    listGovernment: overrides.listGovernment ?? jest.fn().mockResolvedValue([]),
    listForAcademy: overrides.listForAcademy ?? jest.fn().mockResolvedValue([]),
    listBatchIdsForHoliday:
      overrides.listBatchIdsForHoliday ?? jest.fn().mockResolvedValue([]),
    createAcademyHoliday:
      overrides.createAcademyHoliday ?? jest.fn().mockResolvedValue(HOLIDAY),
    setBatchScope:
      overrides.setBatchScope ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as HolidaysRepository;

  const academiesRepository = {
    findById: overrides.findAcademy ?? jest.fn().mockResolvedValue(ACADEMY),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest.fn().mockResolvedValue([{ tutor_id: 'tutor-1' }]),
  } as unknown as AcademyMembershipsRepository;

  const batchesRepository = {
    listDistinctStudentIdsForTutors:
      overrides.listDistinctStudentIdsForTutors ??
      jest.fn().mockResolvedValue(['student-academy-wide']),
    listDistinctStudentIdsForBatches:
      overrides.listDistinctStudentIdsForBatches ??
      jest.fn().mockResolvedValue(['student-batch-scoped']),
    listDistinctTutorIdsForBatches:
      overrides.listDistinctTutorIdsForBatches ??
      jest.fn().mockResolvedValue(['tutor-1']),
  } as unknown as BatchesRepository;

  const sessionsRepository = {
    listScheduledForTutorsBetween:
      overrides.listScheduledForTutorsBetween ??
      jest.fn().mockResolvedValue([SESSION]),
    setHolidayOrLeaveCancellation:
      overrides.setHolidayOrLeaveCancellation ??
      jest.fn().mockResolvedValue(undefined),
  } as unknown as SessionsRepository;

  const attendanceRepository = {
    listActiveParentIdsForStudents:
      overrides.listActiveParentIdsForStudents ??
      jest.fn().mockResolvedValue([]),
  } as unknown as AttendanceRepository;

  const listRecentForUserByType =
    overrides.listRecentForUserByType ?? jest.fn().mockResolvedValue([]);
  const notify = overrides.notify ?? jest.fn().mockResolvedValue(undefined);
  const notificationsService = {
    listRecentForUserByType,
    notify,
  } as unknown as NotificationsService;

  const service = new HolidayService(
    repository,
    academiesRepository,
    academyMembershipsRepository,
    batchesRepository,
    sessionsRepository,
    attendanceRepository,
    notificationsService,
  );

  return {
    service,
    repository,
    academiesRepository,
    batchesRepository,
    sessionsRepository,
    notify,
    listRecentForUserByType,
  };
}

describe('HolidayService.listEffectiveForAcademy', () => {
  it('never queries government holidays when the academy has not opted in', async () => {
    const listGovernment = jest.fn().mockResolvedValue([{ id: 'gov-1' }]);
    const findAcademy = jest
      .fn()
      .mockResolvedValue({ ...ACADEMY, auto_observe_govt_holidays: false });
    const { service } = buildService({ listGovernment, findAcademy });

    const result = await service.listEffectiveForAcademy(
      ACADEMY_ID,
      '2026-01-01',
      '2026-12-31',
    );

    expect(listGovernment).not.toHaveBeenCalled();
    expect(result.governmentHolidays).toEqual([]);
  });

  it('includes government holidays once the academy opts in', async () => {
    const listGovernment = jest.fn().mockResolvedValue([{ id: 'gov-1' }]);
    const findAcademy = jest
      .fn()
      .mockResolvedValue({ ...ACADEMY, auto_observe_govt_holidays: true });
    const { service } = buildService({ listGovernment, findAcademy });

    const result = await service.listEffectiveForAcademy(
      ACADEMY_ID,
      '2026-01-01',
      '2026-12-31',
    );

    expect(listGovernment).toHaveBeenCalledWith(
      'IN',
      'TN',
      '2026-01-01',
      '2026-12-31',
    );
    expect(result.governmentHolidays).toEqual([{ id: 'gov-1' }]);
  });
});

describe('HolidayService.createAcademyHoliday', () => {
  it('requires at least one batch when scope is "batches"', async () => {
    const { service } = buildService({});

    await expect(
      service.createAcademyHoliday(
        ACADEMY_ID,
        { name: 'Batch Holiday', startDate: '2026-09-20', scope: 'batches' },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('HolidayService.applyHolidayForAcademy', () => {
  it('cancels matching sessions and notifies the resolved recipients', async () => {
    const setHolidayOrLeaveCancellation = jest
      .fn()
      .mockResolvedValue(undefined);
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const { service } = buildService({ setHolidayOrLeaveCancellation, notify });

    await service.applyHolidayForAcademy(HOLIDAY.id, ACADEMY_ID);

    expect(setHolidayOrLeaveCancellation).toHaveBeenCalledWith(
      SESSION.id,
      'academy_holiday',
      expect.objectContaining({ holidayId: HOLIDAY.id }),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].userIds).toEqual(
      expect.arrayContaining(['student-academy-wide', 'tutor-1']),
    );
  });

  it('scope="batches" only resolves that batch\'s students/teachers, never the whole academy', async () => {
    const listDistinctStudentIdsForTutors = jest
      .fn()
      .mockResolvedValue(['student-academy-wide']);
    const listDistinctStudentIdsForBatches = jest
      .fn()
      .mockResolvedValue(['student-batch-scoped']);
    const listBatchIdsForHoliday = jest.fn().mockResolvedValue(['batch-1']);
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const batchScopedHoliday = { ...HOLIDAY, scope: 'batches' as const };
    const findById = jest.fn().mockResolvedValue(batchScopedHoliday);

    const { service } = buildService({
      findById,
      listBatchIdsForHoliday,
      listDistinctStudentIdsForTutors,
      listDistinctStudentIdsForBatches,
      notify,
    });

    await service.applyHolidayForAcademy(HOLIDAY.id, ACADEMY_ID);

    expect(listDistinctStudentIdsForTutors).not.toHaveBeenCalled();
    expect(notify.mock.calls[0][0].userIds).toContain('student-batch-scoped');
    expect(notify.mock.calls[0][0].userIds).not.toContain(
      'student-academy-wide',
    );
  });

  it('is idempotent — a re-run never re-notifies a user already notified for this exact holiday', async () => {
    const alreadyNotified = [
      { payload: { holidayId: HOLIDAY.id, academyId: ACADEMY_ID } },
    ];
    const listRecentForUserByType = jest
      .fn()
      .mockResolvedValue(alreadyNotified);
    const notify = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ listRecentForUserByType, notify });

    await service.applyHolidayForAcademy(HOLIDAY.id, ACADEMY_ID);

    expect(notify).not.toHaveBeenCalled();
  });
});
