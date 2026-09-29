/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import {
  configureHttpApp,
  createFastifyAdapter,
  registerJsonBodyParserWithRaw,
} from '../src/common/http/app-setup';
import { createHarness, type Harness } from './support/harness';

const CRON_SECRET = 'e2e-internal-jobs-secret-value-0123456789';

/**
 * H7 — the external-scheduler endpoint: authenticated, one route per named
 * job (never "run everything"), and every job it can reach actually runs
 * and is idempotent to call repeatedly.
 */
jest.setTimeout(120_000);

/** Assigning `undefined` via `Object.assign` on `process.env` stringifies it
 *  to the literal string `"undefined"` (a real Node.js gotcha) rather than
 *  clearing the variable — so an override meaning "unset this" must
 *  `delete` the key instead. */
function applyEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Restores process.env to exactly `snapshot` — deletes any key `applyEnv`
 *  added that wasn't there before, not just re-assigns the ones that were. */
function restoreProcessEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
}

async function bootWithCronSecret(env: Partial<NodeJS.ProcessEnv> = {}) {
  const previous = { ...process.env };
  applyEnv({ CRON_SECRET, ...env });
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    const adapter = createFastifyAdapter();
    registerJsonBodyParserWithRaw(adapter);
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      adapter,
      { bodyParser: false },
    );
    configureHttpApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return { app, restoreEnv: () => restoreProcessEnv(previous) };
  } catch (err) {
    restoreProcessEnv(previous);
    throw err;
  }
}

describe('POST /internal/jobs/:job — auth', () => {
  let app: NestFastifyApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, restoreEnv } = await bootWithCronSecret());
  });
  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  const post = (job: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/internal/jobs/${job}`, headers });

  it('no secret header -> 401', async () => {
    const res = await post('class-reminders');
    expect(res.statusCode).toBe(401);
  });

  it('wrong secret -> 401', async () => {
    const res = await post('class-reminders', { 'x-cron-secret': 'nope' });
    expect(res.statusCode).toBe(401);
  });

  it('correct secret, unknown job name -> 404 (not a "run everything" endpoint)', async () => {
    const res = await post('run-everything', { 'x-cron-secret': CRON_SECRET });
    expect(res.statusCode).toBe(404);
  });

  it('correct secret, a real job name -> 200', async () => {
    const res = await post('payments-expire-stale-orders', {
      'x-cron-secret': CRON_SECRET,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { job: string; ranAt: string };
    expect(body.job).toBe('payments-expire-stale-orders');
    expect(new Date(body.ranAt).getTime()).not.toBeNaN();
  });

  it('every documented job name is reachable and returns 200', async () => {
    const jobs = [
      'class-reminders',
      'government-holidays',
      'assessment-scorecard-windows',
      'assessment-overdue-sweep',
      'assessment-online-deadlines',
      'assessment-weekly-reminder',
      'payments-expire-stale-orders',
      'payments-resume-stuck-refunds',
      'payments-report-stuck-payouts',
    ];
    for (const job of jobs) {
      const res = await post(job, { 'x-cron-secret': CRON_SECRET });
      expect([res.statusCode, job]).toEqual([200, job]);
    }
  });

  it('calling the same job twice in a row is safe (idempotent jobs, not a special case here)', async () => {
    const a = await post('assessment-overdue-sweep', {
      'x-cron-secret': CRON_SECRET,
    });
    const b = await post('assessment-overdue-sweep', {
      'x-cron-secret': CRON_SECRET,
    });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });
});

describe('POST /internal/jobs/:job — CRON_SECRET not configured', () => {
  it('the endpoint is entirely unusable (503), never open', async () => {
    const { app, restoreEnv } = await bootWithCronSecret({
      CRON_SECRET: undefined,
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/jobs/class-reminders',
        headers: { 'x-cron-secret': 'anything' },
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
      restoreEnv();
    }
  });
});

describe('POST /internal/jobs/payments-expire-stale-orders — real effect', () => {
  let h: Harness;
  const previousSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    h = await createHarness('intjobs');
  });
  afterAll(async () => {
    await h.close();
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it('expires a genuinely stale open order and leaves a fresh one alone', async () => {
    const tutor = await h.makeUser('tutor', 'reconcile-t');
    const student = await h.makeUser('student', 'reconcile-s');
    const batch = await h.createBatch(tutor, { feeMinor: 5000 });
    await h.enroll(batch, student.id);
    await h.api('POST', `/fees/batch/${batch}/generate`, tutor.token, {
      body: { periodLabel: '2031-07' },
    });
    const fee = await h.db
      .selectFrom('fee_ledger')
      .select('id')
      .where('batch_id', '=', batch)
      .where('student_id', '=', student.id)
      .executeTakeFirstOrThrow();

    const order = await h.api(
      'POST',
      `/payments/fee/${fee.id}/order`,
      student.token,
      { body: {} },
    );
    expect(order.status).toBe(201);

    // Back-date it well past the staleness window, as if the payer
    // abandoned checkout a day ago.
    await h.db
      .updateTable('payments')
      .set({ created_at: new Date(Date.now() - 48 * 3_600_000) })
      .where('id', '=', order.body.id)
      .execute();

    const res = await h.api(
      'POST',
      '/internal/jobs/payments-expire-stale-orders',
      undefined,
      { headers: { 'x-cron-secret': CRON_SECRET } },
    );
    expect(res.status).toBe(200);

    const after = await h.db
      .selectFrom('payments')
      .select(['status', 'failure_reason'])
      .where('id', '=', order.body.id)
      .executeTakeFirstOrThrow();
    expect(after.status).toBe('failed');
    expect(after.failure_reason).toBe('expired');

    // ...and the fee's "one open order" slot is free again for a real retry.
    const retry = await h.api(
      'POST',
      `/payments/fee/${fee.id}/order`,
      student.token,
      { body: {} },
    );
    expect(retry.status).toBe(201);
    expect(retry.body.id).not.toBe(order.body.id);
  });
});
