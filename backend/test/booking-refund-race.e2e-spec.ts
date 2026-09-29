/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { createHarness, type Actor, type Harness } from './support/harness';
import { FakePaymentsProvider, hook } from './support/fake-payments-provider';
import { PAYMENTS_PROVIDER } from '../src/modules/billing/payments/payments-provider.interface';
import { PaymentRefundsService } from '../src/modules/billing/payments/payment-refunds.service';
import { newId } from '../src/database/id';

/**
 * H10 — a booking cancellation / refund must produce exactly ONE real refund
 * however many requests race, however often the provider is told, and even if
 * the provider's answer is lost to a timeout.
 */
jest.setTimeout(300_000);

describe('booking cancellation and refund are race-safe and idempotent (H10)', () => {
  let h: Harness;
  const provider = new FakePaymentsProvider();
  let refunds: PaymentRefundsService;
  const AMOUNT = 60_000;

  beforeAll(async () => {
    h = await createHarness('bkrf', {
      override: (b) => b.overrideProvider(PAYMENTS_PROVIDER).useValue(provider),
    });
    refunds = h.app.get(PaymentRefundsService, { strict: false });
  });
  afterAll(async () => {
    await h.db
      .deleteFrom('payment_events')
      .where('provider_event_id', 'like', `${h.MARKER}%`)
      .execute();
    await h.close();
  });
  beforeEach(() => {
    provider.refundCalls = 0;
    provider.refundMode = 'none';
  });

  let n = 0;
  const eid = () => `${h.MARKER}-e${++n}`;
  const webhook = (body: string) =>
    h.api('POST', '/payments/webhook', undefined, {
      rawBody: body,
      headers: { 'x-razorpay-signature': 'sig-ok' },
    });

  /** A booking that is PAID and confirmed, `hoursAhead` from now. */
  async function paidBooking(label: string, hoursAhead = 72) {
    const tutor = await h.makeUser('tutor', `t-${label}`);
    const student = await h.makeUser('student', `s-${label}`);
    const id = newId();
    await h.db
      .insertInto('bookings')
      .values({
        id,
        tutor_id: tutor.id,
        student_id: student.id,
        subject_id: h.subjectId,
        hourly_rate_minor: AMOUNT,
        amount_minor: AMOUNT,
        currency: 'INR',
        scheduled_start_utc: new Date(Date.now() + hoursAhead * 3_600_000),
        duration_min: 60,
      })
      .execute();
    const order = await h.api(
      'POST',
      `/payments/booking/${id}/order`,
      student.token,
      { body: {} },
    );
    expect(order.status).toBe(201);
    const cap = await webhook(
      hook(eid(), 'captured', {
        orderId: order.body.provider_order_id,
        paymentId: `pay-${id.slice(-8)}`,
        amount: AMOUNT,
      }),
    );
    expect(cap.status).toBeLessThan(300);
    return {
      tutor,
      student,
      id,
      paymentId: order.body.id as string,
      providerPaymentId: `pay-${id.slice(-8)}`,
    };
  }

  const booking = (id: string) =>
    h.db
      .selectFrom('bookings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  const payment = (id: string) =>
    h.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  const refundRows = (paymentId: string) =>
    h.db
      .selectFrom('payment_refunds')
      .selectAll()
      .where('payment_id', '=', paymentId)
      .execute();
  const cancel = (who: Actor, id: string) =>
    h.api('POST', `/marketplace/bookings/${id}/cancel`, who.token, {
      body: {},
    });
  const refund = (who: Actor, id: string) =>
    h.api('POST', `/payments/booking/${id}/refund`, who.token, { body: {} });

  // ======================================================================
  it('20 simultaneous cancellations: exactly one takes effect, the rest are 409', async () => {
    const b = await paidBooking('cancel20');
    expect((await booking(b.id)).status).toBe('confirmed');
    const res = await Promise.all(
      Array.from({ length: 20 }, () => cancel(b.student, b.id)),
    );
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    const rejected = res.filter((r) => r.status !== 201);
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.status === 409)).toBe(true);
    expect(
      rejected.every((r) => r.body.code === 'BOOKING_ALREADY_TERMINAL'),
    ).toBe(true);
    const row = await booking(b.id);
    expect(row.status).toBe('cancelled');
    expect(row.refund_percent).toBe(100); // 72h notice
  });

  it('20 simultaneous refund requests produce ONE refund, ONE provider call and identical answers', async () => {
    const b = await paidBooking('refund20');
    expect((await cancel(b.student, b.id)).status).toBe(201);

    const res = await Promise.all(
      Array.from({ length: 20 }, () => refund(b.student, b.id)),
    );
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect(new Set(res.map((r) => r.body.refundId)).size).toBe(1);
    expect(res.every((r) => r.body.refundAmountMinor === AMOUNT)).toBe(true);

    const rows = await refundRows(b.paymentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('succeeded');
    expect(provider.refundCalls).toBe(1); // ONE real refund at the provider
    const p = await payment(b.paymentId);
    expect(p.refunded_minor).toBe(AMOUNT);
    expect(p.status).toBe('refunded');
  });

  it('a refund repeated later is a no-op returning the same result (already refunded)', async () => {
    const b = await paidBooking('repeat');
    await cancel(b.student, b.id);
    const first = await refund(b.student, b.id);
    const calls = provider.refundCalls;
    const again = await refund(b.student, b.id);
    expect(again.status).toBe(201);
    expect(again.body.refundId).toBe(first.body.refundId);
    expect(provider.refundCalls).toBe(calls); // the provider was not asked again
    expect(await refundRows(b.paymentId)).toHaveLength(1);
  });

  it('duplicate refund webhooks change nothing', async () => {
    const b = await paidBooking('refundhook');
    await cancel(b.student, b.id);
    const first = await refund(b.student, b.id);
    const before = await payment(b.paymentId);
    const evt = eid();
    const body = hook(evt, 'refund_processed', {
      paymentId: b.providerPaymentId,
      refundId: first.body.refundId,
      amount: AMOUNT,
    });
    await Promise.all([webhook(body), webhook(body), webhook(body)]); // same event
    await webhook(
      hook(eid(), 'refund_processed', {
        paymentId: b.providerPaymentId,
        refundId: first.body.refundId,
        amount: AMOUNT,
      }),
    ); // a fresh event id for the SAME refund
    const after = await payment(b.paymentId);
    expect(after.refunded_minor).toBe(before.refunded_minor);
    expect(after.status).toBe('refunded');
    expect(await refundRows(b.paymentId)).toHaveLength(1);
  });

  // ---- timeout / retry ---------------------------------------------------
  it('provider CREATED the refund but the call timed out: recovered by receipt, never refunded twice', async () => {
    const b = await paidBooking('timeoutafter');
    await cancel(b.student, b.id);
    provider.refundMode = 'timeout-after-create';
    const res = await refund(b.student, b.id);
    expect(res.status).toBe(201); // recovered inside the same call
    expect(provider.refundCalls).toBe(1);
    expect(provider.createdRefunds.size).toBeGreaterThanOrEqual(1);
    const rows = await refundRows(b.paymentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('succeeded');
    expect(rows[0].provider_refund_id).toBe(
      provider.createdRefunds.get(rows[0].id),
    );
    // and asking again does not create another
    const again = await refund(b.student, b.id);
    expect(again.body.refundId).toBe(res.body.refundId);
    expect(provider.refundCalls).toBe(1);
  });

  it('provider did NOT create it (ambiguous timeout): 503 pending, retry succeeds, exactly one refund exists', async () => {
    const b = await paidBooking('timeoutbefore');
    await cancel(b.student, b.id);
    provider.refundMode = 'timeout-before-create';
    const createdBefore = provider.createdRefunds.size;
    const first = await refund(b.student, b.id);
    expect(first.status).toBe(503);
    let rows = await refundRows(b.paymentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending'); // amount stays reserved
    expect((await payment(b.paymentId)).refunded_minor).toBe(0);

    const retry = await refund(b.student, b.id);
    expect(retry.status).toBe(201);
    rows = await refundRows(b.paymentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('succeeded');
    expect(provider.createdRefunds.size - createdBefore).toBe(1); // exactly one real refund
    expect((await payment(b.paymentId)).refunded_minor).toBe(AMOUNT);
  });

  it('a provider rejection marks the refund failed, releases its amount, and a later retry can succeed', async () => {
    const b = await paidBooking('reject');
    await cancel(b.student, b.id);
    provider.refundMode = 'reject';
    const first = await refund(b.student, b.id);
    expect(first.status).toBe(400);
    let rows = await refundRows(b.paymentId);
    expect(rows[0].status).toBe('failed');
    expect((await payment(b.paymentId)).refunded_minor).toBe(0);
    const retry = await refund(b.student, b.id);
    expect(retry.status).toBe(201);
    rows = await refundRows(b.paymentId);
    expect(rows).toHaveLength(1); // same idempotency key, same row
    expect(rows[0].status).toBe('succeeded');
  });

  // ---- amounts -----------------------------------------------------------
  it('a partial refund is deterministic (50% notice), leaves the payment captured, and cannot be exceeded', async () => {
    const b = await paidBooking('partial', 10); // 6h..24h => 50%
    expect((await cancel(b.student, b.id)).status).toBe(201);
    expect((await booking(b.id)).refund_percent).toBe(50);

    const r = await refund(b.student, b.id);
    expect(r.status).toBe(201);
    expect(r.body.refundAmountMinor).toBe(30_000);
    let p = await payment(b.paymentId);
    expect(p.refunded_minor).toBe(30_000);
    expect(p.status).toBe('captured'); // only partly refunded

    // the remaining half can be refunded once...
    const rest = await refunds.refund({
      paymentId: b.paymentId,
      amountMinor: 30_000,
      idempotencyKey: `manual-rest-${b.id}`,
      reason: 'goodwill',
    });
    expect(rest.payment.status).toBe('refunded');
    expect(rest.payment.refunded_minor).toBe(AMOUNT);

    // ...and NOTHING more, whatever the key
    await expect(
      refunds.refund({
        paymentId: b.paymentId,
        amountMinor: 1,
        idempotencyKey: `manual-extra-${b.id}`,
        reason: 'x',
      }),
    ).rejects.toMatchObject({ status: 409 }); // payment already fully refunded
    p = await payment(b.paymentId);
    expect(p.refunded_minor).toBe(AMOUNT);
  });

  it('a refund larger than what was captured is refused (service AND database)', async () => {
    const b = await paidBooking('over');
    await expect(
      refunds.refund({
        paymentId: b.paymentId,
        amountMinor: AMOUNT + 1,
        idempotencyKey: `over-${b.id}`,
        reason: 'x',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'REFUND_EXCEEDS_CAPTURED' },
    });
    // even a direct insert cannot exceed the captured amount
    await expect(
      h.db
        .insertInto('payment_refunds')
        .values({
          id: newId(),
          payment_id: b.paymentId,
          amount_minor: AMOUNT + 1,
          reason: 'x',
          idempotency_key: `db-over-${b.id}`,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23514' });
    expect(provider.refundCalls).toBe(0);
  });

  it('two concurrent partial refunds that together exceed the payment: only what fits is accepted', async () => {
    const b = await paidBooking('concpartial');
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        refunds.refund({
          paymentId: b.paymentId,
          amountMinor: 20_000,
          idempotencyKey: `cp-${b.id}-${i}`,
          reason: 'x',
        }),
      ),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled');
    expect(ok).toHaveLength(3); // 3 x 20_000 = 60_000, the captured amount
    const p = await payment(b.paymentId);
    expect(p.refunded_minor).toBe(AMOUNT);
    expect(p.status).toBe('refunded');
  });

  it('the same idempotency key with a different payment is refused', async () => {
    const a = await paidBooking('keya');
    const c = await paidBooking('keyb');
    await refunds.refund({
      paymentId: a.paymentId,
      amountMinor: 1000,
      idempotencyKey: `shared-${a.id}`,
      reason: 'x',
    });
    await expect(
      refunds.refund({
        paymentId: c.paymentId,
        amountMinor: 1000,
        idempotencyKey: `shared-${a.id}`,
        reason: 'x',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  // ---- terminal states ----------------------------------------------------
  it('cancelling after another terminal state is a 409 and changes nothing', async () => {
    const done = await paidBooking('completed');
    expect(
      (
        await h.api(
          'POST',
          `/marketplace/bookings/${done.id}/complete`,
          done.tutor.token,
          { body: {} },
        )
      ).status,
    ).toBe(201);
    const c1 = await cancel(done.student, done.id);
    expect(c1.status).toBe(409);
    expect((await booking(done.id)).status).toBe('completed');

    const noshow = await paidBooking('noshow');
    expect(
      (
        await h.api(
          'POST',
          `/marketplace/bookings/${noshow.id}/no-show`,
          noshow.tutor.token,
          { body: {} },
        )
      ).status,
    ).toBe(201);
    expect((await cancel(noshow.student, noshow.id)).status).toBe(409);
    expect((await booking(noshow.id)).status).toBe('no_show');
  });

  it('completing or no-showing a CANCELLED booking is a 409 (was a 500)', async () => {
    const b = await paidBooking('cancelthencomplete');
    await cancel(b.student, b.id);
    expect(
      (
        await h.api(
          'POST',
          `/marketplace/bookings/${b.id}/complete`,
          b.tutor.token,
          { body: {} },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await h.api(
          'POST',
          `/marketplace/bookings/${b.id}/no-show`,
          b.tutor.token,
          { body: {} },
        )
      ).status,
    ).toBe(409);
    expect((await booking(b.id)).status).toBe('cancelled');
  });

  it('a booking that is already cancelled cannot be cancelled again', async () => {
    const b = await paidBooking('twice');
    expect((await cancel(b.tutor, b.id)).status).toBe(201);
    expect((await cancel(b.student, b.id)).status).toBe(409);
  });

  // ---- not refundable ----------------------------------------------------
  it('refund preconditions: not cancelled, zero-percent, wrong student', async () => {
    const live = await paidBooking('notcancelled');
    const r1 = await refund(live.student, live.id);
    expect(r1.status).toBe(400);
    expect(r1.body.code).toBe('BOOKING_NOT_REFUNDABLE');

    const late = await paidBooking('late', 2); // < 6h => 0%
    expect((await cancel(late.student, late.id)).status).toBe(201);
    expect((await booking(late.id)).refund_percent).toBe(0);
    const r2 = await refund(late.student, late.id);
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe('BOOKING_NOT_REFUNDABLE');

    const other = await h.makeUser('student', 'not-owner');
    await cancel(live.tutor, live.id);
    expect((await refund(other, live.id)).status).toBe(403);
    expect(provider.refundCalls).toBe(0);
  });

  it('a tutor cancelling always gives the student 100%, even at short notice', async () => {
    const b = await paidBooking('tutorcancel', 2);
    expect((await cancel(b.tutor, b.id)).status).toBe(201);
    expect((await booking(b.id)).refund_percent).toBe(100);
    const r = await refund(b.student, b.id);
    expect(r.body.refundAmountMinor).toBe(AMOUNT);
  });

  // ---- payment landing on a cancelled booking ------------------------------
  it('money captured for a booking cancelled while the student was at checkout is refunded automatically', async () => {
    const tutor = await h.makeUser('tutor', 't-atcheckout');
    const student = await h.makeUser('student', 's-atcheckout');
    const id = newId();
    await h.db
      .insertInto('bookings')
      .values({
        id,
        tutor_id: tutor.id,
        student_id: student.id,
        subject_id: h.subjectId,
        hourly_rate_minor: AMOUNT,
        amount_minor: AMOUNT,
        currency: 'INR',
        scheduled_start_utc: new Date(Date.now() + 72 * 3_600_000),
        duration_min: 60,
      })
      .execute();
    const order = (
      await h.api('POST', `/payments/booking/${id}/order`, student.token, {
        body: {},
      })
    ).body;
    // student cancels the still-unpaid booking...
    expect((await cancel(student, id)).status).toBe(201);
    // ...then their card payment lands
    const cap = await webhook(
      hook(eid(), 'captured', {
        orderId: order.provider_order_id,
        paymentId: 'pay-late',
        amount: AMOUNT,
      }),
    );
    expect(cap.status).toBeLessThan(300);

    expect((await booking(id)).status).toBe('cancelled'); // NOT resurrected
    const p = await payment(order.id);
    expect(p.settled_at).toBeNull(); // nothing was bought
    expect(p.status).toBe('refunded'); // and the money went straight back
    expect(p.refunded_minor).toBe(AMOUNT);
    expect(await refundRows(order.id)).toHaveLength(1);
  });
});
