import {
  ONE_TIME_PERIOD_LABEL,
  billingPeriodLabel,
  periodLabelsDuringMonth,
  quarterLabelFor,
} from './fee-period';

describe('fee period labels (H5)', () => {
  it('monthly bills per month — existing labels unchanged', () => {
    expect(billingPeriodLabel('monthly', '2026-08')).toBe('2026-08');
    expect(billingPeriodLabel('monthly', '2026-09')).toBe('2026-09');
  });

  it('quarterly bills once per calendar quarter; different quarters never collapse', () => {
    expect(
      ['2026-07', '2026-08', '2026-09'].map((m) =>
        billingPeriodLabel('quarterly', m),
      ),
    ).toEqual(['2026-Q3', '2026-Q3', '2026-Q3']);
    expect(billingPeriodLabel('quarterly', '2026-10')).toBe('2026-Q4');
    expect(billingPeriodLabel('quarterly', '2027-01')).toBe('2027-Q1');
    expect(quarterLabelFor('2026-12')).toBe('2026-Q4');
  });

  it('one-time bills exactly once, whichever month it is generated in', () => {
    expect(billingPeriodLabel('one_time', '2026-01')).toBe(
      ONE_TIME_PERIOD_LABEL,
    );
    expect(billingPeriodLabel('one_time', '2027-06')).toBe(
      ONE_TIME_PERIOD_LABEL,
    );
  });

  it('a month view covers that month and its quarter', () => {
    expect(periodLabelsDuringMonth('2026-08')).toEqual(['2026-08', '2026-Q3']);
  });

  it('rejects a malformed month instead of inventing a period', () => {
    expect(() => billingPeriodLabel('quarterly', '2026-13')).toThrow(
      RangeError,
    );
    expect(() => billingPeriodLabel('monthly', 'Aug 2026')).toThrow(RangeError);
  });
});
