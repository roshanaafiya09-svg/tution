export const PAYMENTS_PROVIDER = 'PAYMENTS_PROVIDER';

export interface CreateOrderParams {
  amountMinor: number;
  currency: string;
  /** Our own payment row id — Razorpay's `receipt` field, used to trace
   *  a provider order back to our record without a lookup table. */
  receipt: string;
}

export interface WebhookVerificationResult {
  providerOrderId: string;
  providerPaymentId: string;
  status: 'captured' | 'failed';
}

export interface PaymentsProvider {
  readonly name: string;

  createOrder(params: CreateOrderParams): Promise<{ orderId: string }>;

  /** Dev/test-only path: synchronously simulates the client completing
   *  checkout and Razorpay capturing the payment, for environments with
   *  no checkout UI wired up yet (web/mobile don't have the Razorpay
   *  Checkout SDK integrated). Production capture only ever happens via
   *  the signed webhook — the real provider refuses this call. */
  simulateCapture(orderId: string): Promise<{ paymentId: string }>;

  /** Verifies the HMAC signature on an inbound Razorpay webhook and
   *  extracts the order/payment ids + outcome. Returns null on a bad
   *  signature — callers must treat that as "reject the request", never
   *  as "no signature configured, allow it through". */
  verifyWebhook(rawBody: string, signature: string): WebhookVerificationResult | null;

  /** Refunds a captured payment (blueprint §10 Phase 4 booking
   *  cancellations). Unlike simulateCapture, a real Razorpay refund is a
   *  direct synchronous API call in production too — there's no
   *  webhook-only path being bypassed here, so both providers implement
   *  this as a genuine action, not just a dev/test shortcut. */
  simulateRefund(
    providerPaymentId: string,
    amountMinor: number,
  ): Promise<{ refundId: string }>;
}
