/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Kysely } from 'kysely';
import { AppModule } from '../src/app.module';
import { KYSELY_CONNECTION } from '../src/database/database.module';
import type { DB, UserRole } from '../src/database/types';
import { newId } from '../src/database/id';
import { TokensService } from '../src/modules/identity/auth/tokens.service';

/**
 * H5 — Fee ledger correctness regression suite.
 *
 * Covers the bugs found in the H5 audit:
 *  - periodTotals() used to count a 'waived' fee's full expected_minor as
 *    outstanding (no status filter) — TEST 1.
 *  - recordPayment/waive had no status guard, so a payment could silently
 *    resurrect a 'waived' entry, and a 'paid' entry could be waived away,
 *    erasing recorded money — TEST 2/3.
 *  - no upper-bound validation let a recorded payment exceed what was
 *    actually expected — TEST 4.
 *  - no atomic guard against two simultaneous payment/waive requests
 *    racing the same entry — TEST 5.
 *  - fee generation is scoped per teaching context (already correct,
 *    kept as a guard against regressions elsewhere in this branch of
 *    work) — TEST 6.
 */

const MARKER = `fee${Date.now().toString(36)}`;
jest.setTimeout(120_000);

type Res = { status: number; body: any };

describe('Fee ledger correctness (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  let subjectId: string;
  let gradeLevelId: string;

  const cleanup = { users: [] as string[] };
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string,
    opts: { body?: unknown } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.inject({
      method,
      url,
      headers,
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: any = null;
    try {
      body = res.body ? JSON.parse(res.body) : null;
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body };
  }

  async function makeUser(role: UserRole, label: string) {
    const id = newId();
    phoneSeq += 1;
    await db
      .insertInto('users')
      .values({
        id,
        phone_e164: `+91${MARKER}${String(phoneSeq).padStart(3, '0')}`.slice(
          0,
          20,
        ),
        email: `${MARKER}-${label}@example.test`,
      })
      .execute();
    await db.insertInto('user_roles').values({ user_id: id, role }).execute();
    if (role === 'tutor') {
      await db
        .insertInto('profiles_tutor')
        .values({
          user_id: id,
          display_name: `Tutor ${label} ${MARKER}`,
          slug: `${MARKER}-${label}`,
        })
        .execute();
    }
    if (role === 'student') {
      await db
        .insertInto('profiles_student')
        .values({ user_id: id, display_name: `Student ${label} ${MARKER}` })
        .execute();
    }
    cleanup.users.push(id);
    return { id, token: tokens.signAccessToken(id, [role]) };
  }

  async function enroll(batchId: string, studentId: string) {
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
      .execute();
  }

  async function makeBatch(tutor: { token: string }, feeMinor: number) {
    const res = await api('POST', '/batches', tutor.token, {
      body: {
        title: `Batch ${MARKER}-${newId().slice(0, 6)}`,
        subjectId,
        gradeLevelId,
        capacity: 30,
        feeMinor,
      },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function period(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  let T: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Kysely<DB>>(KYSELY_CONNECTION);
    tokens = app.get(TokensService);

    subjectId = (
      await db.selectFrom('subjects').select('id').executeTakeFirstOrThrow()
    ).id;
    gradeLevelId = (
      await db.selectFrom('grade_levels').select('id').executeTakeFirstOrThrow()
    ).id;

    T = await makeUser('tutor', 't1');
  });

  afterAll(async () => {
    try {
      if (db && cleanup.users.length) {
        await db.deleteFrom('users').where('id', 'in', cleanup.users).execute();
      }
    } finally {
      await app?.close();
    }
  });

  it('TEST 1 — a waived entry is excluded from expected/outstanding, not just the row list', async () => {
    const batchId = await makeBatch(T, 50000);
    const s1 = await makeUser('student', 's1');
    const s2 = await makeUser('student', 's2');
    await enroll(batchId, s1.id);
    await enroll(batchId, s2.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const rows = (await api('GET', `/fees/period?period=${p}`, T.token))
      .body as any[];
    const mine = rows.filter((r) => r.batch_id === batchId);
    expect(mine).toHaveLength(2);

    // Waive one of the two entries.
    const waived = await api('POST', `/fees/${mine[0].id}/waive`, T.token, {
      body: { note: 'sibling discount' },
    });
    expect(waived.status).toBe(201);

    const totals = (
      await api('GET', `/fees/period/totals?period=${p}`, T.token)
    ).body;
    // Only the non-waived entry's 50000 should count as expected/outstanding.
    expect(totals.expectedMinor).toBe(50000);
    expect(totals.outstandingMinor).toBe(50000);
    expect(totals.waivedMinor).toBe(50000);
  });

  it('TEST 2 — recording a payment on an already-waived entry is rejected, not silently un-waived', async () => {
    const batchId = await makeBatch(T, 30000);
    const s1 = await makeUser('student', 's3');
    await enroll(batchId, s1.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const [entry] = (
      (await api('GET', `/fees/period?period=${p}`, T.token)).body as any[]
    ).filter((r: any) => r.batch_id === batchId);

    const waived = await api('POST', `/fees/${entry.id}/waive`, T.token, {
      body: {},
    });
    expect(waived.status).toBe(201);

    const payAttempt = await api(
      'POST',
      `/fees/${entry.id}/record-payment`,
      T.token,
      { body: { paidMinor: 30000 } },
    );
    expect(payAttempt.status).toBe(409);
    expect(payAttempt.body.code).toBe('FEE_ALREADY_WAIVED');

    const row = await db
      .selectFrom('fee_ledger')
      .select(['status', 'recorded_paid_minor'])
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('waived');
    expect(row.recorded_paid_minor).toBeNull();
  });

  it('TEST 3 — waiving an already-paid entry is rejected, not silently erasing the payment', async () => {
    const batchId = await makeBatch(T, 20000);
    const s1 = await makeUser('student', 's4');
    await enroll(batchId, s1.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const [entry] = (
      (await api('GET', `/fees/period?period=${p}`, T.token)).body as any[]
    ).filter((r: any) => r.batch_id === batchId);

    const paid = await api(
      'POST',
      `/fees/${entry.id}/record-payment`,
      T.token,
      { body: { paidMinor: 20000 } },
    );
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('paid');

    const waiveAttempt = await api('POST', `/fees/${entry.id}/waive`, T.token, {
      body: {},
    });
    expect(waiveAttempt.status).toBe(409);
    expect(waiveAttempt.body.code).toBe('FEE_ALREADY_PAID');

    const row = await db
      .selectFrom('fee_ledger')
      .select(['status', 'recorded_paid_minor'])
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('paid');
    expect(row.recorded_paid_minor).toBe(20000);
  });

  it('TEST 4 — a recorded payment above the expected amount is rejected', async () => {
    const batchId = await makeBatch(T, 10000);
    const s1 = await makeUser('student', 's5');
    await enroll(batchId, s1.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const [entry] = (
      (await api('GET', `/fees/period?period=${p}`, T.token)).body as any[]
    ).filter((r: any) => r.batch_id === batchId);

    const over = await api(
      'POST',
      `/fees/${entry.id}/record-payment`,
      T.token,
      { body: { paidMinor: 10001 } },
    );
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('FEE_AMOUNT_EXCEEDS_EXPECTED');
  });

  it('TEST 5 — a payment and a waive racing the same entry resolve to exactly one winner', async () => {
    const batchId = await makeBatch(T, 15000);
    const s1 = await makeUser('student', 's6');
    await enroll(batchId, s1.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const [entry] = (
      (await api('GET', `/fees/period?period=${p}`, T.token)).body as any[]
    ).filter((r: any) => r.batch_id === batchId);

    const [payRes, waiveRes] = await Promise.all([
      api('POST', `/fees/${entry.id}/record-payment`, T.token, {
        body: { paidMinor: 15000 },
      }),
      api('POST', `/fees/${entry.id}/waive`, T.token, { body: {} }),
    ]);
    const statuses = [payRes.status, waiveRes.status].sort();
    // Exactly one of the two succeeds (201); the other loses the atomic
    // claim and gets a precise 409, never a silent double-apply.
    expect(statuses).toEqual([201, 409]);

    const row = await db
      .selectFrom('fee_ledger')
      .select('status')
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow();
    expect(['paid', 'waived']).toContain(row.status);
  });

  it('TEST 6 — regenerating a period never reverts a paid or waived entry back to due', async () => {
    const batchId = await makeBatch(T, 40000);
    const s1 = await makeUser('student', 's7');
    const s2 = await makeUser('student', 's8');
    await enroll(batchId, s1.id);
    await enroll(batchId, s2.id);
    const p = period();

    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });
    const rows = (
      (await api('GET', `/fees/period?period=${p}`, T.token)).body as any[]
    ).filter((r: any) => r.batch_id === batchId);
    await api('POST', `/fees/${rows[0].id}/record-payment`, T.token, {
      body: { paidMinor: 40000 },
    });
    await api('POST', `/fees/${rows[1].id}/waive`, T.token, { body: {} });

    // Regenerate the same period (e.g. the tutor re-runs it, or changes
    // the default fee for the batch) — statuses must survive untouched.
    await api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      body: { periodLabel: p },
    });

    const after = await db
      .selectFrom('fee_ledger')
      .select(['id', 'status'])
      .where('id', 'in', [rows[0].id, rows[1].id])
      .execute();
    const byId = Object.fromEntries(after.map((r) => [r.id, r.status]));
    expect(byId[rows[0].id]).toBe('paid');
    expect(byId[rows[1].id]).toBe('waived');
  });
});
