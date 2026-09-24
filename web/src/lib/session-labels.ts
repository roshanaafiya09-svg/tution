import type { AcademyTodaySession, ClassCancellationReason } from './types';

/** Just the fields cancellationBadgeLabel/cancellationReasonLabel actually
 *  read — lets callers pass any session-shaped row (AcademyTodaySession,
 *  AcademyAttendanceRow, ...) without an unsafe cast. */
export interface CancellableSession {
  status: string;
  cancellationReason?: ClassCancellationReason | null;
}

/** Shared across Today/Timetable/Calendar — see this feature's plan doc for
 *  why it was extracted once a third page needed the exact same labeling. */
export function isToday(session: AcademyTodaySession): boolean {
  return new Date(session.scheduledStartUtc).toDateString() === new Date().toDateString();
}

/** Holiday & Teacher Leave feature — names *why* a class is cancelled
 *  rather than just showing "cancelled". */
export function cancellationBadgeLabel(session: CancellableSession): string | null {
  if (session.status !== 'cancelled') return null;
  switch (session.cancellationReason) {
    case 'government_holiday':
    case 'academy_holiday':
      return 'holiday';
    case 'teacher_leave':
      return 'leave';
    case 'batch_archived':
      return 'archived';
    default:
      return null;
  }
}

/** Human label for a cancellation reason — used where the badge's short
 *  form ("holiday") isn't specific enough (e.g. Calendar list items).
 *  'teacher_manual'/'academy_manual' (H4) say WHO cancelled it, replacing
 *  the old undifferentiated 'manual' value — still handled below for a
 *  pre-existing row cancelled before that split shipped. */
export function cancellationReasonLabel(session: CancellableSession): string | null {
  switch (session.cancellationReason) {
    case 'government_holiday':
      return 'Government Holiday';
    case 'academy_holiday':
      return 'Academy Holiday';
    case 'teacher_leave':
      return 'Teacher Leave';
    case 'teacher_manual':
      return 'Cancelled by Teacher';
    case 'academy_manual':
      return 'Cancelled by Academy';
    case 'batch_archived':
      return 'Batch Archived';
    case 'manual':
      return 'Cancelled';
    default:
      return session.status === 'cancelled' ? 'Cancelled' : null;
  }
}

export function sessionTime(session: AcademyTodaySession): string {
  return new Date(session.scheduledStartUtc).toLocaleTimeString('en-IN', {
    timeZone: session.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function sessionDateTime(session: AcademyTodaySession): string {
  return new Date(session.scheduledStartUtc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
