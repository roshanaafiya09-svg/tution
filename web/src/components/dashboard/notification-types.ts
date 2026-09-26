/** Notification types that describe a change to the class SCHEDULE (a class
 *  created, moved, cancelled, covered by a substitute, or about to start).
 *  Each portal sends these to its own calendar/schedule page — there is no
 *  per-class detail page that every recipient can open, so the calendar is
 *  the honest destination. Kept in one place so the four portals never
 *  disagree about which types are schedule events. */
export const SCHEDULE_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
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
]);

export function isScheduleNotification(type: string): boolean {
  return SCHEDULE_NOTIFICATION_TYPES.has(type);
}
