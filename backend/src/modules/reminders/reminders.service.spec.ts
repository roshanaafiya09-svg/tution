// Same workaround as teacher-leave.service.spec.ts / holiday.service.spec.ts.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));
// @nestjs/schedule ships pure ESM (`export * from ...`), which this
// project's ts-jest config doesn't transform (node_modules is ignored by
// default, same as the Kysely/pg ESM issue above) — @Cron is a plain
// method decorator that does nothing at construction time, so a no-op
// stub is all this test needs.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_MINUTE: '* * * * *',
    EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
  },
}));

import { RemindersService } from './reminders.service';
import type { SessionsRepository } from '../scheduling/sessions/sessions.repository';
import type { BatchesRepository } from '../scheduling/batches/batches.repository';
import type { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import type {
  NotificationsService,
  NotifyInput,
} from '../notifications/notifications.service';
import type { HolidayService } from '../holidays/holiday.service';
import type { HolidaysRepository } from '../holidays/holidays.repository';

const NORMAL_SESSION = {
  id: 'session-normal',
  batch_id: 'batch-1',
  batch_title: 'Grade 10 Physics',
  substitute_display_name: null,
};
const SUBSTITUTE_SESSION = {
  id: 'session-substitute',
  batch_id: 'batch-2',
  batch_title: 'Grade 12 Chemistry',
  substitute_display_name: 'Priya',
};

const SCHEDULED_START = new Date('2026-09-20T10:30:00.000Z');

const LEAVE_CANCELLED_SESSION = {
  id: 'session-leave-cancelled',
  batch_id: 'batch-3',
  batch_title: 'Grade 9 Maths',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'teacher_leave' as const,
  holiday_id: null,
  teacher_leave_request_id: 'leave-1',
};
const MANUAL_CANCELLED_SESSION = {
  id: 'session-manual-cancelled',
  batch_id: 'batch-4',
  batch_title: 'Grade 11 Biology',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'manual' as const, // legacy, predates the H4 reason split
  holiday_id: null,
  teacher_leave_request_id: null,
};
// H4: cancellation_reason now says WHO cancelled — these two replace the
// single 'manual' value going forward (see MANUAL_CANCELLED_SESSION above
// for what a pre-existing legacy row still looks like).
const TEACHER_MANUAL_CANCELLED_SESSION = {
  id: 'session-teacher-manual-cancelled',
  batch_id: 'batch-7',
  batch_title: 'Grade 8 English',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'teacher_manual' as const,
  holiday_id: null,
  teacher_leave_request_id: null,
};
const ACADEMY_MANUAL_CANCELLED_SESSION = {
  id: 'session-academy-manual-cancelled',
  batch_id: 'batch-8',
  batch_title: 'Grade 7 History',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'academy_manual' as const,
  holiday_id: null,
  teacher_leave_request_id: null,
};
const BATCH_ARCHIVED_CANCELLED_SESSION = {
  id: 'session-batch-archived-cancelled',
  batch_id: 'batch-9',
  batch_title: 'Grade 6 Geography',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'batch_archived' as const,
  holiday_id: null,
  teacher_leave_request_id: null,
};
const HOLIDAY_CANCELLED_SESSION_A = {
  id: 'session-holiday-a',
  batch_id: 'batch-5',
  batch_title: 'Grade 10 Physics',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'government_holiday' as const,
  holiday_id: 'holiday-1',
  teacher_leave_request_id: null,
};
const HOLIDAY_CANCELLED_SESSION_B = {
  id: 'session-holiday-b',
  batch_id: 'batch-6',
  batch_title: 'Grade 12 Chemistry',
  scheduled_start_utc: SCHEDULED_START,
  timezone: 'Asia/Kolkata',
  cancellation_reason: 'government_holiday' as const,
  holiday_id: 'holiday-1',
  teacher_leave_request_id: null,
};

function buildService(overrides: {
  listScheduledRemindersBetween?: jest.Mock;
  listCancelledRemindersBetween?: jest.Mock;
  listDistinctStudentIdsForBatches?: jest.Mock;
  listActiveParentIdsForStudents?: jest.Mock;
  listRecentForUserByType?: jest.Mock;
  notify?: jest.Mock;
  applyGovernmentHolidaysForToday?: jest.Mock;
  findHolidayById?: jest.Mock;
}) {
  const sessionsRepository = {
    listScheduledRemindersBetween:
      overrides.listScheduledRemindersBetween ??
      jest.fn().mockResolvedValue([NORMAL_SESSION]),
    listCancelledRemindersBetween:
      overrides.listCancelledRemindersBetween ??
      jest.fn().mockResolvedValue([]),
  } as unknown as SessionsRepository;

  const batchesRepository = {
    listDistinctStudentIdsForBatches:
      overrides.listDistinctStudentIdsForBatches ??
      jest
        .fn()
        .mockImplementation((batchIds: string[]) =>
          Promise.resolve([`student-${batchIds[0]}`]),
        ),
  } as unknown as BatchesRepository;

  const attendanceRepository = {
    listActiveParentIdsForStudents:
      overrides.listActiveParentIdsForStudents ??
      jest
        .fn()
        .mockImplementation((studentIds: string[]) =>
          Promise.resolve([`parent-${studentIds[0]}`]),
        ),
  } as unknown as AttendanceRepository;

  const listRecentForUserByType =
    overrides.listRecentForUserByType ?? jest.fn().mockResolvedValue([]);
  const notify =
    overrides.notify ??
    jest.fn<Promise<void>, [NotifyInput]>().mockResolvedValue(undefined);
  const notificationsService = {
    listRecentForUserByType,
    notify,
  } as unknown as NotificationsService;

  const holidayService = {
    applyGovernmentHolidaysForToday:
      overrides.applyGovernmentHolidaysForToday ??
      jest.fn().mockResolvedValue(undefined),
  } as unknown as HolidayService;

  const holidaysRepository = {
    findById:
      overrides.findHolidayById ??
      jest.fn().mockResolvedValue({ id: 'holiday-1', name: 'Pongal' }),
  } as unknown as HolidaysRepository;

  const service = new RemindersService(
    sessionsRepository,
    batchesRepository,
    attendanceRepository,
    notificationsService,
    holidayService,
    holidaysRepository,
  );

  return { service, sessionsRepository, notify, listRecentForUserByType };
}

describe('RemindersService.sendUpcomingClassReminders — normal reminder', () => {
  it('sends the normal reminder for a plain scheduled class', async () => {
    const { service, notify } = buildService({});

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_reminder',
        body: 'Your Grade 10 Physics class starts in 10 minutes.',
        payload: { sessionId: NORMAL_SESSION.id },
      }),
    );
  });

  it('mentions the substitute teacher for a substitute-covered class', async () => {
    const listScheduledRemindersBetween = jest
      .fn()
      .mockResolvedValue([SUBSTITUTE_SESSION]);
    const { service, notify } = buildService({ listScheduledRemindersBetween });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Your Grade 12 Chemistry class starts in 10 minutes (conducted by Priya).',
      }),
    );
  });

  it('sends nothing when there is nothing scheduled or cancelled in the window', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const { service, notify } = buildService({ listScheduledRemindersBetween });

    await service.sendUpcomingClassReminders();

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not send a duplicate normal reminder for a session already reminded', async () => {
    const listRecentForUserByType = jest
      .fn()
      .mockResolvedValue([{ payload: { sessionId: NORMAL_SESSION.id } }]);
    const { service, notify } = buildService({ listRecentForUserByType });

    await service.sendUpcomingClassReminders();

    expect(notify).not.toHaveBeenCalled();
  });
});

