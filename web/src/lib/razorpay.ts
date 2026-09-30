import { api } from './api';
import type { PaymentOrder } from './types';

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a retry after a transient failure
      reject(new Error('Could not load Razorpay checkout.'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}

interface RazorpayCheckout {
  open: () => void;
}

type RazorpayWindow = Window & {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
};

/** GET /payments/:id — the server's view of a payment, never the widget's. */
interface PaymentStatus {
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  settled: boolean;
  failureReason: string | null;
}

/**
 * How a checkout ended, as far as the SERVER knows:
 *  - 'captured': the payment is recorded and applied (plan active, booking
 *    confirmed, …) — safe to show success.
 *  - 'pending': the payer finished checkout but the provider's webhook has
 *    not been recorded yet. Money may well be taken; tell the payer it is
 *    being confirmed rather than claiming success or failure.
 */
export type CheckoutOutcome = 'captured' | 'pending';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The widget's success callback only means "the payer completed checkout".
 * The payment counts once the provider's signed webhook has been recorded
 * and applied, so poll the server for that. Returns an error message when
 * the server settles the payment as failed or unapplied.
 */
async function awaitServerConfirmation(
  paymentId: string,
): Promise<{ outcome: CheckoutOutcome } | { error: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const p = await api.get<PaymentStatus>(`/payments/${paymentId}`);
      if (p.status === 'captured' || p.status === 'refunded') {
        return p.settled
          ? { outcome: 'captured' }
          : {
              error:
                'Your payment was received but could not be applied, so it will be refunded automatically.',
            };
      }
      if (p.status === 'failed') {
        return { error: 'The payment did not go through. You have not been charged.' };
      }
    } catch {
      // A transient network error while polling says nothing about the
      // payment itself — keep polling until the deadline.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { outcome: 'pending' };
}

/**
 * Opens Razorpay Checkout.js for a created order, then waits for the
 * server to confirm it.
 *
 * Which path runs is decided by the ORDER's provider, i.e. by what the
 * backend actually used — never by whether this build happens to have a
 * public key:
 *  - 'mock' (local dev/tests only): no real Razorpay order exists, so the
 *    dev-only simulate-capture endpoint stands in for the webhook.
 *  - anything else: a real order. A missing NEXT_PUBLIC_RAZORPAY_KEY_ID is
 *    a deployment error and is reported as one, not silently turned into a
 *    simulated payment the server will refuse.
 */
export async function payForOrder(
  order: PaymentOrder,
  opts: {
    name: string;
    description?: string;
    onSettled: (outcome: CheckoutOutcome) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  if (order.provider === 'mock') {
    try {
      await api.post(`/payments/${order.id}/simulate-capture`);
      opts.onSettled('captured');
    } catch {
      opts.onError('Could not complete the (simulated) payment.');
    }
    return;
  }

  if (!RAZORPAY_KEY_ID) {
    opts.onError('Online payments are not configured on this site yet. Please try again later.');
    return;
  }

  try {
    await loadCheckoutScript();
  } catch {
    opts.onError('Could not load the payment widget. Check your connection.');
    return;
  }

  const win = window as RazorpayWindow;
  if (!win.Razorpay) {
    opts.onError('Payment widget failed to initialize.');
    return;
  }

  // Resolves once the widget is closed one way or the other, so callers'
  // "processing" state lasts until the outcome is actually known.
  await new Promise<void>((resolve) => {
    const checkout = new win.Razorpay!({
      key: RAZORPAY_KEY_ID,
      amount: order.amount_minor,
      currency: order.currency,
      order_id: order.provider_order_id,
      name: opts.name,
      description: opts.description,
      theme: { color: '#3532A8' },
      handler: () => {
        void awaitServerConfirmation(order.id).then((result) => {
          if ('error' in result) opts.onError(result.error);
          else opts.onSettled(result.outcome);
          resolve();
        });
      },
      modal: {
        ondismiss: () => {
          opts.onError('Payment cancelled.');
          resolve();
        },
      },
    });
    checkout.open();
  });
}
