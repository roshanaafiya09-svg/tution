import type { ViewerHoliday } from './types';

/**
 * Calendar date/time rules shared by the Teacher, Academy, Student and
 * Parent calendars.
 *
 * ONE RULE: a class is shown in the timezone it was scheduled in
 * (`class_sessions.timezone`, the zone the teacher picked). Its time label
 * and the calendar DAY it sits on are both read in that zone — never the
 * viewer's browser zone — so every dashboard agrees on the same date and
 * time for the same class, including for a class scheduled outside IST
 * (the browser zone would otherwise put an evening Sydney class on a
 * different day for a teacher in India than for the student). Notification
 * wording already follows this rule (see the backend's class-day-phrase).
 *
 * A calendar GRID cell is a plain calendar date (a "YYYY-MM-DD" key), not
 * an instant; `localDateKey` builds that key from a cell's own y/m/d, so a
 * grid never shifts a day when the browser zone changes.
 */

/** "YYYY-MM-DD" from a Date's own local y/m/d — how a grid cell is keyed. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in `timeZone`. */
export function dayKeyIn(utcIso: string, timeZone: string): string {
  return new Date(utcIso).toLocaleDateString('en-CA', { timeZone });
}

/** "5:00 pm" — the instant's wall-clock time in `timeZone`. */
export function timeIn(utcIso: string, timeZone: string): string {
  return new Date(utcIso).toLocaleTimeString('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The "YYYY-MM-DD" part of an API date ("2026-09-28" or a full ISO). */
export function apiDateKey(value: string): string {
  return value.slice(0, 10);
}

/** Every "YYYY-MM-DD" from `fromKey` to `toKey`, inclusive. Empty if the
 *  range is reversed. Pure string/UTC arithmetic, so DST and the browser
 *  zone can't skip or repeat a day. */
export function daysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromKey}T00:00:00Z`);
  const end = new Date(`${toKey}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** True when the holiday covers this calendar day (inclusive range). */
export function holidayCoversDay(holiday: Pick<ViewerHoliday, 'start_date' | 'end_date'>, dayKey: string): boolean {
  return apiDateKey(holiday.start_date) <= dayKey && dayKey <= apiDateKey(holiday.end_date);
}

export function holidaysOnDay<T extends Pick<ViewerHoliday, 'start_date' | 'end_date'>>(
  holidays: T[],
  dayKey: string,
): T[] {
  return holidays.filter((h) => holidayCoversDay(h, dayKey));
}

/** Every calendar day in [fromKey, toKey] that has a holiday, with the
 *  holidays on it — the shape the timeline-style Student schedule wants. */
export function holidayDaysInRange<T extends Pick<ViewerHoliday, 'start_date' | 'end_date'>>(
  holidays: T[],
  fromKey: string,
  toKey: string,
): { key: string; holidays: T[] }[] {
  const days: { key: string; holidays: T[] }[] = [];
  for (const key of daysBetween(fromKey, toKey)) {
    const onDay = holidaysOnDay(holidays, key);
    if (onDay.length > 0) days.push({ key, holidays: onDay });
  }
  return days;
}

/** Short source label for a holiday chip. */
export function holidaySource(holiday: Pick<ViewerHoliday, 'type' | 'academy_name'>): string {
  return holiday.type === 'government_holiday' ? 'Government holiday' : `${holiday.academy_name} holiday`;
}