describe('RemindersService — cancelled-class reminder (teacher leave / manual)', () => {
  it('sends a distinct cancellation reminder for a teacher-leave-cancelled class, not the normal one', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([LEAVE_CANCELLED_SESSION]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_cancelled_reminder',
        title: '🔔 Class Cancelled',
        body: 'Your Grade 9 Maths class at 4:00 PM today has been cancelled because your teacher is on approved leave.',
        payload: {
          sessionId: LEAVE_CANCELLED_SESSION.id,
          reason: 'teacher_leave',
        },
      }),
    );
  });

  // H4 regression: every manual cancel used to be tagged the same
  // 'manual' reason, so this always said "cancelled by the academy" —
  // wrong for a teacher's own cancel, and nonsensical for a private
  // Individual class with no academy involved at all.
  it('attributes a teacher cancel to the teacher, not the academy', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([TEACHER_MANUAL_CANCELLED_SESSION]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_cancelled_reminder',
        body: 'Your Grade 8 English class at 4:00 PM today has been cancelled by your teacher.',
      }),
    );
  });

  it('attributes an academy cancel to the academy', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([ACADEMY_MANUAL_CANCELLED_SESSION]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_cancelled_reminder',
        body: 'Your Grade 7 History class at 4:00 PM today has been cancelled by the academy.',
      }),
    );
  });

  it('gives a batch-archived cancel its own copy, not the generic academy wording', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([BATCH_ARCHIVED_CANCELLED_SESSION]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_cancelled_reminder',
        body: 'Your Grade 6 Geography class at 4:00 PM today has been cancelled — this batch is no longer active.',
      }),
    );
  });

  it('falls back to a neutral, actor-free message for a legacy pre-split "manual" row', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([MANUAL_CANCELLED_SESSION]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'class_cancelled_reminder',
        body: 'Your Grade 11 Biology class at 4:00 PM today has been cancelled.',
      }),
    );
  });

  it('does not re-send a cancellation reminder already sent for that session', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([LEAVE_CANCELLED_SESSION]);
    const listRecentForUserByType = jest
      .fn()
      .mockResolvedValue([
        { payload: { sessionId: LEAVE_CANCELLED_SESSION.id } },
      ]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
      listRecentForUserByType,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).not.toHaveBeenCalled();
  });
});

