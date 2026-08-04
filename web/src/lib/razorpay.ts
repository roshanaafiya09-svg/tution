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
    script.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
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

/**
 * Opens Razorpay's Checkout.js for a created order. The backend's mock
 * payments provider (active whenever RAZORPAY_KEY_ID is unset there) hands
 * back an order with provider "mock" and no real Razorpay order to open a
 * widget against — so in that case (or if this app has no public key
 * configured) we skip straight to the dev-only simulate-capture endpoint,
 * exercising the same order -> paid transition without a real gateway.
 *
 * Real capture always happens async via the backend's Razorpay webhook, so
 * `onSettled` should re-fetch whatever status the caller cares about rather
 * than assume the payment is captured the instant this resolves.
 */
export async function payForOrder(
  order: PaymentOrder,
  opts: { name: string; description?: string; onSettled: () => void; onError: (message: string) => void },
): Promise<void> {
  const isMock = order.provider === 'mock' || !RAZORPAY_KEY_ID;

  if (isMock) {
    try {
      await api.post(`/payments/${order.id}/simulate-capture`);
      opts.onSettled();
    } catch {
      opts.onError('Could not complete the (simulated) payment.');
    }
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

  const checkout = new win.Razorpay({
    key: RAZORPAY_KEY_ID!,
    amount: order.amount_minor,
    currency: order.currency,
    order_id: order.provider_order_id,
    name: opts.name,
    description: opts.description,
    theme: { color: '#3532A8' },
    handler: () => opts.onSettled(),
    modal: { ondismiss: () => opts.onError('Payment cancelled.') },
  });
  checkout.open();
}
