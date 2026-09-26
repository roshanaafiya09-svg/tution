import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/lib/types';
import { teacherNotificationHref } from './teacher-nav';
import { studentNotificationHref } from './student-nav';
import { parentNotificationHref } from './parent-nav';
import { academyNotificationHref } from './academy-nav';

const n = (type: string, payload: Record<string, unknown> = {}): AppNotification => ({
  id: '1',
  type,
  payload: { title: 't', body: 'b', ...payload },
  read_at: null,
  created_at: new Date().toISOString(),
});

describe('notification click destinations', () => {
  const scheduleTypes = [
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'class_reminder',
    'class_cancelled_reminder',
    'holiday_class_reminder',
    'class_substitute_assigned',
    'class_cancelled_by_academy',
    'class_rescheduled_by_academy',
    'academy_holiday',
    'government_holiday',
  ];

  it.each(scheduleTypes)('%s opens each portal’s own schedule page', (type) => {
    expect(teacherNotificationHref(n(type))).toBe('/dashboard/calendar');
    expect(studentNotificationHref(n(type))).toBe('/student/schedule');
    expect(parentNotificationHref(n(type))).toBe('/parent/calendar');
  });

  it('assessment notifications keep their existing destinations', () => {
    expect(studentNotificationHref(n('assessment_published', { assessmentId: 'a1' }))).toBe('/student/assessments/a1');
    expect(teacherNotificationHref(n('assessment_completed', { assessmentId: 'a1', mode: 'online' }))).toBe(
      '/dashboard/assessments/online/a1',
    );
  });

  it('fee events go to the child page for a parent (needs the studentId) and to Fees for the teacher', () => {
    expect(parentNotificationHref(n('fee_raised', { studentId: 's1' }))).toBe('/parent/child/s1');
    expect(parentNotificationHref(n('fee_waived', {}))).toBeNull();
    expect(teacherNotificationHref(n('fee_payment_recorded'))).toBe('/dashboard/fees');
  });

  it('verification outcomes open the verification page for teacher and academy', () => {
    expect(teacherNotificationHref(n('verification_approved'))).toBe('/dashboard/verification');
    expect(teacherNotificationHref(n('verification_rejected'))).toBe('/dashboard/verification');
    expect(academyNotificationHref(n('academy_verification_approved'))).toBe('/academy/verification');
    expect(academyNotificationHref(n('academy_verification_rejected'))).toBe('/academy/verification');
  });

  it('types with no sensible destination stay text-only (null), not a wrong link', () => {
    expect(studentNotificationHref(n('fee_raised', { studentId: 's1' }))).toBeNull();
    expect(studentNotificationHref(n('new_message'))).toBeNull();
    expect(parentNotificationHref(n('announcement', { batchId: 'b1', audience: 'parent' }))).toBeNull();
    expect(teacherNotificationHref(n('something_unknown'))).toBeNull();
  });
});
