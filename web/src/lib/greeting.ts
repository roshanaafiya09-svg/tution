export type DayPeriod = 'morning' | 'afternoon' | 'evening';

export const GREETING: Record<DayPeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

export function dayPeriod(now: Date = new Date()): DayPeriod {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function todayLabel(now: Date = new Date()): string {
  return now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
