import { createHash, createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { RazorpayPaymentsProvider } from './razorpay-payments.provider';

const SECRET = 'whsec_test_only_not_a_real_secret_value';

/** `{ webhookSecret: undefined }` means "unset" — an options object, not a
 *  defaulted parameter, so an explicit undefined is not replaced. */
function provider(
  { webhookSecret }: { webhookSecret?: string } = { webhookSecret: SECRET },
) {
  const values: Record<string, string | undefined> = {
    'razorpay.webhookSecret': webhookSecret,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new RazorpayPaymentsProvider(config);
}

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Shapes follow Razorpay's documented webhook payloads (entity nested
 *  under payload.<entity>.entity; amounts in paise). */
function paymentEvent(event: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    entity: 'event',
    account_id: 'acc_test',
    event,
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: 'pay_29QQoUBi66xm2f',
          entity: 'payment',
          amount: 49_900,
          currency: 'INR',
          status: event.split('.')[1],
          order_id: 'order_9A33XWu170gUtm',
          ...overrides,
        },
      },
    },
    created_at: 1_790_000_000,
  });
}

function refundEvent(event: string) {
  return JSON.stringify({
    entity: 'event',
    event,
    contains: ['refund', 'payment'],
    payload: {
      refund: {
        entity: {
          id: 'rfnd_FP8QHiV938haTz',
          entity: 'refund',
          amount: 24_950,
          payment_id: 'pay_29QQoUBi66xm2f',
        },
      },
    },
  });
}

describe('RazorpayPaymentsProvider.verifyWebhook — signature', () => {
  it('accepts a body signed with the webhook secret', () => {
    const body = paymentEvent('payment.captured');
    expect(provider().verifyWebhook(body, sign(body), 'evt_1')).not.toBeNull();
  });

  it('rejects a wrong signature', () => {
    const body = paymentEvent('payment.captured');
    expect(
      provider().verifyWebhook(body, sign(body, 'other-secret')),
    ).toBeNull();
  });

  it('rejects an empty or truncated signature without throwing', () => {
    const body = paymentEvent('payment.captured');
    expect(provider().verifyWebhook(body, '')).toBeNull();
    expect(provider().verifyWebhook(body, sign(body).slice(0, 10))).toBeNull();
  });

  it('rejects a body altered after signing (e.g. a bumped amount)', () => {
    const body = paymentEvent('payment.captured');
    const sig = sign(body);
    const tampered = body.replace('49900', '1');
    expect(provider().verifyWebhook(tampered, sig)).toBeNull();
  });

  it('rejects everything when RAZORPAY_WEBHOOK_SECRET is unset (never falls open)', () => {
    const body = paymentEvent('payment.captured');
    expect(
      provider({ webhookSecret: undefined }).verifyWebhook(body, sign(body)),
    ).toBeNull();
  });

  it('rejects signed bodies that are not a JSON object', () => {
    for (const body of ['not json', 'null', '42', '[1,2]']) {
      expect(provider().verifyWebhook(body, sign(body))).toBeNull();
    }
  });
});

describe('RazorpayPaymentsProvider.verifyWebhook — event mapping', () => {
  it.each([
    ['payment.captured', 'captured'],
    ['payment.authorized', 'authorized'],
    ['payment.failed', 'failed'],
  ])('%s -> %s with order, payment id and amount', (event, type) => {
    const body = paymentEvent(event);
    expect(provider().verifyWebhook(body, sign(body), 'evt_1')).toEqual({
      type,
      eventId: 'evt_1',
      providerOrderId: 'order_9A33XWu170gUtm',
      providerPaymentId: 'pay_29QQoUBi66xm2f',
      amountMinor: 49_900,
    });
  });

  it('a payment event with no order_id is rejected rather than guessed at', () => {
    const body = paymentEvent('payment.captured', { order_id: null });
    expect(provider().verifyWebhook(body, sign(body))).toBeNull();
  });

  it.each([
    ['refund.processed', 'refund_processed'],
    ['refund.failed', 'refund_failed'],
  ])('%s -> %s', (event, type) => {
    const body = refundEvent(event);
    expect(provider().verifyWebhook(body, sign(body), 'evt_r')).toEqual({
      type,
      eventId: 'evt_r',
      providerPaymentId: 'pay_29QQoUBi66xm2f',
      providerRefundId: 'rfnd_FP8QHiV938haTz',
      amountMinor: 24_950,
    });
  });

  it.each(['order.paid', 'refund.created', 'payment.dispute.created'])(
    '%s is recorded as ignored — never treated as a failure',
    (event) => {
      const body = JSON.stringify({ event, payload: {} });
      expect(provider().verifyWebhook(body, sign(body), 'evt_i')).toEqual({
        type: 'ignored',
        eventId: 'evt_i',
        rawType: event,
      });
    },
  );
});

describe('RazorpayPaymentsProvider.verifyWebhook — idempotency key', () => {
  it('uses the X-Razorpay-Event-Id header when present', () => {
    const body = paymentEvent('payment.captured');
    expect(
      provider().verifyWebhook(body, sign(body), '  evt_abc  ')?.eventId,
    ).toBe('evt_abc');
  });

  it('falls back to a stable hash of the signed body, so a replay dedupes', () => {
    const body = paymentEvent('payment.captured');
    const a = provider().verifyWebhook(body, sign(body));
    const b = provider().verifyWebhook(body, sign(body), '   ');
    const expected = `body:${createHash('sha256').update(body).digest('hex')}`;
    expect(a?.eventId).toBe(expected);
    expect(b?.eventId).toBe(expected);
  });
});
