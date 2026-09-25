/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * H5 remaining gaps — over real HTTP against the real database:
 *  - regeneration can no longer rewrite a paid/partial/waived row's amount
 *  - fee_period is honoured: quarterly = one row per quarter, one-time =
 *    one row ever; different periods never collapse into one another
 *  - an enormous amount is a 400, never a 500
 *  - the already-fixed guards (waived ≠ outstanding, atomic pay/waive,
 *    Individual/Academy isolation) re-verified alongside
 */
jest.setTimeout(240_000);

describe('Fee ledger integrity (e2e)', () => {
  let h: Harness;
  let T: Actor;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;

  beforeAll(async () => {
    h = await createHarness('fl');
    T = await h.makeUser('tutor', 't');
    A = await h.makeAcademy('a');
    await h.join(A.id, T.id);
  });
  afterAll(async () => {
    await h?.close();
  });

  const entriesFor = (batchId: string) =>
    h.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('period_label')
      .execute();

  async function generate(
    batchId: string,
    periodLabel: string,
    ctx?: string,
    extra: Record<string, unknown> = {},
  ) {
    return h.api('POST', `/fees/batch/${batchId}/generate`, T.token, {
      ctx,
      body: { periodLabel, ...extra },
    });
  }

  it('regeneration never rewrites a paid (or partial / waived) row — only an untouched "due" row is re-priced', async () => {
    const batch = await h.createBatch(T, { feeMinor: 100000 });
    const payer = await h.makeUser('student', 'payer');
    const partial = await h.makeUser('student', 'partial');
    const waiver = await h.makeUser('student', 'waiver');
    const unpaid = await h.makeUser('student', 'unpaid');
    for (const s of [payer, partial, waiver, unpaid])
      await h.enroll(batch, s.id);

    expect((await generate(batch, '2026-07')).status).toBe(201);
    const rows = await entriesFor(batch);
    const rowOf = (s: Actor) => rows.find((r) => r.student_id === s.id)!;

    expect(
      (
        await h.api(
          'POST',
          `/fees/${rowOf(payer).id}/record-payment`,
          T.token,
          {
            body: { paidMinor: 100000 },
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await h.api(
          'POST',
          `/fees/${rowOf(partial).id}/record-payment`,
          T.token,
          {
            body: { paidMinor: 40000 },
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (await h.api('POST', `/fees/${rowOf(waiver).id}/waive`, T.token)).status,
    ).toBe(201);

    // The batch fee goes up and the period is regenerated.
    expect(
      (
        await h.api('PATCH', `/batches/${batch}`, T.token, {
          body: { feeMinor: 250000 },
        })
      ).status,
    ).toBe(200);
    expect((await generate(batch, '2026-07')).status).toBe(201);

    const after = await entriesFor(batch);
    const now = (s: Actor) => after.find((r) => r.student_id === s.id)!;
    expect(after).toHaveLength(4); // no duplicate rows either
    expect(now(payer)).toMatchObject({
      status: 'paid',
      expected_minor: 100000,
      recorded_paid_minor: 100000,
    });
    expect(now(partial)).toMatchObject({
      status: 'partial',
      expected_minor: 100000,
      recorded_paid_minor: 40000,
    });
    expect(now(waiver)).toMatchObject({
      status: 'waived',
      expected_minor: 100000,
    });
    expect(now(unpaid)).toMatchObject({
      status: 'due',
      expected_minor: 250000,
    });

    // Waived is never outstanding; the paid row's basis is consistent.
    const totals = await h.api(
      'GET',
      '/fees/period/totals?period=2026-07',
      T.token,
    );
    expect(totals.body).toMatchObject({
      expectedMinor: 100000 + 100000 + 250000,
      collectedMinor: 100000 + 40000,
      waivedMinor: 100000,
      outstandingMinor: 100000 + 100000 + 250000 - 140000,
      entries: 4,
      paidCount: 1,
      waivedCount: 1, // "N of M paid" is out of entries - waivedCount = 3
    });
  });

  it('payment on a waived row and waive on a paid row are precise conflicts', async () => {
    const batch = await h.createBatch(T);
    const s1 = await h.makeUser('student', 'c1');
    const s2 = await h.makeUser('student', 'c2');
    await h.enroll(batch, s1.id);
    await h.enroll(batch, s2.id);
    await generate(batch, '2026-08');
    const rows = await entriesFor(batch);
    const r1 = rows.find((r) => r.student_id === s1.id)!;
    const r2 = rows.find((r) => r.student_id === s2.id)!;

    await h.api('POST', `/fees/${r1.id}/waive`, T.token);
    const payWaived = await h.api(
      'POST',
      `/fees/${r1.id}/record-payment`,
      T.token,
      {
        body: { paidMinor: 1000 },
      },
    );
    expect(payWaived.status).toBe(409);
    expect(payWaived.body.code).toBe('FEE_ALREADY_WAIVED');

    await h.api('POST', `/fees/${r2.id}/record-payment`, T.token, {
      body: { paidMinor: r2.expected_minor },
    });
    const waivePaid = await h.api('POST', `/fees/${r2.id}/waive`, T.token);
    expect(waivePaid.status).toBe(409);
    expect(waivePaid.body.code).toBe('FEE_ALREADY_PAID');
  });

  it('a payment racing a waive: exactly one wins, and the row is consistent', async () => {
    const batch = await h.createBatch(T);
    const s = await h.makeUser('student', 'race');
    await h.enroll(batch, s.id);
    await generate(batch, '2026-09');
    const [row] = await entriesFor(batch);

    const [pay, waive] = await Promise.all([
      h.api('POST', `/fees/${row.id}/record-payment`, T.token, {
        body: { paidMinor: row.expected_minor },
      }),
      h.api('POST', `/fees/${row.id}/waive`, T.token),
    ]);
    expect([pay.status, waive.status].sort()).toEqual([201, 409]);
    const [final] = await entriesFor(batch);
    if (pay.status === 201) {
      expect(final).toMatchObject({
        status: 'paid',
        recorded_paid_minor: row.expected_minor,
      });
    } else {
      expect(final.status).toBe('waived');
      expect(final.recorded_paid_minor).toBeNull();
    }
  });

  it('fee_period: a quarterly batch bills once per quarter; different quarters stay separate', async () => {
    const batch = await h.createBatch(T, {
      feeMinor: 300000,
      feePeriod: 'quarterly',
    });
    const s = await h.makeUser('student', 'quarterly');
    await h.enroll(batch, s.id);

    for (const month of ['2026-07', '2026-08', '2026-09']) {
      expect((await generate(batch, month)).status).toBe(201);
    }
    expect((await entriesFor(batch)).map((r) => r.period_label)).toEqual([
      '2026-Q3',
    ]);
    expect((await generate(batch, '2026-10')).status).toBe(201);
    const rows = await entriesFor(batch);
    expect(rows.map((r) => [r.period_label, r.expected_minor])).toEqual([
      ['2026-Q3', 300000],
      ['2026-Q4', 300000],
    ]);

    // The August view shows Q3 (due during August), never Q4.
    const aug = await h.api('GET', '/fees/period?period=2026-08', T.token);
    const augForBatch = (aug.body as any[]).filter((e) => e.batch_id === batch);
    expect(augForBatch.map((e) => e.period_label)).toEqual(['2026-Q3']);
    const nov = await h.api('GET', '/fees/period?period=2026-11', T.token);
    expect(
      (nov.body as any[])
        .filter((e) => e.batch_id === batch)
        .map((e) => e.period_label),
    ).toEqual(['2026-Q4']);
  });

  it('fee_period: monthly months stay separate; a one-time fee is billed exactly once', async () => {
    const monthly = await h.createBatch(T, { feePeriod: 'monthly' });
    const oneTime = await h.createBatch(T, {
      feeMinor: 500000,
      feePeriod: 'one_time',
    });
    const s = await h.makeUser('student', 'periods');
    await h.enroll(monthly, s.id);
    await h.enroll(oneTime, s.id);

    for (const month of ['2026-07', '2026-08']) {
      await generate(monthly, month);
      await generate(oneTime, month);
    }
    expect((await entriesFor(monthly)).map((r) => r.period_label)).toEqual([
      '2026-07',
      '2026-08',
    ]);
    expect((await entriesFor(oneTime)).map((r) => r.period_label)).toEqual([
      'one-time',
    ]);
  });

  it('an enormous amount is a validation error (400), never a 500', async () => {
    const batch = await h.createBatch(T);
    const s = await h.makeUser('student', 'huge');
    await h.enroll(batch, s.id);

    const gen = await generate(batch, '2026-12', undefined, {
      expectedMinor: 99_999_999_999,
    });
    expect(gen.status).toBe(400);
    expect(gen.body.code).toBe('VALIDATION_FAILED');
    expect(gen.body.message).toMatch(/too large/);

    await generate(batch, '2026-12');
    const [row] = await entriesFor(batch);
    const pay = await h.api('POST', `/fees/${row.id}/record-payment`, T.token, {
      body: { paidMinor: 1e12 },
    });
    expect(pay.status).toBe(400);

    const bigBatch = await h.api('POST', '/batches', T.token, {
      body: {
        title: 'huge fee',
        subjectId: h.subjectId,
        gradeLevelId: h.gradeLevelId,
        capacity: 10,
        feeMinor: 3_000_000_000,
      },
    });
    expect(bigBatch.status).toBe(400);
    for (const res of [gen, pay, bigBatch]) {
      expect(JSON.stringify(res.body)).not.toMatch(
        /fee_ledger|integer|SQL|22003/i,
      );
      expect(res.body.requestId).toEqual(expect.any(String));
    }
  });

  it('Individual and Academy totals stay isolated', async () => {
    const ind = await h.createBatch(T, { feeMinor: 11100 });
    const acad = await h.createBatch(T, { ctx: A.ctx, feeMinor: 22200 });
    const s = await h.makeUser('student', 'iso');
    await h.enroll(ind, s.id);
    await h.enroll(acad, s.id);
    await generate(ind, '2027-01');
    await generate(acad, '2027-01', A.ctx);

    const indTotals = await h.api(
      'GET',
      '/fees/period/totals?period=2027-01',
      T.token,
    );
    const acadTotals = await h.api(
      'GET',
      '/fees/period/totals?period=2027-01',
      T.token,
      { ctx: A.ctx },
    );
    expect(indTotals.body.expectedMinor).toBe(11100);
    expect(acadTotals.body.expectedMinor).toBe(22200);
    const indList = await h.api('GET', '/fees/period?period=2027-01', T.token);
    expect((indList.body as any[]).map((e) => e.batch_id)).toEqual([ind]);
  });
});
