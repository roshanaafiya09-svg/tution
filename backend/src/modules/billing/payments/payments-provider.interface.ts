export const PAYMENTS_PROVIDER = 'PAYMENTS_PROVIDER';

export interface CreateOrderParams {
  amountMinor: number;
  currency: string;
  /** Our own payment row id — Razorpay's `receipt` field, used to trace
   *  a provider order back to our record without a lookup table. */
  receipt: string;
}

/**
 * A provider webhook, verified and normalised. `eventId` is the provider's
 * own unique id for the delivery; PaymentsService records it under a UNIQUE
 * constraint so a replay is a no-op by construction (audit H5).
 */
export type ProviderEvent =
  | {
      type: 'captured' | 'authorized' | 'failed';
      eventId: string;
      providerOrderId: string;
      providerPaymentId: string;
      /** Straight off the signed payload — cross-checked against the payment
       *  row before anything is credited, so a captured event can never
       *  settle for more or less than was actually charged. */
      amountMinor: number;
    }
  | {
      type: 'refund_processed' | 'refund_failed';
      eventId: string;
      providerPaymentId: string;
      providerRefundId: string;
      amountMinor: number;
    }
  | { type: 'ignored'; eventId: string; rawType: string };

export interface RefundParams {
  providerPaymentId: string;
  amountMinor: number;
  /** Our own refund-ledger row id. Sent to the provider as the refund's
   *  receipt so that, after a timeout, we can ask "did this refund happen?"
   *  and never issue a second one. */
  receipt: string;
}

export interface PaymentsProvider {
  readonly name: string;

  createOrder(params: CreateOrderParams): Promise<{ orderId: string }>;

  /** Dev/test-only path: synchronously simulates the client completing
   *  checkout and the provider capturing the payment, for environments with
   *  no checkout UI wired up. Real providers refuse, and PaymentsService
   *  refuses in production regardless of provider. */
  simulateCapture(orderId: string): Promise<{ paymentId: string }>;

  /** Verifies the webhook signature over the RAW body and normalises the
   *  event. Returns null when the signature is missing/invalid or the
   *  payload is unusable. */
  verifyWebhook(
    rawBody: string,
    signature: string,
    eventIdHeader?: string,
  ): ProviderEvent | null;

  /** Issues a real refund at the provider. */
  refund(params: RefundParams): Promise<{ refundId: string }>;

  /** Has a refund with this receipt already been created at the provider?
   *  Used to recover from a timeout without refunding twice. */
  findRefundByReceipt(
    providerPaymentId: string,
    receipt: string,
  ): Promise<{ refundId: string } | null>;
}

export type PaymentProviderEvent = Extract<
  ProviderEvent,
  { providerOrderId: string }
>;
export type RefundProviderEvent = Extract<
  ProviderEvent,
  { providerRefundId: string }
>;

export function isRefundEvent(
  event: ProviderEvent,
): event is RefundProviderEvent {
  return event.type === 'refund_processed' || event.type === 'refund_failed';
}

export function isPaymentEvent(
  event: ProviderEvent,
): event is PaymentProviderEvent {
  return (
    event.type === 'captured' ||
    event.type === 'authorized' ||
    event.type === 'failed'
  );
}
