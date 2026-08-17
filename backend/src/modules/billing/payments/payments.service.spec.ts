// PaymentsService transitively imports several repositories that import
// database.module.ts, which pulls in Kysely's real (ESM) package at the
// top level for its Postgres pool setup — this Jest config can't
// transform that (see users.repository.spec.ts for the same
// workaround). The test never touches Nest's DI container
// (PaymentsService is constructed directly below with mocked
// dependencies), so the token's actual value doesn't matter; only
// importing it without crashing does.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

// bookings.repository.ts (transitively required via BookingsService,
// one of PaymentsService's constructor dependencies) imports `sql` as a
// real value from 'kysely', not just the type — same ESM problem as
// above, one level further down the import graph. Never actually
// invoked in these tests, so an inert stub is enough.
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { PaymentsService } from './payments.service';
import type { PaymentsRepository } from './payments.repository';
import type { FeesRepository } from '../fees/fees.repository';
import type { ParentLinksRepository } from '../../parents/parent-links.repository';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { ParentPremiumService } from '../parent-premium/parent-premium.service';
import type { BookingsService } from '../../marketplace/bookings/bookings.service';
import type { AnalyticsService } from '../../analytics/analytics.service';
import type { PaymentsProvider } from './payments-provider.interface';
import type { ConfigService } from '@nestjs/config';

/**
 * Covers the webhook idempotency fix: Razorpay delivers webhooks
 * at-least-once, and the same settleCapture path is shared with
 * simulateCapture — a duplicate delivery (or a concurrent double-call)
 * must not credit a fee/subscription/parent-premium/booking twice. The
 * repository layer enforces this with an atomic `WHERE status =
 * 'created'` guard (see payments.repository.ts); these tests verify the
 * service correctly treats a "no row updated" result as an idempotent
 * no-op rather than an error, and skips every settlement side-effect
 * when it happens.
 *
 * Every mock is created and kept as a plain jest.fn() local, and
 * asserted on via that same local — never re-accessed through the
 * `as unknown as X`-cast dependency object, which TypeScript sees as a
 * real class method and would trip @typescript-eslint/unbound-method.
 */
function buildService(overrides: {
  markCaptured?: jest.Mock;
  markFailed?: jest.Mock;
  findByProviderOrderId?: jest.Mock;
  findById?: jest.Mock;
  feesFindById?: jest.Mock;
  recordPayment?: jest.Mock;
  activatePlan?: jest.Mock;
  activateParentPremiumPlan?: jest.Mock;
  markConfirmed?: jest.Mock;
  captureAnalytics?: jest.Mock;
  verifyWebhook?: jest.Mock;
}) {
  const markCaptured = overrides.markCaptured ?? jest.fn();
  const markFailed = overrides.markFailed ?? jest.fn();
  const findByProviderOrderId = overrides.findByProviderOrderId ?? jest.fn();
  const findById = overrides.findById ?? jest.fn();
  const feesFindById = overrides.feesFindById ?? jest.fn();
  const recordPayment = overrides.recordPayment ?? jest.fn();
  const activatePlan = overrides.activatePlan ?? jest.fn();
  const activateParentPremiumPlan =
    overrides.activateParentPremiumPlan ?? jest.fn();
  const markConfirmed = overrides.markConfirmed ?? jest.fn();
  const captureAnalytics = overrides.captureAnalytics ?? jest.fn();
  const verifyWebhook = overrides.verifyWebhook ?? jest.fn();

  const repository = {
    markCaptured,
    markFailed,
    findByProviderOrderId,
    findById,
  } as unknown as PaymentsRepository;

  const feesRepository = {
    findById: feesFindById,
    recordPayment,
  } as unknown as FeesRepository;

  const parentLinksRepository = {} as unknown as ParentLinksRepository;
  const subscriptionsService = {
    findSubscriptionById: jest.fn(),
    activatePlan,
  } as unknown as SubscriptionsService;
  const parentPremiumService = {
    findSubscriptionById: jest.fn(),
    activatePlan: activateParentPremiumPlan,
  } as unknown as ParentPremiumService;
  const bookingsService = {
    markConfirmed,
  } as unknown as BookingsService;
  const analytics = {
    capture: captureAnalytics,
  } as unknown as AnalyticsService;
  const provider = {
    name: 'mock',
    verifyWebhook,
  } as unknown as PaymentsProvider;
  // Not 'production' — simulateCapture's assertNotProduction guard (see
  // payments.service.ts) isn't what these idempotency tests are about;
  // handleWebhook doesn't call it at all, but simulateCapture-adjacent
  // tests elsewhere would need this to resolve to a non-prod value.
  const config = { get: () => 'test' } as unknown as ConfigService;

  const service = new PaymentsService(
    repository,
    feesRepository,
    parentLinksRepository,
    subscriptionsService,
    parentPremiumService,
    bookingsService,
    analytics,
    config,
    provider,
  );

  return {
    service,
    markCaptured,
    markFailed,
    findByProviderOrderId,
    findById,
    feesFindById,
    recordPayment,
    activatePlan,
    activateParentPremiumPlan,
    markConfirmed,
    captureAnalytics,
    verifyWebhook,
  };
}

