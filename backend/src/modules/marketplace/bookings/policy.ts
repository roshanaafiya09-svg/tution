/**
 * Reschedule/cancellation policy for 1:1 bookings (blueprint §10 Phase
 * 4). The blueprint names the feature but sets no numbers — these are
 * judgment calls, flagged the same way parent premium's ₹149 pricing
 * was: worth sign-off before pilot tutors see them.
 */
export const RESCHEDULE_POLICY = {
  minNoticeHours: 12,
  maxReschedulesPerBooking: 2,
};

export const CANCELLATION_POLICY = {
  /** >= this notice -> full refund. */
  fullRefundNoticeHours: 24,
  /** >= this (but < fullRefundNoticeHours) -> partial refund. Below it -> 0%. */
  partialRefundNoticeHours: 6,
  partialRefundPercent: 50,
};

/** Student-initiated cancellation only — a tutor-initiated cancellation
 *  is always a full refund regardless of notice (the tutor bears no
 *  financial penalty in this pass; a reliability signal is a natural
 *  follow-up, out of scope now). */
export function refundPercentForNotice(noticeHours: number): number {
  if (noticeHours >= CANCELLATION_POLICY.fullRefundNoticeHours) return 100;
  if (noticeHours >= CANCELLATION_POLICY.partialRefundNoticeHours) {
    return CANCELLATION_POLICY.partialRefundPercent;
  }
  return 0;
}
