/**
 * What a fee_ledger row's `period_label` means, per the batch's
 * `fee_period` (H5).
 *
 * A batch's `fee_minor` is the price for ONE `fee_period` — a monthly
 * batch charges it every month, a quarterly batch once per calendar
 * quarter, a one-time batch once ever. Fee generation used to ignore
 * fee_period entirely and always write a row per requested month, so a
 * quarterly batch generated three times in a quarter billed its quarterly
 * price three times, and a one-time fee was re-billed every month.
 *
 * The ledger's own `unique (batch_id, student_id, period_label)` is what
 * enforces "one charge per period", so the fix is to make the label BE
 * the billing period:
 *   monthly   → '2026-08'     (unchanged — every existing row is monthly-shaped)
 *   quarterly → '2026-Q3'     (Jul–Sep; generating in Jul, Aug or Sep lands on one row)
 *   one_time  → 'one-time'    (one row per student per batch, ever)
 * Different months/quarters therefore never collapse into one row, and the
 * same billing period can never be charged twice.
 */
export type FeePeriod = 'monthly' | 'quarterly' | 'one_time';

export const ONE_TIME_PERIOD_LABEL = 'one-time';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonth(month: string): { year: number; month: number } {
  const match = MONTH.exec(month);
  if (!match) throw new RangeError(`Not a YYYY-MM month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The calendar quarter label ('2026-Q3') containing a YYYY-MM month. */
export function quarterLabelFor(month: string): string {
  const { year, month: m } = parseMonth(month);
  return `${year}-Q${Math.ceil(m / 3)}`;
}

/** The ledger period a batch with this fee_period bills for, when fees are
 *  generated "for" the given YYYY-MM month. */
export function billingPeriodLabel(
  feePeriod: FeePeriod,
  month: string,
): string {
  parseMonth(month);
  switch (feePeriod) {
    case 'quarterly':
      return quarterLabelFor(month);
    case 'one_time':
      return ONE_TIME_PERIOD_LABEL;
    default:
      return month;
  }
}

/** Every ledger period that is "due during" a YYYY-MM month — the month
 *  itself plus the quarter that contains it. The fees page's per-month
 *  view (and its totals) use this so a quarterly fee is visible in each
 *  month of its quarter. One-time fees have no month; the views place
 *  them in the month they were generated (see FeesRepository). */
export function periodLabelsDuringMonth(month: string): string[] {
  return [month, quarterLabelFor(month)];
}
