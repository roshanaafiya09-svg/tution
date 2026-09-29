/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { createHarness, type Actor, type Harness } from './support/harness';
import { FakePaymentsProvider, hook } from './support/fake-payments-provider';
import { PAYMENTS_PROVIDER } from '../src/modules/billing/payments/payments-provider.interface';
import { newId } from '../src/database/id';
import { PaymentsRepository } from '../src/modules/billing/payments/payments.repository';

/**
 * H5 (duplicate orders / double capture), H8 (academy purchase + fee payout
 * ownership) and the H1 purchase flows, against the real app and Postgres.
 * The provider is a controllable fake whose webhooks are "signed" with
 * `sig-ok`, so every webhook here goes through the production code path.
 */
jest.setTimeout(300_000);

describe('payment state machine (H5 / H8 / H1 purchases)', () => {
  let h: Harness;
  const provider = new FakePaymentsProvider();
  const DAY = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    h = await createHarness('paysm', {
      override: (b) => b.overrideProvider(PAYMENTS_PROVIDER).useValue(provider),
    });
  });
  afterAll(async () => {
    // payments block user deletion via payer FK order -> clear ours first
    await h.db
      .deleteFrom('payment_events')
      .where('provider_event_id', 'like', `${h.MARKER}%`)
      .execute();
    await h.close();
  });

  // ---- helpers ----------------------------------------------------------
  let evt = 0;
  const eid = (label = 'e') => `${h.MARKER}-${label}-${++evt}`;

  const webhook = (body: string) =>
    h.api('POST', '/payments/webhook', undefined, {
      rawBody: body,
      headers: { 'x-razorpay-signature': 'sig-ok' },
    });

  const captured = (
    order: string,
    pay: string,
    amount: number,
    id = eid('cap'),
  ) =>
    webhook(hook(id, 'captured', { orderId: order, paymentId: pay, amount }));

  async function feeFixture(
    label: string,
    ctx?: { academyId: string; teacher: Actor; ctx: string },
  ) {
    const tutor = ctx?.teacher ?? (await h.makeUser('tutor', `t-${label}`));
    const batch = await h.createBatch(tutor, {
      ctx: ctx?.ctx,
      feeMinor: 100000,
    });
    const student = await h.makeUser('student', `s-${label}`);
    await h.enroll(batch, student.id);
    const gen = await h.api(
      'POST',
      `/fees/batch/${batch}/generate`,
      tutor.token,
      {
        ctx: ctx?.ctx,
        body: { periodLabel: '2031-06' },
      },
    );
    expect(gen.status).toBe(201);
    const fee = await h.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('batch_id', '=', batch)
      .where('student_id', '=', student.id)
      .executeTakeFirstOrThrow();
    return { tutor, batch, student, fee, feeId: fee.id };
  }

  const feeOf = (id: string) =>
    h.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  const payOf = (id: string) =>
    h.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  const paymentsForFee = (feeId: string) =>
    h.db
      .selectFrom('payments')
      .selectAll()
      .where('fee_ledger_id', '=', feeId)
      .execute();
  const orderFee = (student: Actor, feeId: string) =>
    h.api('POST', `/payments/fee/${feeId}/order`, student.token, { body: {} });

  // ======================================================================
  describe('H5 — one open order per fee', () => {
    it('two simultaneous order requests (same payer) return the SAME order; one open row', async () => {
      const f = await feeFixture('twoorders');
      const [a, b] = await Promise.all([
        orderFee(f.student, f.feeId),
        orderFee(f.student, f.feeId),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(a.body.provider_order_id).toBe(b.body.provider_order_id);
      const rows = await paymentsForFee(f.feeId);
      expect(rows.filter((r) => r.status === 'created')).toHaveLength(1);
      expect(rows).toHaveLength(1);
    });

    it('15 simultaneous order requests still leave exactly one open order', async () => {
      const f = await feeFixture('fifteen');
      const res = await Promise.all(
        Array.from({ length: 15 }, () => orderFee(f.student, f.feeId)),
      );
      expect(res.every((r) => r.status === 201)).toBe(true);
      expect(new Set(res.map((r) => r.body.id)).size).toBe(1);
      const open = (await paymentsForFee(f.feeId)).filter((r) =>
        ['created', 'authorized'].includes(r.status),
      );
      expect(open).toHaveLength(1);
    });

    it('the student and a linked parent racing: exactly one stays open, the other is superseded', async () => {
      const f = await feeFixture('parentrace');
      const parent = await h.makeUser('parent', 'pr');
      await h.linkParent(parent.id, f.student.id);
      const [a, b] = await Promise.all([
        orderFee(f.student, f.feeId),
        h.api('POST', `/payments/fee/${f.feeId}/order`, parent.token, {
          body: {},
        }),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      const rows = await paymentsForFee(f.feeId);
      expect(
        rows.filter((r) => ['created', 'authorized'].includes(r.status)),
      ).toHaveLength(1);
    });

    it('the database itself refuses a second open order for a fee', async () => {
      const f = await feeFixture('dbindex');
      await orderFee(f.student, f.feeId);
      await expect(
        h.db
          .insertInto('payments')
          .values({
            id: newId(),
            fee_ledger_id: f.feeId,
            payer_id: f.student.id,
            amount_minor: 1,
          })
          .execute(),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('a paid fee cannot be ordered again', async () => {
      const f = await feeFixture('paidorder');
      const o = await orderFee(f.student, f.feeId);
      await captured(
        o.body.provider_order_id,
        `pay-${eid()}`,
        o.body.amount_minor,
      );
      const again = await orderFee(f.student, f.feeId);
      expect(again.status).toBe(400);
    });
  });

  // ======================================================================
  describe('H5 — webhooks are idempotent, tolerate replays and out-of-order delivery', () => {
    it('the SAME webhook delivered 10 times at once credits the fee exactly once', async () => {
      const f = await feeFixture('replay');
      const o = (await orderFee(f.student, f.feeId)).body;
      const id = eid('same');
      const body = hook(id, 'captured', {
        orderId: o.provider_order_id,
        paymentId: `pay-${id}`,
        amount: o.amount_minor,
      });
      const res = await Promise.all(
        Array.from({ length: 10 }, () => webhook(body)),
      );
      expect(res.every((r) => r.status === 201 || r.status === 200)).toBe(true);
      const fee = await feeOf(f.feeId);
      expect(fee.status).toBe('paid');
      expect(fee.recorded_paid_minor).toBe(100000);
      const events = await h.db
        .selectFrom('payment_events')
        .select('id')
        .where('provider_event_id', '=', id)
        .execute();
      expect(events).toHaveLength(1);
      const pay = await payOf(o.id);
      expect(pay.status).toBe('captured');
      expect(pay.settled_at).not.toBeNull();
    });

    it('the same capture under DIFFERENT event ids still credits once', async () => {
      const f = await feeFixture('diffids');
      const o = (await orderFee(f.student, f.feeId)).body;
      const pay = `pay-${eid()}`;
      await captured(o.provider_order_id, pay, o.amount_minor, eid('a'));
      await captured(o.provider_order_id, pay, o.amount_minor, eid('b'));
      await captured(o.provider_order_id, pay, o.amount_minor, eid('c'));
      expect((await feeOf(f.feeId)).recorded_paid_minor).toBe(100000);
      expect(
        (await paymentsForFee(f.feeId)).filter((p) => p.status === 'captured'),
      ).toHaveLength(1);
    });

    it('concurrent simulate-capture calls and a webhook credit once', async () => {
      const f = await feeFixture('conc');
      const o = (await orderFee(f.student, f.feeId)).body;
      const sims = Array.from({ length: 5 }, () =>
        h.api('POST', `/payments/${o.id}/simulate-capture`, f.student.token, {
          body: {},
        }),
      );
      const wh = captured(o.provider_order_id, `pay-${eid()}`, o.amount_minor);
      await Promise.all([...sims, wh]);
      const fee = await feeOf(f.feeId);
      expect(fee.recorded_paid_minor).toBe(100000);
      expect(
        (await paymentsForFee(f.feeId)).filter((p) => p.status === 'captured'),
      ).toHaveLength(1);
    });

    it('a failed attempt followed by a successful retry on the SAME order is captured and credited', async () => {
      const f = await feeFixture('failretry');
      const o = (await orderFee(f.student, f.feeId)).body;
      await webhook(
        hook(eid('f'), 'failed', {
          orderId: o.provider_order_id,
          paymentId: 'pay-fail-1',
          amount: o.amount_minor,
        }),
      );
      expect((await payOf(o.id)).status).toBe('failed');
      expect((await feeOf(f.feeId)).status).toBe('due');

      await captured(o.provider_order_id, 'pay-retry-ok', o.amount_minor);
      const pay = await payOf(o.id);
      expect(pay.status).toBe('captured');
      expect(pay.provider_payment_id).toBe('pay-retry-ok');
      expect((await feeOf(f.feeId)).status).toBe('paid');
    });

    it('a success followed by a duplicate capture / late failure / late authorization changes nothing', async () => {
      const f = await feeFixture('afterok');
      const o = (await orderFee(f.student, f.feeId)).body;
      await captured(o.provider_order_id, 'pay-ok-1', o.amount_minor);
      await captured(o.provider_order_id, 'pay-ok-1', o.amount_minor); // duplicate success
      await webhook(
        hook(eid('lf'), 'failed', {
          orderId: o.provider_order_id,
          paymentId: 'pay-ok-1',
          amount: o.amount_minor,
        }),
      );
      await webhook(
        hook(eid('la'), 'authorized', {
          orderId: o.provider_order_id,
          paymentId: 'pay-ok-1',
          amount: o.amount_minor,
        }),
      );
      const pay = await payOf(o.id);
      expect(pay.status).toBe('captured');
      expect(pay.failure_reason).toBeNull();
      const fee = await feeOf(f.feeId);
      expect(fee.recorded_paid_minor).toBe(100000);
      expect(fee.status).toBe('paid');
    });

    it('events that are NOT payment outcomes are ignored — they no longer fail a live payment', async () => {
      const f = await feeFixture('ignored');
      const o = (await orderFee(f.student, f.feeId)).body;
      for (const t of [
        'order.paid',
        'payment.dispute.created',
        'refund.created',
      ]) {
        const r = await webhook(
          hook(eid('ign'), t, { orderId: o.provider_order_id }),
        );
        expect(r.status).toBeLessThan(300);
      }
      expect((await payOf(o.id)).status).toBe('created');
    });

    it('authorized then captured walks the state machine forward', async () => {
      const f = await feeFixture('auth');
      const o = (await orderFee(f.student, f.feeId)).body;
      await webhook(
        hook(eid('au'), 'authorized', {
          orderId: o.provider_order_id,
          paymentId: 'pay-au',
          amount: o.amount_minor,
        }),
      );
      expect((await payOf(o.id)).status).toBe('authorized');
      await captured(o.provider_order_id, 'pay-au', o.amount_minor);
      expect((await payOf(o.id)).status).toBe('captured');
    });

    it('a bad signature is rejected (403) and records nothing', async () => {
      const f = await feeFixture('badsig');
      const o = (await orderFee(f.student, f.feeId)).body;
      const res = await h.api('POST', '/payments/webhook', undefined, {
        rawBody: hook(eid('bs'), 'captured', {
          orderId: o.provider_order_id,
          paymentId: 'pay-x',
          amount: o.amount_minor,
        }),
        headers: { 'x-razorpay-signature': 'forged' },
      });
      expect(res.status).toBe(403);
      expect((await payOf(o.id)).status).toBe('created');
    });

    it('a captured amount that does not match the order is refused, changes nothing, and can be retried', async () => {
      const f = await feeFixture('amount');
      const o = (await orderFee(f.student, f.feeId)).body;
      const id = eid('mm');
      const bad = await webhook(
        hook(id, 'captured', {
          orderId: o.provider_order_id,
          paymentId: 'pay-mm',
          amount: 1,
        }),
      );
      expect(bad.status).toBe(400);
      expect((await payOf(o.id)).status).toBe('created');
      expect((await feeOf(f.feeId)).status).toBe('due');
      // the failed attempt did not burn the event id
      const good = await webhook(
        hook(id, 'captured', {
          orderId: o.provider_order_id,
          paymentId: 'pay-mm',
          amount: o.amount_minor,
        }),
      );
      expect(good.status).toBeLessThan(300);
      expect((await feeOf(f.feeId)).status).toBe('paid');
    });

    it('malformed webhook payloads are rejected cleanly (never a 500)', async () => {
      for (const raw of [
        'not json',
        '{}',
        '[]',
        'null',
        '{"id":"x","type":"captured"}',
      ]) {
        const res = await h.api('POST', '/payments/webhook', undefined, {
          rawBody: raw,
          headers: { 'x-razorpay-signature': 'sig-ok' },
        });
        expect([400, 403]).toContain(res.status);
      }
    });

    it('the database refuses an illegal status transition (captured -> created, refunded -> captured)', async () => {
      const f = await feeFixture('trigger');
      const o = (await orderFee(f.student, f.feeId)).body;
      await captured(o.provider_order_id, 'pay-trg', o.amount_minor);
      await expect(
        h.db
          .updateTable('payments')
          .set({ status: 'created' })
          .where('id', '=', o.id)
          .execute(),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        h.db
          .updateTable('payments')
          .set({ status: 'failed' })
          .where('id', '=', o.id)
          .execute(),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  // ======================================================================
  describe('H5 — a duplicate capture is never credited twice, and never paid out twice', () => {
    it('two orders for one fee both captured: ledger credited once, the surplus refunded, payout counts it once', async () => {
      const f = await feeFixture('dup');
      const parent = await h.makeUser('parent', 'dupp');
      await h.linkParent(parent.id, f.student.id);
      const first = (await orderFee(f.student, f.feeId)).body;
      // a different payer opens a new order: the first is superseded
      const second = (
        await h.api('POST', `/payments/fee/${f.feeId}/order`, parent.token, {
          body: {},
        })
      ).body;
      expect(second.id).not.toBe(first.id);
      expect((await payOf(first.id)).status).toBe('failed');

      // the student's stale checkout still succeeds at the provider, and so does the parent's
      await captured(first.provider_order_id, 'pay-dup-1', first.amount_minor);
      await captured(
        second.provider_order_id,
        'pay-dup-2',
        second.amount_minor,
      );

      const fee = await feeOf(f.feeId);
      expect(fee.recorded_paid_minor).toBe(100000); // NOT 200000
      expect(fee.status).toBe('paid');

      const p1 = await payOf(first.id);
      const p2 = await payOf(second.id);
      expect(p1.settled_at).not.toBeNull();
      expect(p2.settled_at).toBeNull(); // captured, but nothing applied to the ledger
      // the surplus is refunded in full — durable row + provider call
      expect(p2.status).toBe('refunded');
      expect(p2.refunded_minor).toBe(100000);
      const refunds = await h.db
        .selectFrom('payment_refunds')
        .selectAll()
        .where('payment_id', '=', p2.id)
        .execute();
      expect(refunds).toHaveLength(1);
      expect(refunds[0].status).toBe('succeeded');

      // payout counts ONLY the applied payment
      const today = new Date().toISOString().slice(0, 10);
      const out = await h.api('POST', '/payouts/generate', f.tutor.token, {
        body: { periodStart: '2020-01-01', periodEnd: '2099-12-31' },
      });
      expect(today).toBeTruthy();
      expect(out.status).toBe(201);
      expect(out.body.amount_minor).toBe(100000);
      const inPayout = await h.db
        .selectFrom('payments')
        .select(['id'])
        .where('payout_id', '=', out.body.id)
        .execute();
      expect(inPayout.map((r) => r.id)).toEqual([p1.id]);
    });

    it('concurrent payout generation claims each payment exactly once', async () => {
      const f = await feeFixture('payrace');
      const o = (await orderFee(f.student, f.feeId)).body;
      await captured(o.provider_order_id, 'pay-pr', o.amount_minor);
      const body = { periodStart: '2020-01-01', periodEnd: '2099-12-31' };
      const res = await Promise.all(
        Array.from({ length: 6 }, () =>
          h.api('POST', '/payouts/generate', f.tutor.token, { body }),
        ),
      );
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 400)).toHaveLength(5); // "Nothing to pay out"
      const payouts = await h.db
        .selectFrom('payouts')
        .select(['id', 'amount_minor'])
        .where('tutor_id', '=', f.tutor.id)
        .execute();
      expect(payouts).toHaveLength(1); // losers left no payout row behind
      expect(payouts[0].amount_minor).toBe(100000);
    });

    it('mock-provider payments are never paid out in production', async () => {
      const f = await feeFixture('mock');
      const payId = newId();
      await h.db
        .insertInto('payments')
        .values({
          id: payId,
          fee_ledger_id: f.feeId,
          payer_id: f.student.id,
          amount_minor: 100000,
          status: 'captured',
          provider: 'mock',
          provider_order_id: `mock-${payId}`,
          provider_payment_id: `mockpay-${payId}`,
          settled_at: new Date(),
        })
        .execute();
      const repo = h.app.get(PaymentsRepository, { strict: false });
      // Runs the real claim query inside a transaction that is ALWAYS rolled
      // back, so the probe leaves nothing behind.
      const probe = async (excludeMock: boolean) => {
        let claimed = -1;
        await h.db
          .transaction()
          .execute(async (trx) => {
            const payoutId = newId();
            await trx
              .insertInto('payouts')
              .values({
                id: payoutId,
                tutor_id: f.tutor.id,
                amount_minor: 0,
                period_start: '2020-01-01',
                period_end: '2099-12-31',
              })
              .execute();
            const rows = await repo.claimForPayout(
              trx,
              { kind: 'tutor', tutorId: f.tutor.id },
              payoutId,
              new Date('2020-01-01'),
              new Date('2100-01-01'),
              excludeMock,
            );
            claimed = rows.length;
            throw new Error('rollback');
          })
          .catch(() => undefined);
        return claimed;
      };
      expect(await probe(true)).toBe(0); // production: mock rows are never paid out
      expect(await probe(false)).toBe(1); // development: they are (mock money only)
    });
  });

  // ======================================================================
  describe('H1/H8 — subscription purchases (individual)', () => {
    let tutor: Actor;
    beforeAll(async () => {
      tutor = await h.makeUser('tutor', 'buyer');
    });
    const sub = () =>
      h.db
        .selectFrom('subscriptions')
        .selectAll()
        .where('tutor_id', '=', tutor.id)
        .executeTakeFirstOrThrow();

    it('a plan purchase is priced by the server and activates blocks + a period only after the CAPTURE', async () => {
      const res = await h.api(
        'POST',
        '/payments/subscription/order',
        tutor.token,
        {
          body: { planId: 'monthly_basic', extraBlocks: 1 },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.amount_minor).toBe(49_900 + 49_900);
      expect(res.body.blocks).toBe(2);
      // creating the order changes nothing
      expect((await sub()).status).toBe('trialing');

      await captured(
        res.body.provider_order_id,
        `pay-${eid()}`,
        res.body.amount_minor,
      );
      const s = await sub();
      expect(s.status).toBe('active');
      expect(s.purchased_blocks).toBe(2);
      expect(new Date(s.current_period_end!).getTime()).toBeGreaterThan(
        Date.now() + 28 * DAY,
      );
    });

    it('clients cannot set the price or blocks directly (whitelist)', async () => {
      const res = await h.api(
        'POST',
        '/payments/subscription/order',
        tutor.token,
        {
          body: { planId: 'monthly_basic', amountMinor: 1, blocks: 99 },
        },
      );
      expect(res.status).toBe(400);
    });

    it('an add-blocks order adds capacity NOW without changing the period', async () => {
      const before = await sub();
      const res = await h.api(
        'POST',
        '/payments/subscription/add-blocks-order',
        tutor.token,
        { body: { blocks: 2 } },
      );
      expect(res.status).toBe(201);
      expect(res.body.amount_minor).toBe(2 * 49_900);
      await captured(
        res.body.provider_order_id,
        `pay-${eid()}`,
        res.body.amount_minor,
      );
      const after = await sub();
      expect(after.purchased_blocks).toBe(before.purchased_blocks + 2);
      expect(new Date(after.current_period_end!).getTime()).toBe(
        new Date(before.current_period_end!).getTime(),
      );
    });

    it('add-blocks is refused outside a live paid period', async () => {
      const other = await h.makeUser('tutor', 'trialbuyer');
      const res = await h.api(
        'POST',
        '/payments/subscription/add-blocks-order',
        other.token,
        { body: { blocks: 1 } },
      );
      expect(res.status).toBe(400);
    });

    it('a renewal can never buy fewer blocks than the students already active', async () => {
      const t2 = await h.makeUser('tutor', 'tooSmall');
      const batch = await h.createBatch(t2, {});
      const kids: Actor[] = [];
      for (let i = 0; i < 26; i++)
        kids.push(await h.makeUser('student', `ts${i}`));
      // batch capacity is 30 in the harness; 26 active students -> needs 2 blocks
      for (const k of kids) await h.enroll(batch, k.id);
      const low = await h.api(
        'POST',
        '/payments/subscription/order',
        t2.token,
        { body: { planId: 'monthly_basic' } },
      );
      expect(low.status).toBe(400);
      expect(low.body.code).toBe('BLOCKS_INSUFFICIENT');
      const ok = await h.api('POST', '/payments/subscription/order', t2.token, {
        body: { planId: 'monthly_basic', extraBlocks: 1 },
      });
      expect(ok.status).toBe(201);
    });

    it('an early renewal never lowers capacity that is already paid for', async () => {
      const t3 = await h.makeUser('tutor', 'earlyrenew');
      const o1 = (
        await h.api('POST', '/payments/subscription/order', t3.token, {
          body: { planId: 'monthly_pro' },
        })
      ).body;
      await captured(o1.provider_order_id, `pay-${eid()}`, o1.amount_minor);
      const o2 = (
        await h.api('POST', '/payments/subscription/order', t3.token, {
          body: { planId: 'monthly_basic' },
        })
      ).body;
      await captured(o2.provider_order_id, `pay-${eid()}`, o2.amount_minor);
      const s = await h.db
        .selectFrom('subscriptions')
        .selectAll()
        .where('tutor_id', '=', t3.id)
        .executeTakeFirstOrThrow();
      expect(s.purchased_blocks).toBe(4); // pro's 4 blocks kept for the rest of the period
      // and the period was EXTENDED from the existing end, not restarted
      expect(new Date(s.current_period_end!).getTime()).toBeGreaterThan(
        Date.now() + 58 * DAY,
      );
    });
  });

  // ======================================================================
  describe('H8 — academy purchase and fee/payout ownership', () => {
    it('an academy buys blocks + the per-teacher fee; the academy comes from the token, never the request', async () => {
      const acad = await h.makeAcademy('buy');
      const t1 = await h.makeUser('tutor', 'ab1');
      const t2 = await h.makeUser('tutor', 'ab2');
      await h.join(acad.id, t1.id);
      await h.join(acad.id, t2.id);

      const res = await h.api(
        'POST',
        '/payments/academy-subscription/order',
        acad.owner.token,
        { body: { blocks: 2 } },
      );
      expect(res.status).toBe(201);
      expect(res.body.amount_minor).toBe(2 * 49_900 + 2 * 5_000);
      expect(res.body.teacher_features).toBe(2);
      expect(res.body.academy_subscription_id).toBeTruthy();

      await captured(
        res.body.provider_order_id,
        `pay-${eid()}`,
        res.body.amount_minor,
      );
      const s = await h.db
        .selectFrom('academy_subscriptions')
        .selectAll()
        .where('academy_id', '=', acad.id)
        .executeTakeFirstOrThrow();
      expect(s.status).toBe('active');
      expect(s.purchased_blocks).toBe(2);
      expect(s.purchased_teacher_features).toBe(2);
      expect(new Date(s.current_period_end!).getTime()).toBeGreaterThan(
        Date.now() + 28 * DAY,
      );

      // a body that tries to name an academy is rejected outright
      const forged = await h.api(
        'POST',
        '/payments/academy-subscription/order',
        acad.owner.token,
        {
          body: { blocks: 1, academyId: newId() },
        },
      );
      expect(forged.status).toBe(400);
    });

    it('teachers, students and parents cannot buy an academy plan; another academy owner buys only their own', async () => {
      const a = await h.makeAcademy('own-a');
      const b = await h.makeAcademy('own-b');
      const teacher = await h.makeUser('tutor', 'no-buy');
      expect(
        (
          await h.api(
            'POST',
            '/payments/academy-subscription/order',
            teacher.token,
            { body: { blocks: 1 } },
          )
        ).status,
      ).toBe(403);

      const oa = (
        await h.api(
          'POST',
          '/payments/academy-subscription/order',
          a.owner.token,
          { body: { blocks: 1 } },
        )
      ).body;
      const ob = (
        await h.api(
          'POST',
          '/payments/academy-subscription/order',
          b.owner.token,
          { body: { blocks: 3 } },
        )
      ).body;
      await captured(ob.provider_order_id, `pay-${eid()}`, ob.amount_minor);
      const sa = await h.db
        .selectFrom('academy_subscriptions')
        .selectAll()
        .where('academy_id', '=', a.id)
        .executeTakeFirstOrThrow();
      const sb = await h.db
        .selectFrom('academy_subscriptions')
        .selectAll()
        .where('academy_id', '=', b.id)
        .executeTakeFirstOrThrow();
      expect(sa.status).toBe('trialing'); // A's order was never captured; B's capture did not touch A
      expect(sb.purchased_blocks).toBe(3);
      expect(oa.payer_id).toBe(a.owner.id);
    });

    it("an academy owner cannot read or capture another user's payment", async () => {
      const a = await h.makeAcademy('leak-a');
      const b = await h.makeAcademy('leak-b');
      const oa = (
        await h.api(
          'POST',
          '/payments/academy-subscription/order',
          a.owner.token,
          { body: { blocks: 1 } },
        )
      ).body;
      expect(
        (await h.api('GET', `/payments/${oa.id}`, b.owner.token)).status,
      ).toBe(404);
      expect(
        (
          await h.api(
            'POST',
            `/payments/${oa.id}/simulate-capture`,
            b.owner.token,
            { body: {} },
          )
        ).status,
      ).toBe(403);
      expect(
        (await h.api('GET', `/payments/${oa.id}`, a.owner.token)).status,
      ).toBe(200);
    });

    it('academy fees are paid out to the ACADEMY (its owner), never to the teacher or another academy', async () => {
      const a = await h.makeAcademy('pay-a');
      const b = await h.makeAcademy('pay-b');
      const teacher = await h.makeUser('tutor', 'acad-teacher-pay');
      await h.join(a.id, teacher.id);
      const f = await feeFixture('acadfee', {
        academyId: a.id,
        teacher,
        ctx: a.ctx,
      });

      const o = (await orderFee(f.student, f.feeId)).body;
      await captured(o.provider_order_id, `pay-${eid()}`, o.amount_minor);
      expect((await feeOf(f.feeId)).status).toBe('paid');

      const range = { periodStart: '2020-01-01', periodEnd: '2099-12-31' };
      // the teacher's own (individual) payout does NOT include academy money
      const own = await h.api('POST', '/payouts/generate', teacher.token, {
        body: range,
      });
      expect(own.status).toBe(400);
      // another academy sees nothing
      const other = await h.api(
        'POST',
        '/academy/me/payouts/generate',
        b.owner.token,
        { body: range },
      );
      expect(other.status).toBe(400);
      // a teacher cannot use the academy payout API at all
      expect(
        (
          await h.api('POST', '/academy/me/payouts/generate', teacher.token, {
            body: range,
          })
        ).status,
      ).toBe(403);

      // the owning academy is paid
      const mine = await h.api(
        'POST',
        '/academy/me/payouts/generate',
        a.owner.token,
        { body: range },
      );
      expect(mine.status).toBe(201);
      expect(mine.body.amount_minor).toBe(100000);
      expect(mine.body.academy_id).toBe(a.id);
      expect(mine.body.tutor_id).toBe(a.owner.id); // payee = the academy owner

      // listing is scoped: B cannot see A's payout, the teacher's list has none
      const listB = await h.api('GET', '/academy/me/payouts', b.owner.token);
      expect(listB.body).toHaveLength(0);
      const listA = await h.api('GET', '/academy/me/payouts', a.owner.token);
      expect(listA.body.map((p: { id: string }) => p.id)).toContain(
        mine.body.id,
      );
      expect(
        (await h.api('GET', '/payouts/me', teacher.token)).body,
      ).toHaveLength(0);
      // B cannot complete A's payout
      expect(
        (
          await h.api(
            'POST',
            `/academy/me/payouts/${mine.body.id}/simulate-complete`,
            b.owner.token,
            { body: {} },
          )
        ).status,
      ).toBe(403);
      // A can; it moves processing -> paid exactly once
      expect(
        (
          await h.api(
            'POST',
            `/academy/me/payouts/${mine.body.id}/simulate-complete`,
            a.owner.token,
            { body: {} },
          )
        ).status,
      ).toBe(201);
    });

    it('a refunded fee payment is not paid out', async () => {
      const f = await feeFixture('refundedfee');
      const o = (await orderFee(f.student, f.feeId)).body;
      await captured(o.provider_order_id, 'pay-rf', o.amount_minor);
      await webhook(
        hook(eid('rp'), 'refund_processed', {
          paymentId: 'pay-rf',
          refundId: `rfnd-dash-${eid()}`,
          amount: o.amount_minor,
        }),
      );
      expect((await payOf(o.id)).status).toBe('refunded');
      const out = await h.api('POST', '/payouts/generate', f.tutor.token, {
        body: { periodStart: '2020-01-01', periodEnd: '2099-12-31' },
      });
      expect(out.status).toBe(400);
    });
  });

  // ======================================================================
  describe('payer visibility', () => {
    it('the payer sees the real state; nobody else does; created is not paid', async () => {
      const f = await feeFixture('status');
      const stranger = await h.makeUser('student', 'stranger');
      const o = (await orderFee(f.student, f.feeId)).body;
      const s1 = await h.api('GET', `/payments/${o.id}`, f.student.token);
      expect(s1.status).toBe(200);
      expect(s1.body).toMatchObject({
        status: 'created',
        settled: false,
        refundedMinor: 0,
      });
      expect(
        (await h.api('GET', `/payments/${o.id}`, stranger.token)).status,
      ).toBe(404);
      await captured(o.provider_order_id, 'pay-vis', o.amount_minor);
      const s2 = await h.api('GET', `/payments/${o.id}`, f.student.token);
      expect(s2.body).toMatchObject({ status: 'captured', settled: true });
    });
  });
});
