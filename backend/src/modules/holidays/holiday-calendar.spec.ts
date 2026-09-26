// holidays.repository imports database.module (real pg pool setup) — same
// workaround as the other service specs.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import {
  AcademyHolidayCalendar,
  holidayDateOf,
  holidayDayRangeUtc,
} from './holiday-calendar';
import type { HolidaysRepository } from './holidays.repository';

function holiday(start: string, end = start, name = 'Holiday') {
  return { id: `h-${start}`, name, start_date: start, end_date: end };
}

function build(rows: ReturnType<typeof holiday>[]) {
  const listEffectiveForAcademyBatch = jest.fn().mockResolvedValue(rows);
  const calendar = new AcademyHolidayCalendar({
    listEffectiveForAcademyBatch,
  } as unknown as HolidaysRepository);
  return { calendar, listEffectiveForAcademyBatch };
}

describe('holiday date helpers (Asia/Kolkata)', () => {
  it('a 00:15 IST class belongs to that IST date, not the previous UTC date', () => {
    // 2026-10-01 00:15 IST == 2026-09-30 18:45 UTC
    expect(holidayDateOf(new Date('2026-09-30T18:45:00Z'))).toBe('2026-10-01');
  });

  it('a 23:50 IST class stays on its own IST date', () => {
    // 2026-09-30 23:50 IST == 2026-09-30 18:20 UTC
    expect(holidayDateOf(new Date('2026-09-30T18:20:00Z'))).toBe('2026-09-30');
  });

  it('day range covers the whole IST days of the holiday (same range the cancel sweep uses)', () => {
    const { from, to } = holidayDayRangeUtc('2026-10-01', '2026-10-02');
    expect(from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(to.toISOString()).toBe('2026-10-02T18:29:59.999Z');
  });
});

describe('AcademyHolidayCalendar.holidaysFor', () => {
  it('never checks an Individual batch (academy_id null) — Academy holidays do not apply', async () => {
    const { calendar, listEffectiveForAcademyBatch } = build([
      holiday('2026-10-01'),
    ]);
    const result = await calendar.holidaysFor({ id: 'b', academy_id: null }, [
      new Date('2026-10-01T10:00:00Z'),
    ]);
    expect(result).toEqual([null]);
    expect(listEffectiveForAcademyBatch).not.toHaveBeenCalled();
  });

  it('looks up by the batch own academy and the IST date span of the occurrences', async () => {
    const { calendar, listEffectiveForAcademyBatch } = build([]);
    await calendar.holidaysFor({ id: 'batch-1', academy_id: 'academy-A' }, [
      new Date('2026-10-08T10:00:00Z'),
      new Date('2026-09-30T18:45:00Z'), // 2026-10-01 IST
    ]);
    expect(listEffectiveForAcademyBatch).toHaveBeenCalledWith(
      'academy-A',
      'batch-1',
      '2026-10-01',
      '2026-10-08',
    );
  });

  it('matches each occurrence against multi-day holidays by IST date', async () => {
    const h = holiday('2026-10-01', '2026-10-02', 'Puja');
    const { calendar } = build([h]);
    const result = await calendar.holidaysFor({ id: 'b', academy_id: 'a' }, [
      new Date('2026-09-30T18:20:00Z'), // 30 Sep 23:50 IST — not a holiday
      new Date('2026-09-30T18:45:00Z'), // 1 Oct 00:15 IST — holiday
      new Date('2026-10-02T12:00:00Z'), // 2 Oct 17:30 IST — holiday
      new Date('2026-10-02T18:40:00Z'), // 3 Oct 00:10 IST — not a holiday
    ]);
    expect(result).toEqual([null, h, h, null]);
  });
});