describe('RemindersService — holiday reminder (government / academy holiday)', () => {
  it('sends a holiday reminder naming the holiday for a single affected class', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([HOLIDAY_CANCELLED_SESSION_A]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'holiday_class_reminder',
        title: '🇮🇳 Holiday Reminder',
        body: 'There is no Grade 10 Physics class at 4:00 PM today because today is Pongal, a government holiday.',
        payload: { sessionIds: [HOLIDAY_CANCELLED_SESSION_A.id] },
      }),
    );
  });

  it('groups a recipient with two classes cancelled by the same holiday into one notification, not two', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([
        HOLIDAY_CANCELLED_SESSION_A,
        HOLIDAY_CANCELLED_SESSION_B,
      ]);
    // Same recipient for both batches this time — the whole point of the test.
    const listDistinctStudentIdsForBatches = jest
      .fn()
      .mockResolvedValue(['student-shared']);
    const listActiveParentIdsForStudents = jest.fn().mockResolvedValue([]);
    const notify = jest
      .fn<Promise<void>, [NotifyInput]>()
      .mockResolvedValue(undefined);
    const { service } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
      listDistinctStudentIdsForBatches,
      listActiveParentIdsForStudents,
      notify,
    });

    await service.sendUpcomingClassReminders();

    const holidayCalls = notify.mock.calls.filter(
      (call) => call[0].type === 'holiday_class_reminder',
    );
    expect(holidayCalls).toHaveLength(1);
    expect(holidayCalls[0][0].userIds).toEqual(['student-shared']);
    expect(holidayCalls[0][0].payload).toEqual({
      sessionIds: [
        HOLIDAY_CANCELLED_SESSION_A.id,
        HOLIDAY_CANCELLED_SESSION_B.id,
      ],
    });
  });

  it('does not re-send a holiday reminder for sessions already covered by a prior notification', async () => {
    const listScheduledRemindersBetween = jest.fn().mockResolvedValue([]);
    const listCancelledRemindersBetween = jest
      .fn()
      .mockResolvedValue([HOLIDAY_CANCELLED_SESSION_A]);
    const listRecentForUserByType = jest
      .fn()
      .mockResolvedValue([
        { payload: { sessionIds: [HOLIDAY_CANCELLED_SESSION_A.id] } },
      ]);
    const { service, notify } = buildService({
      listScheduledRemindersBetween,
      listCancelledRemindersBetween,
      listRecentForUserByType,
    });

    await service.sendUpcomingClassReminders();

    expect(notify).not.toHaveBeenCalled();
  });
});
