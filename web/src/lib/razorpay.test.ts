import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentOrder } from './types';

const get = vi.fn();
const post = vi.fn();
vi.mock('./api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

const realOrder: PaymentOrder = {
  id: 'pay-1',
  amount_minor: 49_900,
  currency: 'INR',
  provider: 'razorpay',
  provider_order_id: 'order_ABC',
  status: 'created',
};

/** A fake Checkout.js: `open()` immediately completes (or dismisses) the checkout. */
function installWidget(mode: 'pay' | 'dismiss') {
  const opened: Record<string, unknown>[] = [];
  (window as unknown as { Razorpay: unknown }).Razorpay = class {
    constructor(private readonly options: Record<string, unknown> & {
      handler: (r: unknown) => void;
      modal: { ondismiss: () => void };
    }) {
      opened.push(options);
    }
    open() {
      if (mode === 'pay') {
        this.options.handler({ razorpay_payment_id: 'pay_X', razorpay_order_id: 'order_ABC', razorpay_signature: 's' });
      } else {
        this.options.modal.ondismiss();
      }
    }
  };
  // The loader appends a <script>; resolve it as loaded.
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
    const el = append(node);
    if (node instanceof HTMLScriptElement) setTimeout(() => node.onload?.(new Event('load')), 0);
    return el;
  });
  return opened;
}

async function load(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', '');
  else vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', key);
  return import('./razorpay');
}

function callbacks() {
  return { name: 'Test', onSettled: vi.fn(), onError: vi.fn() };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
});

describe('payForOrder — which path runs', () => {
  it('a mock order uses the dev simulate-capture endpoint and reports captured', async () => {
    const { payForOrder } = await load(undefined);
    post.mockResolvedValue({});
    const cb = callbacks();
    await payForOrder({ ...realOrder, provider: 'mock' }, cb);
    expect(post).toHaveBeenCalledWith('/payments/pay-1/simulate-capture');
    expect(cb.onSettled).toHaveBeenCalledWith('captured');
  });

  it('a REAL order with no public key is a configuration error, never a simulated payment', async () => {
    const { payForOrder } = await load(undefined);
    const cb = callbacks();
    await payForOrder(realOrder, cb);
    expect(post).not.toHaveBeenCalled();
    expect(cb.onSettled).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(/not configured/));
  });
});

describe('payForOrder — success is decided by the server, not the widget', () => {
  it('reports captured only once the server says captured AND settled', async () => {
    const { payForOrder } = await load('rzp_test_key');
    const opened = installWidget('pay');
    get
      .mockResolvedValueOnce({ status: 'created', settled: false, failureReason: null })
      .mockResolvedValueOnce({ status: 'captured', settled: true, failureReason: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cb = callbacks();
    await payForOrder(realOrder, cb);
    expect(opened[0]).toMatchObject({ key: 'rzp_test_key', order_id: 'order_ABC', amount: 49_900 });
    expect(get).toHaveBeenCalledWith('/payments/pay-1');
    expect(cb.onSettled).toHaveBeenCalledWith('captured');
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('captured but NOT settled (nothing to apply it to) is reported as an automatic refund', async () => {
    const { payForOrder } = await load('rzp_test_key');
    installWidget('pay');
    get.mockResolvedValue({ status: 'captured', settled: false, failureReason: null });
    const cb = callbacks();
    await payForOrder(realOrder, cb);
    expect(cb.onSettled).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(/refunded/));
  });

  it('a failed payment is reported as failed', async () => {
    const { payForOrder } = await load('rzp_test_key');
    installWidget('pay');
    get.mockResolvedValue({ status: 'failed', settled: false, failureReason: 'x' });
    const cb = callbacks();
    await payForOrder(realOrder, cb);
    expect(cb.onError).toHaveBeenCalledWith(expect.stringMatching(/did not go through/));
  });

  it('no webhook within the window is "pending" — neither success nor failure', async () => {
    const { payForOrder } = await load('rzp_test_key');
    installWidget('pay');
    get.mockResolvedValue({ status: 'created', settled: false, failureReason: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cb = callbacks();
    const done = payForOrder(realOrder, cb);
    await vi.advanceTimersByTimeAsync(31_000);
    await done;
    expect(cb.onSettled).toHaveBeenCalledWith('pending');
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('closing the widget without paying is a cancellation and never polls', async () => {
    const { payForOrder } = await load('rzp_test_key');
    installWidget('dismiss');
    const cb = callbacks();
    await payForOrder(realOrder, cb);
    expect(cb.onError).toHaveBeenCalledWith('Payment cancelled.');
    expect(get).not.toHaveBeenCalled();
  });
});