const CAPTURED_WEBHOOK_RESULT = {
  providerOrderId: 'order_1',
  providerPaymentId: 'pay_1',
  status: 'captured' as const,
  amountMinor: 5000,
};

describe('PaymentsService.handleWebhook — capture idempotency', () => {
  it('credits the fee exactly once on first delivery', async () => {
    const payment = {
      id: 'payment_1',
      fee_ledger_id: 'fee_1',
      subscription_id: null,
      parent_subscription_id: null,
      booking_id: null,
      plan_id: null,
      amount_minor: 5000,
      payer_id: 'student_1',
    };
    const capturedRow = { ...payment, status: 'captured', provider: 'mock' };

    const {
      service,
      markCaptured,
      recordPayment,
      captureAnalytics,
      verifyWebhook,
    } = buildService({
      markCaptured: jest.fn().mockResolvedValue(capturedRow),
      findByProviderOrderId: jest.fn().mockResolvedValue(payment),
      feesFindById: jest.fn().mockResolvedValue({
        id: 'fee_1',
        expected_minor: 5000,
        recorded_paid_minor: 0,
      }),
      recordPayment: jest.fn().mockResolvedValue(undefined),
      verifyWebhook: jest.fn().mockReturnValue(CAPTURED_WEBHOOK_RESULT),
    });

    await service.handleWebhook('{}', 'sig');

    expect(markCaptured).toHaveBeenCalledTimes(1);
    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(recordPayment).toHaveBeenCalledWith(
      'fee_1',
      5000,
      'paid',
      expect.stringContaining('payment_1'),
    );
    expect(captureAnalytics).toHaveBeenCalledTimes(1);
    expect(verifyWebhook).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-credit the fee when the same webhook event is replayed — the core fix', async () => {
    const payment = {
      id: 'payment_1',
      fee_ledger_id: 'fee_1',
      subscription_id: null,
      parent_subscription_id: null,
      booking_id: null,
      plan_id: null,
      amount_minor: 5000,
      payer_id: 'student_1',
    };
    // Simulates the real DB: the payment is already 'captured', so the
    // atomic `WHERE status = 'created'` guard in
    // PaymentsRepository.markCaptured matches zero rows.
    const alreadyCaptured = {
      ...payment,
      status: 'captured',
      provider: 'mock',
    };

    const { service, markCaptured, recordPayment, captureAnalytics } =
      buildService({
        markCaptured: jest.fn().mockResolvedValue(undefined),
        findByProviderOrderId: jest.fn().mockResolvedValue(payment),
        findById: jest.fn().mockResolvedValue(alreadyCaptured),
        verifyWebhook: jest.fn().mockReturnValue(CAPTURED_WEBHOOK_RESULT),
      });

    const result = await service.handleWebhook('{}', 'sig');

    expect(markCaptured).toHaveBeenCalledTimes(1);
    // The whole point of the fix: no second credit, no second analytics
    // event, on a replayed/duplicate delivery.
    expect(recordPayment).not.toHaveBeenCalled();
    expect(captureAnalytics).not.toHaveBeenCalled();
    expect(result).toEqual(alreadyCaptured);
  });

  it('does NOT extend a subscription twice on a replayed webhook', async () => {
    const payment = {
      id: 'payment_2',
      fee_ledger_id: null,
      subscription_id: 'sub_1',
      parent_subscription_id: null,
      booking_id: null,
      plan_id: 'monthly',
      amount_minor: 49900,
      payer_id: 'tutor_1',
    };
    const alreadyCaptured = {
      ...payment,
      status: 'captured',
      provider: 'mock',
    };

    const { service, activatePlan, captureAnalytics } = buildService({
      markCaptured: jest.fn().mockResolvedValue(undefined),
      findByProviderOrderId: jest.fn().mockResolvedValue(payment),
      findById: jest.fn().mockResolvedValue(alreadyCaptured),
      verifyWebhook: jest.fn().mockReturnValue({
        ...CAPTURED_WEBHOOK_RESULT,
        providerOrderId: 'order_2',
        amountMinor: 49900,
      }),
    });

    await service.handleWebhook('{}', 'sig');

    expect(activatePlan).not.toHaveBeenCalled();
    expect(captureAnalytics).not.toHaveBeenCalled();
  });

  it('does NOT double-confirm a booking on a replayed webhook', async () => {
    const payment = {
      id: 'payment_3',
      fee_ledger_id: null,
      subscription_id: null,
      parent_subscription_id: null,
      booking_id: 'booking_1',
      plan_id: null,
      amount_minor: 100000,
      payer_id: 'student_2',
    };
    const alreadyCaptured = {
      ...payment,
      status: 'captured',
      provider: 'mock',
    };

    const { service, markConfirmed, captureAnalytics } = buildService({
      markCaptured: jest.fn().mockResolvedValue(undefined),
      findByProviderOrderId: jest.fn().mockResolvedValue(payment),
      findById: jest.fn().mockResolvedValue(alreadyCaptured),
      verifyWebhook: jest.fn().mockReturnValue({
        ...CAPTURED_WEBHOOK_RESULT,
        providerOrderId: 'order_3',
        amountMinor: 100000,
      }),
    });

    await service.handleWebhook('{}', 'sig');

    expect(markConfirmed).not.toHaveBeenCalled();
    expect(captureAnalytics).not.toHaveBeenCalled();
  });

  it('does not flip an already-captured payment back to failed on a stale/replayed failure event', async () => {
    const payment = { id: 'payment_4', payer_id: 'student_3' };
    const alreadyCaptured = { ...payment, status: 'captured' };

    const { service, markFailed } = buildService({
      // Simulates the real DB: markFailed's `WHERE status = 'created'`
      // guard matches zero rows because the payment already captured.
      markFailed: jest.fn().mockResolvedValue(undefined),
      findByProviderOrderId: jest.fn().mockResolvedValue(payment),
      findById: jest.fn().mockResolvedValue(alreadyCaptured),
      verifyWebhook: jest.fn().mockReturnValue({
        providerOrderId: 'order_4',
        providerPaymentId: 'pay_4',
        status: 'failed' as const,
      }),
    });

    const result = await service.handleWebhook('{}', 'sig');

    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(result).toEqual(alreadyCaptured);
  });

  it('rejects a captured event whose amount does not match what the payment was created for', async () => {
    const payment = {
      id: 'payment_5',
      fee_ledger_id: 'fee_5',
      subscription_id: null,
      parent_subscription_id: null,
      booking_id: null,
      plan_id: null,
      amount_minor: 5000,
      payer_id: 'student_5',
    };

    const { service, markCaptured, recordPayment } = buildService({
      findByProviderOrderId: jest.fn().mockResolvedValue(payment),
      verifyWebhook: jest.fn().mockReturnValue({
        ...CAPTURED_WEBHOOK_RESULT,
        amountMinor: 1, // attacker/misconfigured retry reporting a different amount
      }),
    });

    await expect(service.handleWebhook('{}', 'sig')).rejects.toThrow(/amount/i);
    // Must never reach the atomic capture step, let alone credit anything.
    expect(markCaptured).not.toHaveBeenCalled();
    expect(recordPayment).not.toHaveBeenCalled();
  });
});
