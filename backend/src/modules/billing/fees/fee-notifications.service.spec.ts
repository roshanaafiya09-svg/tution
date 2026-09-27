// The service imports these only for Nest DI tokens; stubbing them keeps the
// (ESM-only) kysely/database chain out of a pure unit test.
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../../parents/parent-links.repository', () => ({
  ParentLinksRepository: class {},
}));
jest.mock('../../scheduling/batches/batches.repository', () => ({
  BatchesRepository: class {},
}));
jest.mock('./fees.repository', () => ({ FeesRepository: class {} }));

import { FeeNotificationsService } from './fee-notifications.service';
import { feeNotificationTitle } from './fee-notification-messages';
import type {
  NotificationsService,
  NotifyInput,
} from '../../notifications/notifications.service';
import type { ParentLinksRepository } from '../../parents/parent-links.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { FeesRepository } from './fees.repository';

describe('feeNotificationTitle', () => {
  it('keeps the student wording unchanged', () => {
    expect(feeNotificationTitle('raised', 'student', 'Maths', 'Aisha')).toBe(
      'Fee due — Maths',
    );
    expect(feeNotificationTitle('partial', 'student', 'Maths', 'Aisha')).toBe(
      'Payment received — Maths',
    );
    expect(feeNotificationTitle('paid', 'student', 'Maths', 'Aisha')).toBe(
      'Fee paid — Maths',
    );
    expect(feeNotificationTitle('waived', 'student', 'Maths', 'Aisha')).toBe(
      'Fee waived — Maths',
    );
  });

  it('names the child for parents on every event', () => {
    expect(feeNotificationTitle('raised', 'parent', 'Maths', 'Aisha R')).toBe(
      'Fee due for Aisha R — Maths',
    );
    expect(feeNotificationTitle('partial', 'parent', 'Maths', 'Aisha R')).toBe(
      'Payment received for Aisha R — Maths',
    );
    expect(feeNotificationTitle('paid', 'parent', 'Maths', 'Aisha R')).toBe(
      'Fee paid for Aisha R — Maths',
    );
    expect(feeNotificationTitle('waived', 'parent', 'Maths', 'Aisha R')).toBe(
      'Fee waived for Aisha R — Maths',
    );
  });

  it('falls back to "your child" when the student has no profile name', () => {
    expect(feeNotificationTitle('raised', 'parent', 'Maths', null)).toBe(
      'Fee due for your child — Maths',
    );
  });
});

describe('FeeNotificationsService', () => {
  const entry = {
    id: 'fee1',
    student_id: 'stu1',
    tutor_id: 'tut1',
    batch_id: 'b1',
    period_label: '2026-09',
    expected_minor: 200000,
    recorded_paid_minor: 0,
    currency: 'INR',
    status: 'due',
  } as never;

  function build(parents: string[], name: string | null = 'Aisha Raman') {
    const notify = jest
      .fn<Promise<string[]>, [NotifyInput]>()
      .mockResolvedValue([]);
    const svc = new FeeNotificationsService(
      { notify } as unknown as NotificationsService,
      {
        listActiveParentIdsForStudents: jest.fn().mockResolvedValue(parents),
      } as unknown as ParentLinksRepository,
      {
        findById: jest.fn().mockResolvedValue({ title: 'Mathematics' }),
      } as unknown as BatchesRepository,
      {
        findStudentDisplayName: jest.fn().mockResolvedValue(name),
      } as unknown as FeesRepository,
    );
    return { svc, notify };
  }

  it('sends the student and parents separate copies under one dedupe key', async () => {
    const { svc, notify } = build(['par1', 'par2']);
    await svc.notifyRaised([entry]);
    expect(notify).toHaveBeenCalledTimes(2);
    const [studentCall, parentCall] = notify.mock.calls.map((c) => c[0]);
    expect(studentCall.userIds).toEqual(['stu1']);
    expect(studentCall.title).toBe('Fee due — Mathematics');
    expect(parentCall.userIds).toEqual(['par1', 'par2']);
    expect(parentCall.title).toBe('Fee due for Aisha Raman — Mathematics');
    expect(studentCall.dedupeKey).toBe('fee-raised:fee1');
    expect(parentCall.dedupeKey).toBe('fee-raised:fee1');
    expect(parentCall.payload?.studentId).toBe('stu1');
    expect(parentCall.payload?.feeLedgerId).toBe('fee1');
  });

  it('every recipient appears exactly once across the sends', async () => {
    const { svc, notify } = build(['par1']);
    await svc.notifyWaived({ ...(entry as object), status: 'waived' } as never);
    const all = notify.mock.calls.flatMap((c) => c[0].userIds);
    expect(all.sort()).toEqual(['par1', 'stu1']);
    expect(notify.mock.calls[1][0].title).toBe(
      'Fee waived for Aisha Raman — Mathematics',
    );
  });

  it('excludes the payer from the family recipients', async () => {
    const { svc, notify } = build(['par1', 'par2']);
    await svc.notifyPaymentRecorded(
      {
        ...(entry as object),
        recorded_paid_minor: 200000,
        status: 'paid',
      } as never,
      { source: 'teacher', payerId: 'par1' },
    );
    const parentCall = notify.mock.calls[1][0];
    expect(parentCall.userIds).toEqual(['par2']);
    expect(parentCall.title).toBe('Fee paid for Aisha Raman — Mathematics');
  });

  it('does not notify already-settled rows as newly raised', async () => {
    const { svc, notify } = build(['par1']);
    await svc.notifyRaised([{ ...(entry as object), status: 'paid' } as never]);
    expect(notify).not.toHaveBeenCalled();
  });
});
