import { DateTime } from 'luxon';
import { expandRecurrence } from './recurrence';

/**
 * Blueprint §13: "DST regression tests even in one-timezone launch."
 * These assert on the *local wall-clock* time of each occurrence — the
 * thing a tutor and student actually experience — not on UTC offsets.
 */
describe('expandRecurrence', () => {
  const localTimeOf = (date: Date, zone: string) =>
    DateTime.fromJSDate(date).setZone(zone).toFormat('yyyy-MM-dd HH:mm');

  it('returns a single occurrence when there is no recurrence rule', () => {
    const result = expandRecurrence('2026-08-03T16:00', 'Asia/Kolkata', null);

    expect(result).toHaveLength(1);
    // IST is UTC+5:30, so 16:00 local is 10:30 UTC.
    expect(result[0].toISOString()).toBe('2026-08-03T10:30:00.000Z');
  });

  it('keeps the same local time across a spring-forward DST boundary', () => {
    // US DST starts 2026-03-08. A 16:00 class must stay 16:00 local.
    const result = expandRecurrence(
      '2026-03-02T16:00',
      'America/New_York',
      'FREQ=WEEKLY;BYDAY=MO',
      3,
    );

    expect(result.map((d) => localTimeOf(d, 'America/New_York'))).toEqual([
      '2026-03-02 16:00',
      '2026-03-09 16:00',
      '2026-03-16 16:00',
    ]);

    // The UTC instant *does* shift by an hour — that's the correct
    // behaviour, and exactly what naive date arithmetic gets wrong.
    expect(result[0].toISOString()).toBe('2026-03-02T21:00:00.000Z');
    expect(result[1].toISOString()).toBe('2026-03-09T20:00:00.000Z');
  });

  it('keeps the same local time across a fall-back DST boundary', () => {
    // US DST ends 2026-11-01.
    const result = expandRecurrence(
      '2026-10-26T09:30',
      'America/New_York',
      'FREQ=WEEKLY;BYDAY=MO',
      3,
    );

    expect(result.map((d) => localTimeOf(d, 'America/New_York'))).toEqual([
      '2026-10-26 09:30',
      '2026-11-02 09:30',
      '2026-11-09 09:30',
    ]);

    expect(result[0].toISOString()).toBe('2026-10-26T13:30:00.000Z');
    expect(result[1].toISOString()).toBe('2026-11-02T14:30:00.000Z');
  });

  it('expands a weekly rule in IST with a stable UTC offset (no DST in India)', () => {
    const result = expandRecurrence(
      '2026-08-03T16:00',
      'Asia/Kolkata',
      'FREQ=WEEKLY;BYDAY=MO,WE',
      4,
    );

    expect(result.map((d) => localTimeOf(d, 'Asia/Kolkata'))).toEqual([
      '2026-08-03 16:00',
      '2026-08-05 16:00',
      '2026-08-10 16:00',
      '2026-08-12 16:00',
    ]);
  });

  it('accepts a rule string with or without the RRULE: prefix', () => {
    const withPrefix = expandRecurrence(
      '2026-08-03T16:00',
      'Asia/Kolkata',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      2,
    );
    const withoutPrefix = expandRecurrence(
      '2026-08-03T16:00',
      'Asia/Kolkata',
      'FREQ=WEEKLY;BYDAY=MO',
      2,
    );

    expect(withPrefix).toEqual(withoutPrefix);
  });

  it('respects the requested occurrence count', () => {
    const result = expandRecurrence(
      '2026-08-03T16:00',
      'Asia/Kolkata',
      'FREQ=DAILY',
      5,
    );

    expect(result).toHaveLength(5);
  });

  it('rejects an invalid start time', () => {
    expect(() =>
      expandRecurrence('not-a-date', 'Asia/Kolkata', null),
    ).toThrow();
  });
});
