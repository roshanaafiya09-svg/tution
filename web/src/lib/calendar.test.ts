import { describe, expect, it } from 'vitest';
import { dayKeyIn, daysBetween, holidayCoversDay, holidayDaysInRange, holidaysOnDay, localDateKey, timeIn } from './calendar';

describe('session day / time follow the session timezone, not the browser', () => {
  // 2026-09-28 22:30 UTC:
  //   Asia/Kolkata (UTC+5:30)  -> 29 Sep 04:00  (the NEXT day)
  //   Australia/Sydney (UTC+10) -> 29 Sep 08:30
  //   America/Los_Angeles (UTC-7) -> 28 Sep 15:30
  const instant = '2026-09-28T22:30:00.000Z';

  it('IST session: day and time are read in Asia/Kolkata', () => {
    expect(dayKeyIn(instant, 'Asia/Kolkata')).toBe('2026-09-29');
    expect(timeIn(instant, 'Asia/Kolkata').toLowerCase()).toBe('4:00 am');
  });

  it('non-IST session: the same instant lands on its own zone’s day/time', () => {
    expect(dayKeyIn(instant, 'America/Los_Angeles')).toBe('2026-09-28');
    expect(timeIn(instant, 'America/Los_Angeles').toLowerCase()).toBe('3:30 pm');
    expect(dayKeyIn(instant, 'Australia/Sydney')).toBe('2026-09-29');
  });

  it('a late-evening IST class stays on its IST day (browser zone is irrelevant)', () => {
    // 23:30 IST on the 28th == 18:00 UTC on the 28th.
    const lateIst = '2026-09-28T18:00:00.000Z';
    expect(dayKeyIn(lateIst, 'Asia/Kolkata')).toBe('2026-09-28');
    // ...but the very same instant is already the 29th in Sydney.
    expect(dayKeyIn(lateIst, 'Australia/Sydney')).toBe('2026-09-29');
  });
});

describe('grid date keys', () => {
  it('keys a cell by its own local y/m/d', () => {
    expect(localDateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('holiday day coverage', () => {
  const single = { start_date: '2026-09-28', end_date: '2026-09-28' };
  const multi = { start_date: '2026-10-01', end_date: '2026-10-03' };

  it('covers exactly the days in its inclusive range', () => {
    expect(holidayCoversDay(single, '2026-09-28')).toBe(true);
    expect(holidayCoversDay(single, '2026-09-27')).toBe(false);
    expect(holidayCoversDay(single, '2026-09-29')).toBe(false);
    expect(holidayCoversDay(multi, '2026-10-02')).toBe(true);
    expect(holidayCoversDay(multi, '2026-10-04')).toBe(false);
  });

  it('accepts full ISO timestamps from the API', () => {
    expect(holidayCoversDay({ start_date: '2026-09-28T00:00:00.000Z', end_date: '2026-09-28T00:00:00.000Z' }, '2026-09-28')).toBe(true);
  });

  it('daysBetween is inclusive and survives month ends', () => {
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(daysBetween('2026-10-02', '2026-09-29')).toEqual([]);
  });

  it('holidaysOnDay / holidayDaysInRange expand a multi-day holiday onto every day', () => {
    const list = [single, multi];
    expect(holidaysOnDay(list, '2026-10-02')).toEqual([multi]);
    const days = holidayDaysInRange(list, '2026-09-27', '2026-10-02');
    expect(days.map((d) => d.key)).toEqual(['2026-09-28', '2026-10-01', '2026-10-02']);
  });
});
