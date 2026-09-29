// PaymentsService transitively imports several repositories that import
// database.module.ts, which pulls in Kysely's real (ESM) package at the
// top level for its Postgres pool setup — this Jest config can't
// transform that (see users.repository.spec.ts for the same workaround).
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { PaymentsRepository } from './payments.repository';
import type { PaymentLedgersRepository } from './payment-ledgers.repository';
import type { PaymentSettlementService } from './payment-settlement.service';
import type { PaymentRefundsService } from './payment-refunds.service';
import type { AcademyBillingRepository } from './academy-billing.repository';
import type { FeesRepository } from '../fees/fees.repository';
import type { FeeNotificationsService } from '../fees/fee-notifications.service';
import type { ParentLinksRepository } from '../../parents/parent-links.repository';
import type { SubscriptionCapacityRepository } from '../subscriptions/subscription-capacity.repository';
import type { SubscriptionCapacityService } from '../subscriptions/subscription-capacity.service';
import type { ParentPremiumService } from '../parent-premium/parent-premium.service';
import type { BookingsService } from '../../marketplace/bookings/bookings.service';
import type { AnalyticsService } from '../../analytics/analytics.service';
import type { PaymentsProvider } from './payments-provider.interface';
import type { ConfigService } from '@nestjs/config';

/**
 * H5/H8/H10 rewrote PaymentsService around real database transactions,
 * guarded status-transition triggers, a unique-per-target open-order index,
 * a provider-event ledger keyed on (provider, event id), and an idempotent
 * refund ledger with its own atomic dispatch claim (migration 0046). Those
 * are exactly the guarantees this file used to unit-test by mocking each
 * repository call in isolation (e.g. "markCaptured resolving `undefined`
 * means the DB's `WHERE status = 'created'` guard already matched zero
 * rows"). That mechanism now lives IN the database (triggers + unique
 * indexes), not in application code alone, so a mocked unit test can no
 * longer meaningfully exercise it — asserting "the mock was called once" no
 * longer proves anything about the real guarantee.
 *
 * The full real-HTTP-plus-real-Postgres replacement for every one of those
 * old cases (duplicate webhook delivery, replayed events, mismatched
 * amounts, stale failures after a success, double booking confirmation,
 * duplicate subscription activation) lives in
 * `test/payments-state-machine.e2e-spec.ts` and
 * `test/booking-refund-race.e2e-spec.ts`, which run against the real
 * triggers and constraints that now provide the guarantee — a strictly
 * stronger test for this specific concern than mocks ever were.
 *
 * What remains genuinely useful to unit-test here is the small amount of
 * logic that runs BEFORE any repository/transaction call — cheap to assert
 * in isolation, and worth pinning down explicitly.
 */
function buildService(overrides: {
  verifyWebhook?: jest.Mock;
  configGet?: jest.Mock;
  findById?: jest.Mock;
  findByParentAndStudent?: jest.Mock;
}) {
  const verifyWebhook = overrides.verifyWebhook ?? jest.fn();
  // Kept as a plain, uncast reference so tests can assert on it directly —
  // going through the `PaymentsRepository`-typed `repository` below makes
  // `transaction` a class method, which `expect(...)` cannot reference
  // unbound (@typescript-eslint/unbound-method).
  const transactionMock = jest.fn((fn: (trx: unknown) => unknown) => fn({}));
  const repository = {
    findById: overrides.findById ?? jest.fn(),
    transaction: transactionMock,
  } as unknown as PaymentsRepository;
  const ledgers = {} as unknown as PaymentLedgersRepository;
  const settlement = {} as unknown as PaymentSettlementService;
  const refunds = {} as unknown as PaymentRefundsService;
  const academies = {} as unknown as AcademyBillingRepository;
  const feesRepository = {} as unknown as FeesRepository;
  const parentLinksRepository = {
    findByParentAndStudent:
      overrides.findByParentAndStudent ?? jest.fn().mockResolvedValue(null),
  } as unknown as ParentLinksRepository;
  const capacityRepository = {} as unknown as SubscriptionCapacityRepository;
  const capacity = {} as unknown as SubscriptionCapacityService;
  const parentPremiumService = {} as unknown as ParentPremiumService;
  const bookingsService = {} as unknown as BookingsService;
  const analytics = { capture: jest.fn() } as unknown as AnalyticsService;
  const feeNotifications = {} as unknown as FeeNotificationsService;
  const config = {
    get: overrides.configGet ?? jest.fn().mockReturnValue('test'),
  } as unknown as ConfigService;
  const provider = {
    name: 'mock',
    verifyWebhook,
  } as unknown as PaymentsProvider;

  const service = new PaymentsService(
    repository,
    ledgers,
    settlement,
    refunds,
    academies,
    feesRepository,
    parentLinksRepository,
    capacityRepository,
    capacity,
    parentPremiumService,
    bookingsService,
    analytics,
    feeNotifications,
    config,
    provider,
  );

  return { service, verifyWebhook, repository, transactionMock };
}

describe('PaymentsService.handleWebhook — signature verification', () => {
  it('rejects an invalid/unverifiable signature before touching the database at all', async () => {
    const { service, verifyWebhook, transactionMock } = buildService({
      verifyWebhook: jest.fn().mockReturnValue(null),
    });

    await expect(service.handleWebhook('{}', 'bad-sig')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(verifyWebhook).toHaveBeenCalledWith('{}', 'bad-sig', undefined);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('passes the event-id header through to the provider for delivery-id based idempotency', async () => {
    const { verifyWebhook, service } = buildService({
      verifyWebhook: jest.fn().mockReturnValue(null),
    });
    await service.handleWebhook('{}', 'sig', 'evt_123').catch(() => undefined);
    expect(verifyWebhook).toHaveBeenCalledWith('{}', 'sig', 'evt_123');
  });
});

describe('PaymentsService.simulateCapture — production guard', () => {
  it('refuses in production regardless of which provider is configured', async () => {
    const { service } = buildService({
      configGet: jest.fn().mockReturnValue('production'),
    });
    await expect(
      service.simulateCapture(
        { sub: 'user-1', roles: ['student'] } as never,
        'payment-1',
      ),
    ).rejects.toThrow(/webhook/i);
  });
});

describe('PaymentsService.getStatusForPayer — ownership', () => {
  it('a payment belonging to someone else is reported as not found, not forbidden (no existence leak)', async () => {
    const { service } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'p1', payer_id: 'someone-else' }),
    });
    await expect(
      service.getStatusForPayer(
        { sub: 'user-1', roles: ['student'] } as never,
        'p1',
      ),
    ).rejects.toThrow(/not found/i);
  });
});
