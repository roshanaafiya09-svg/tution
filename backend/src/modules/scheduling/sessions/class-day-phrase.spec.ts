import { classSubject, classWhen } from './class-day-phrase';

// "Now" = Sat 26 Sep 2026, 11:00 IST (05:30 UTC).
const NOW = new Date('2026-09-26T05:30:00Z');
const IST = 'Asia/Kolkata';

describe('classSubject / classWhen', () => {
  it('same local day → "Today\'s"', () => {
    expect(
      classSubject('Mathematics', new Date('2026-09-26T11:30:00Z'), IST, NOW),
    ).toBe("Today's Mathematics class at 5:00 PM");
  });

  it('next local day → "Tomorrow\'s"', () => {
    expect(
      classSubject('Mathematics', new Date('2026-09-27T11:30:00Z'), IST, NOW),
    ).toBe("Tomorrow's Mathematics class at 5:00 PM");
  });

  it('any later day → an explicit weekday and date, never "Today\'s"', () => {
    expect(
      classSubject('Mathematics', new Date('2026-09-28T11:30:00Z'), IST, NOW),
    ).toBe('Your Mathematics class on Monday, 28 September at 5:00 PM');
  });

  it('a class in the past uses its explicit date', () => {
    expect(
      classSubject('Mathematics', new Date('2026-09-20T11:30:00Z'), IST, NOW),
    ).toBe('Your Mathematics class on Sunday, 20 September at 5:00 PM');
  });

  it("is computed in the class's timezone, not UTC", () => {
    // 02:00 IST on the 27th is still 20:30 UTC on the 26th: in UTC it looks
    // like "today", in the class's own zone it is tomorrow.
    const start = new Date('2026-09-26T20:30:00Z');
    expect(classSubject('Maths', start, IST, NOW)).toBe(
      "Tomorrow's Maths class at 2:00 AM",
    );
    expect(classSubject('Maths', start, 'UTC', NOW)).toBe(
      "Today's Maths class at 8:30 PM",
    );
  });

  it('"now" is also read in the class timezone (late-evening UTC is already tomorrow in IST)', () => {
    const lateUtc = new Date('2026-09-26T19:00:00Z'); // 00:30 IST on the 27th
    expect(
      classSubject('Maths', new Date('2026-09-27T11:30:00Z'), IST, lateUtc),
    ).toBe("Today's Maths class at 5:00 PM");
  });

  it('classWhen gives the bare phrase used by the substitute notice', () => {
    expect(classWhen(new Date('2026-09-28T11:30:00Z'), IST, NOW)).toBe(
      'on Monday, 28 September at 5:00 PM',
    );
    expect(classWhen(new Date('2026-09-26T11:30:00Z'), IST, NOW)).toBe(
      'today at 5:00 PM',
    );
    expect(classWhen(new Date('2026-09-27T11:30:00Z'), IST, NOW)).toBe(
      'tomorrow at 5:00 PM',
    );
  });
});
