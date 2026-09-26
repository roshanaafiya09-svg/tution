// Same workaround as sessions.service.spec.ts — SessionsRepository pulls in
// the real database module, which this Jest config can't transform.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import {
  CLASS_RESCHEDULED_BY_ACADEMY_TYPE,
  CLASS_RESCHEDULED_TYPE,
  SessionNotificationsService,
} from './session-notifications.service';
import type { SessionsRepository } from './sessions.repository';
import type { BatchesRepository } from '../batches/batches.repository';
import type { AttendanceRepository } from '../attendance/attendance.repository';
import type { NotificationsService } from '../../notifications/notifications.service';

const ACADEMY_ID = 'academy-1';
const BEFORE_UPDATED_AT = new Date('2030-06-01T00:00:00Z');

const before = {
  id: 'session-1',
  batch_id: 'batch-1',
  scheduled_start_utc: new Date('2030-06-17T11:30:00Z'), // 5:00 PM IST
  timezone: 'Asia/Kolkata',
  duration_min: 60,
  updated_at: BEFORE_UPDATED_AT,
};
const after = {
  ...before,
  scheduled_start_utc: new Date('2030-06-17T12:30:00Z'), // 6:00 PM IST
  tutor_id: 'teacher-1',
  substitute_tutor_id: null as string | null,
};

function build(
  opts: {
    context?: { academy_id: string | null; academy_name: string | null } | null;
    activeTeachers?: string[];
  } = {},
) {
  const context =
    opts.context === undefined
      ? {
          batch_title: 'Mathematics',
          academy_id: ACADEMY_ID,
          academy_name: 'Academy A',
          tutor_display_name: 'Asha Raman',
        }
      : opts.context && { batch_title: 'Mathematics', ...opts.context };

  const sessionsRepository = {
    findCreationNoticeContext: jest.fn().mockResolvedValue(context),
    filterActiveAcademyTeachers: jest
      .fn()
      .mockImplementation((_academyId: string, ids: string[]) =>
        Promise.resolve(opts.activeTeachers ?? ids),
      ),
  };
  const batchesRepository = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'batch-1', title: 'Mathematics' }),
    listDistinctStudentIdsForBatches: jest
      .fn()
      .mockResolvedValue(['student-1']),
  };
  const attendanceRepository = {
    listActiveParentIdsForStudents: jest.fn().mockResolvedValue(['parent-1']),
  };
  const notify = jest.fn().mockResolvedValue([]);

  const service = new SessionNotificationsService(
    sessionsRepository as unknown as SessionsRepository,
    batchesRepository as unknown as BatchesRepository,
    attendanceRepository as unknown as AttendanceRepository,
    { notify } as unknown as NotificationsService,
  );
  return { service, notify, sessionsRepository, batchesRepository };
}

interface Sent {
  type: string;
  userIds: string[];
  body: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}
const sentOf = (notify: jest.Mock): Sent[] =>
  (notify.mock.calls as unknown[][]).map((c) => c[0] as Sent);
const teacherCalls = (notify: jest.Mock) =>
  sentOf(notify).filter((n) => n.type === CLASS_RESCHEDULED_BY_ACADEMY_TYPE);

