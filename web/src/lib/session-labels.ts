import type { AcademyTodaySession, ClassCancellationReason, Session, SkippedHolidayOccurrence } from './types';

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

/** H6: the teacher-side coverage line for a class on /sessions/me.
 *  - the caller is covering it → "Covering for <original teacher>"
 *  - the caller owns it and someone covers it → "Covered by <substitute>"
 *  The substitute's own name is never shown as the person being covered. */
export function coverageLabel(
  session: Pick<Session, 'viewer_role' | 'original_tutor_display_name' | 'substitute_display_name'>,
): string | null {
  if (session.viewer_role === 'substitute') {
    return `Covering for ${session.original_tutor_display_name ?? 'another teacher'}`;
  }
  return session.substitute_display_name ? `Covered by ${session.substitute_display_name}` : null;
}

/** H6: a substitute may view the class and mark attendance only — the
 *  lifecycle actions (cancel, complete, reschedule, edit) stay with the
 *  class's own teacher (the API returns 403 for them). */
export function canManageSession(session: Pick<Session, 'viewer_role'>): boolean {
  return session.viewer_role !== 'substitute';
}

/** Toast copy for a new recurring series whose Academy-holiday occurrences
 *  were skipped by the server (null when nothing was skipped). */
export function skippedHolidayNote(skipped: SkippedHolidayOccurrence[]): string | null {
  if (skipped.length === 0) return null;
  const days = skipped
    .map((s) =>
      new Date(`${s.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    )
    .join(', ');
  const names = [...new Set(skipped.map((s) => s.holiday_name))].join(', ');
  return skipped.length === 1
    ? `No class was scheduled on ${days} — it's an Academy holiday (${names}).`
    : `${skipped.length} classes were not scheduled (${days}) — Academy holidays (${names}).`;
}
