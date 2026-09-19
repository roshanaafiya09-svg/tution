import { academicWeekStart, isValidCalendarDate } from './academic-week.util';

describe('isValidCalendarDate', () => {
  it.each(['2026-09-19', '2028-02-29', '2026-12-31'])('accepts %s', (v) => {
    expect(isValidCalendarDate(v)).toBe(true);
  });

  it.each([
    '2026-13-45',
    '2026-02-30',
    '2027-02-29',
    '2026-9-19',
    'garbage',
    '',
    '2026-09-19T10:00:00Z',
  ])('rejects %j', (v) => {
    expect(isValidCalendarDate(v)).toBe(false);
  });
});

describe('academicWeekStart', () => {
  it('returns the Monday of the week for a date-only string', () => {
    expect(academicWeekStart('2026-09-14')).toBe('2026-09-14'); // Monday
    expect(academicWeekStart('2026-09-16')).toBe('2026-09-14'); // Wednesday
    expect(academicWeekStart('2026-09-20')).toBe('2026-09-14'); // Sunday
    expect(academicWeekStart('2026-09-21')).toBe('2026-09-21'); // next Monday
  });

  it('uses the Asia/Kolkata day, not the UTC day, for an instant near midnight', () => {
    // 2026-09-20 20:00 UTC is already Monday 2026-09-21 01:30 in Kolkata.
    expect(academicWeekStart(new Date('2026-09-20T20:00:00Z'))).toBe(
      '2026-09-21',
    );
    expect(academicWeekStart(new Date('2026-09-20T17:00:00Z'))).toBe(
      '2026-09-14',
    );
  });

  it('throws on an invalid date instead of returning "Invalid DateTime"', () => {
    expect(() => academicWeekStart('2026-13-45')).toThrow(RangeError);
    expect(() => academicWeekStart(new Date('nope'))).toThrow(RangeError);
  });
});
