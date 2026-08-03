export const PAYOUTS_PROVIDER = 'PAYOUTS_PROVIDER';

export interface InitiatePayoutParams {
  amountMinor: number;
  currency: string;
  /** Razorpay Route linked-account id — null means the tutor hasn't
   *  completed Route onboarding (KYC + bank details) yet. */
  tutorAccountId: string | null;
  /** Our own payout row id, for tracing a provider payout back to it. */
  reference: string;
}

export interface PayoutsProvider {
  readonly name: string;

  initiatePayout(params: InitiatePayoutParams): Promise<{ payoutId: string }>;

  /** Dev/test-only path — mirrors PaymentsProvider.simulateCapture. The
   *  real provider refuses this; a real Route transfer settles to the
   *  tutor's linked account on Razorpay's own schedule, not on demand. */
  simulateComplete(payoutId: string): Promise<{ status: 'paid' }>;
}
