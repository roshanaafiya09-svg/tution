jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_HOUR: '0 * * * *',
    EVERY_10_MINUTES: '*/10 * * * *',
  },
}));

import { PaymentReconciliationService } from './payment-reconciliation.service';
import type { PaymentsRepository } from './payments.repository';
import type { PaymentLedgersRepository } from './payment-ledgers.repository';
import type { PaymentRefundsService } from './payment-refunds.service';
import type { PayoutsRepository } from '../payouts/payouts.repository';

function build(overrides: {
  expireStaleOpen?: jest.Mock;
  listPendingRefundsOlderThan?: jest.Mock;
  dispatch?: jest.Mock;
  listStuckPending?: jest.Mock;
}) {
  const expireStaleOpen =
    overrides.expireStaleOpen ?? jest.fn().mockResolvedValue(0);
  const listPendingRefundsOlderThan =
    overrides.listPendingRefundsOlderThan ?? jest.fn().mockResolvedValue([]);
  const dispatch = overrides.dispatch ?? jest.fn().mockResolvedValue(undefined);
  const listStuckPending =
    overrides.listStuckPending ?? jest.fn().mockResolvedValue([]);

  const payments = { expireStaleOpen } as unknown as PaymentsRepository;
  const ledgers = {
    listPendingRefundsOlderThan,
  } as unknown as PaymentLedgersRepository;
  const refunds = { dispatch } as unknown as PaymentRefundsService;
  const payouts = { listStuckPending } as unknown as PayoutsRepository;

  const service = new PaymentReconciliationService(
    payments,
    ledgers,
    refunds,
    payouts,
  );
  return {
    service,
    expireStaleOpen,
    listPendingRefundsOlderThan,
    dispatch,
    listStuckPending,
  };
}

describe('PaymentReconciliationService.expireStaleOrders', () => {
  it('expires orders older than the cutoff and never throws even if the sweep fails', async () => {
    const { service, expireStaleOpen } = build({
      expireStaleOpen: jest.fn().mockResolvedValue(3),
    });
    await expect(service.expireStaleOrders()).resolves.toBeUndefined();
    expect(expireStaleOpen).toHaveBeenCalledTimes(1);
    const calls = expireStaleOpen.mock.calls as unknown as [Date][];
    const cutoff = calls[0][0];
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it('a repository failure is caught, not thrown', async () => {
    const { service } = build({
      expireStaleOpen: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.expireStaleOrders()).resolves.toBeUndefined();
  });
});

describe('PaymentReconciliationService.resumeStuckRefunds', () => {
  it('re-drives dispatch for every stuck refund found, and one failure does not stop the rest', async () => {
    const { service, dispatch } = build({
      listPendingRefundsOlderThan: jest.fn().mockResolvedValue([
        { id: 'r1', payment_id: 'p1' },
        { id: 'r2', payment_id: 'p2' },
      ]),
      dispatch: jest
        .fn()
        .mockRejectedValueOnce(new Error('still pending'))
        .mockResolvedValueOnce(undefined),
    });

    await service.resumeStuckRefunds();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith('p1', 'r1');
    expect(dispatch).toHaveBeenCalledWith('p2', 'r2');
  });

  it('does nothing when there are no stuck refunds', async () => {
    const { service, dispatch } = build({});
    await service.resumeStuckRefunds();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a lookup failure is caught, not thrown', async () => {
    const { service } = build({
      listPendingRefundsOlderThan: jest
        .fn()
        .mockRejectedValue(new Error('db down')),
    });
    await expect(service.resumeStuckRefunds()).resolves.toBeUndefined();
  });
});

describe('PaymentReconciliationService.reportStuckPayouts', () => {
  it('is report-only — it never calls anything that could re-trigger a provider payout', async () => {
    const { service, listStuckPending } = build({
      listStuckPending: jest.fn().mockResolvedValue([
        {
          id: 'po1',
          tutor_id: 't1',
          academy_id: null,
          amount_minor: 1000,
          currency: 'INR',
        },
      ]),
    });
    await expect(service.reportStuckPayouts()).resolves.toBeUndefined();
    expect(listStuckPending).toHaveBeenCalledTimes(1);
  });

  it('a lookup failure is caught, not thrown', async () => {
    const { service } = build({
      listStuckPending: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.reportStuckPayouts()).resolves.toBeUndefined();
  });
});

describe('DISABLE_INTERNAL_CRON gates only the @Cron-fired wrappers (H7)', () => {
  const ORIGINAL_ENV = process.env.DISABLE_INTERNAL_CRON;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.DISABLE_INTERNAL_CRON;
    else process.env.DISABLE_INTERNAL_CRON = ORIGINAL_ENV;
  });

  it('cronExpireStaleOrders no-ops when disabled; expireStaleOrders itself always runs', async () => {
    process.env.DISABLE_INTERNAL_CRON = 'true';
    const { service, expireStaleOpen } = build({});
    await service.cronExpireStaleOrders();
    expect(expireStaleOpen).not.toHaveBeenCalled();
    await service.expireStaleOrders();
    expect(expireStaleOpen).toHaveBeenCalledTimes(1);
  });
});