describe('SessionNotificationsService.notifyRescheduled — teacher notice', () => {
  it('academy actor: notifies the class teacher AND still the students/parents', async () => {
    const { service, notify } = build();

    await service.notifyRescheduled(before, after, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });

    const roster = sentOf(notify).filter(
      (n) => n.type === CLASS_RESCHEDULED_TYPE,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].userIds.sort()).toEqual(['parent-1', 'student-1']);

    const teacher = teacherCalls(notify);
    expect(teacher).toHaveLength(1);
    expect(teacher[0].userIds).toEqual(['teacher-1']);
  });

  it('names the class, the academy, the old and the new time (Scholar format)', async () => {
    const { service, notify } = build();
    await service.notifyRescheduled(before, after, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });

    const [n] = teacherCalls(notify);
    expect(n.body).toBe(
      'Your Mathematics class has been rescheduled by Academy A from Mon 17 Jun, 5:00 PM to Mon 17 Jun, 6:00 PM (60 min).',
    );
    expect(n.payload).toMatchObject({
      sessionId: 'session-1',
      batchId: 'batch-1',
      academyId: ACADEMY_ID,
      previousStartUtc: '2030-06-17T11:30:00.000Z',
      newStartUtc: '2030-06-17T12:30:00.000Z',
    });
  });

  it('dedupe key is the session + its pre-change version, so a later reschedule is a new event', async () => {
    const { service, notify } = build();
    await service.notifyRescheduled(before, after, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });
    await service.notifyRescheduled(
      { ...before, updated_at: new Date('2030-06-02T00:00:00Z') },
      after,
      { kind: 'academy', academyId: ACADEMY_ID },
    );

    const [first, second] = teacherCalls(notify);
    expect(first.dedupeKey).toBe(
      `rescheduled:session-1:${BEFORE_UPDATED_AT.getTime()}`,
    );
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
  });

  it('teacher actor: no teacher notice (roster notice unchanged)', async () => {
    const { service, notify, sessionsRepository } = build();
    await service.notifyRescheduled(before, after, { kind: 'teacher' });
    await service.notifyRescheduled(before, after); // default actor

    expect(teacherCalls(notify)).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(
      sessionsRepository.filterActiveAcademyTeachers,
    ).not.toHaveBeenCalled();
  });

  it('never notifies when the batch is not owned by the acting academy (Individual / other academy)', async () => {
    for (const context of [
      { academy_id: null, academy_name: null }, // Individual class
      { academy_id: 'academy-B', academy_name: 'Academy B' },
    ]) {
      const { service, notify, sessionsRepository } = build({ context });
      await service.notifyRescheduled(before, after, {
        kind: 'academy',
        academyId: ACADEMY_ID,
      });
      expect(teacherCalls(notify)).toHaveLength(0);
      expect(
        sessionsRepository.filterActiveAcademyTeachers,
      ).not.toHaveBeenCalled();
    }
  });

  it('notifies the assigned substitute too, and only active academy members', async () => {
    const withSub = { ...after, substitute_tutor_id: 'teacher-2' };

    const both = build();
    await both.service.notifyRescheduled(before, withSub, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });
    expect(teacherCalls(both.notify)[0].userIds.sort()).toEqual([
      'teacher-1',
      'teacher-2',
    ]);

    // teacher-1 has since left the academy: only the substitute is told.
    const left = build({ activeTeachers: ['teacher-2'] });
    await left.service.notifyRescheduled(before, withSub, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });
    expect(teacherCalls(left.notify)[0].userIds).toEqual(['teacher-2']);
    expect(
      left.sessionsRepository.filterActiveAcademyTeachers,
    ).toHaveBeenCalledWith(ACADEMY_ID, ['teacher-1', 'teacher-2']);
  });

  it('sends nothing to the teacher when no candidate is an active member', async () => {
    const { service, notify } = build({ activeTeachers: [] });
    await service.notifyRescheduled(before, after, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });
    expect(teacherCalls(notify)).toHaveLength(0);
  });

  it('a failing teacher notice does not throw or suppress the roster notice', async () => {
    const { service, notify } = build();
    notify.mockImplementation((n: { type: string }) =>
      n.type === CLASS_RESCHEDULED_BY_ACADEMY_TYPE
        ? Promise.reject(new Error('push down'))
        : Promise.resolve([]),
    );

    await expect(
      service.notifyRescheduled(before, after, {
        kind: 'academy',
        academyId: ACADEMY_ID,
      }),
    ).resolves.toBeUndefined();
    expect(sentOf(notify).some((n) => n.type === CLASS_RESCHEDULED_TYPE)).toBe(
      true,
    );
  });

  it('a failing roster notice does not suppress the teacher notice', async () => {
    const { service, notify } = build();
    notify.mockImplementation((n: { type: string }) =>
      n.type === CLASS_RESCHEDULED_TYPE
        ? Promise.reject(new Error('push down'))
        : Promise.resolve([]),
    );

    await service.notifyRescheduled(before, after, {
      kind: 'academy',
      academyId: ACADEMY_ID,
    });
    expect(teacherCalls(notify)).toHaveLength(1);
  });
});
