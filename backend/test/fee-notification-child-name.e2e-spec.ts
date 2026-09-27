/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { newId } from '../src/database/id';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Parent-facing fee notices name the child — real HTTP, real Postgres.
 *
 *   P1 (two children: Aisha + Rahul, both in the tutor's Individual batch,
 *       Rahul also in an Academy batch)
 *   P2 (one child: Meera, Academy batch only)
 *   P3 (unrelated parent, child in another tutor's batch)
 *   P4 (PENDING, unconsented link to Aisha)
 */
jest.setTimeout(300_000);

const IST = 'Asia/Kolkata';

describe('Fee notifications name the child (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor;
  let T2: Actor;
  let aisha: Actor;
  let rahul: Actor;
  let meera: Actor;
  let other: Actor;
  let P1: Actor;
  let P2: Actor;
  let P3: Actor;
  let P4: Actor;
  let iBatch: string;
  let aBatch: string;
  let oBatch: string;
  const period = DateTime.now().setZone(IST).toFormat('yyyy-MM');

  const notes = async (u: Actor, type: string) =>
    (await h.notificationsFor(u.id, type)) as Array<{
      payload: Record<string, any>;
    }>;
  const forFee = async (u: Actor, type: string, feeId: string) =>
    (await notes(u, type)).filter((n) => n.payload.feeLedgerId === feeId);
  const generate = (batchId: string, tutor: Actor, ctx?: string) =>
    h.api('POST', `/fees/batch/${batchId}/generate`, tutor.token, {
      ctx,
      body: { periodLabel: period },
    });

  let aishaFee: string;
  let rahulFee: string;
  let meeraFee: string;

  beforeAll(async () => {
    h = await createHarness('fc');
    A = await h.makeAcademy('a');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    await h.join(A.id, T1.id);
    aisha = await h.makeUser('student', 'aisha');
    rahul = await h.makeUser('student', 'rahul');
    meera = await h.makeUser('student', 'meera');
    other = await h.makeUser('student', 'other');
    for (const [u, name] of [
      [aisha, 'Aisha Raman'],
      [rahul, 'Rahul Raman'],
      [meera, 'Meera Iyer'],
      [other, 'Zoya Khan'],
    ] as const) {
      await h.db
        .updateTable('profiles_student')
        .set({ display_name: name })
        .where('user_id', '=', u.id)
        .execute();
    }
    P1 = await h.makeUser('parent', 'p1');
    P2 = await h.makeUser('parent', 'p2');
    P3 = await h.makeUser('parent', 'p3');
    P4 = await h.makeUser('parent', 'p4');
    await h.linkParent(P1.id, aisha.id);
    await h.linkParent(P1.id, rahul.id);
    await h.linkParent(P2.id, meera.id);
    await h.linkParent(P3.id, other.id);
    await h.db
      .insertInto('parent_child_links')
      .values({
        id: newId(),
        parent_id: P4.id,
        student_id: aisha.id,
        status: 'pending',
      })
      .execute();
    iBatch = await h.createBatch(T1, { title: 'Mathematics' });
    aBatch = await h.createBatch(T1, { ctx: A.ctx, title: 'Academy Science' });
    oBatch = await h.createBatch(T2, { title: 'Other Tutor Batch' });
    await h.enroll(iBatch, aisha.id);
    await h.enroll(iBatch, rahul.id);
    await h.enroll(aBatch, meera.id);
    await h.enroll(oBatch, other.id);
  });

  afterAll(async () => {
    if (h) {
      // payments.payer_id references users (no ON DELETE action).
      await h.db
        .deleteFrom('payments')
        .where('payer_id', 'in', (eb) =>
          eb
            .selectFrom('users')
            .select('id')
            .where('email', 'like', `${h.MARKER}-%`),
        )
        .execute();
    }
    await h?.close();
  });

  it('fee raised: a two-child parent gets one notice per child, each naming the right child', async () => {
    const ind = await generate(iBatch, T1);
    expect(ind.status).toBe(201);
    aishaFee = ind.body.find((f: any) => f.student_id === aisha.id).id;
    rahulFee = ind.body.find((f: any) => f.student_id === rahul.id).id;
    const acad = await generate(aBatch, T1, A.ctx);
    meeraFee = acad.body.find((f: any) => f.student_id === meera.id).id;
    await generate(oBatch, T2);

    const rows = await notes(P1, 'fee_raised');
    expect(rows).toHaveLength(2);
    const byFee = Object.fromEntries(
      rows.map((r) => [r.payload.feeLedgerId, r]),
    );
    expect(byFee[aishaFee].payload.title).toBe(
      'Fee due for Aisha Raman — Mathematics',
    );
    expect(byFee[aishaFee].payload.studentId).toBe(aisha.id);
    expect(byFee[rahulFee].payload.title).toBe(
      'Fee due for Rahul Raman — Mathematics',
    );
    expect(byFee[rahulFee].payload.studentId).toBe(rahul.id);
    // never another child's name
    expect(byFee[aishaFee].payload.title).not.toContain('Rahul');
    expect(byFee[rahulFee].payload.title).not.toContain('Aisha');
    // the two titles are distinguishable
    expect(byFee[aishaFee].payload.title).not.toBe(
      byFee[rahulFee].payload.title,
    );
  });

  it('a single-child parent also gets the child named', async () => {
    const rows = await forFee(P2, 'fee_raised', meeraFee);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.title).toBe(
      'Fee due for Meera Iyer — Academy Science',
    );
    expect(await notes(P2, 'fee_raised')).toHaveLength(1);
  });

  it('the student keeps their original wording', async () => {
    for (const [u, feeId, batch] of [
      [aisha, aishaFee, 'Mathematics'],
      [rahul, rahulFee, 'Mathematics'],
      [meera, meeraFee, 'Academy Science'],
    ] as const) {
      const rows = await forFee(u, 'fee_raised', feeId);
      expect(rows).toHaveLength(1);
      expect(rows[0].payload.title).toBe(`Fee due — ${batch}`);
      expect(rows[0].payload.title).not.toContain(' for ');
    }
  });

  it('regenerating the period does not duplicate anything', async () => {
    await generate(iBatch, T1);
    await generate(aBatch, T1, A.ctx);
    expect(await notes(P1, 'fee_raised')).toHaveLength(2);
    expect(await notes(P2, 'fee_raised')).toHaveLength(1);
    expect(await notes(aisha, 'fee_raised')).toHaveLength(1);
  });

  it('payment recorded: partial then full name the right child; the other child is untouched', async () => {
    const pay = (feeId: string, paidMinor: number) =>
      h.api('POST', `/fees/${feeId}/record-payment`, T1.token, {
        body: { paidMinor },
      });
    const fee = await h.db
      .selectFrom('fee_ledger')
      .select('expected_minor')
      .where('id', '=', aishaFee)
      .executeTakeFirstOrThrow();
    expect((await pay(aishaFee, 100)).status).toBe(201);
    expect((await pay(aishaFee, fee.expected_minor)).status).toBe(201);

    const titles = (await forFee(P1, 'fee_payment_recorded', aishaFee))
      .map((n) => n.payload.title)
      .sort();
    expect(titles).toEqual([
      'Fee paid for Aisha Raman — Mathematics',
      'Payment received for Aisha Raman — Mathematics',
    ]);
    expect(await forFee(P1, 'fee_payment_recorded', rahulFee)).toHaveLength(0);
    // student copy unchanged
    expect(
      (await forFee(aisha, 'fee_payment_recorded', aishaFee))
        .map((n) => n.payload.title)
        .sort(),
    ).toEqual(['Fee paid — Mathematics', 'Payment received — Mathematics']);
  });

  it('fee waived names the right child', async () => {
    const res = await h.api('POST', `/fees/${rahulFee}/waive`, T1.token, {
      body: {},
    });
    expect(res.status).toBe(201);
    const rows = await forFee(P1, 'fee_waived', rahulFee);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.title).toBe(
      'Fee waived for Rahul Raman — Mathematics',
    );
    expect(rows[0].payload.studentId).toBe(rahul.id);
    expect(await notes(P1, 'fee_waived')).toHaveLength(1);
    expect((await forFee(rahul, 'fee_waived', rahulFee))[0].payload.title).toBe(
      'Fee waived — Mathematics',
    );
  });

  it('an online payment names the child for the OTHER family members, not the payer', async () => {
    // Meera has a second linked parent who pays online.
    const P5 = await h.makeUser('parent', 'p5');
    await h.linkParent(P5.id, meera.id);
    const order = await h.api(
      'POST',
      `/payments/fee/${meeraFee}/order`,
      P5.token,
    );
    expect(order.status).toBe(201);
    const payment = await h.db
      .selectFrom('payments')
      .selectAll()
      .where('fee_ledger_id', '=', meeraFee)
      .executeTakeFirstOrThrow();
    const cap = await h.api(
      'POST',
      `/payments/${payment.id}/simulate-capture`,
      P5.token,
    );
    expect(cap.status).toBe(201);
    const rows = await forFee(P2, 'fee_payment_recorded', meeraFee);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.title).toBe(
      'Fee paid for Meera Iyer — Academy Science',
    );
    expect(await forFee(P5, 'fee_payment_recorded', meeraFee)).toHaveLength(0);
    // the teacher's own notice is unchanged (they see their own batch title)
    expect(
      (await forFee(T1, 'fee_payment_recorded', meeraFee))[0].payload.title,
    ).toBe('Payment received — Academy Science');
  });

  it('isolation: each parent only ever sees their own child; unrelated/pending parents get nothing', async () => {
    const feeTypes = ['fee_raised', 'fee_payment_recorded', 'fee_waived'];
    const allNames = ['Aisha', 'Rahul', 'Meera', 'Zoya'];
    const seen = async (u: Actor) =>
      (await Promise.all(feeTypes.map((t) => notes(u, t)))).flat();

    const p1 = await seen(P1);
    for (const n of p1) {
      const sid = n.payload.studentId;
      expect([aisha.id, rahul.id]).toContain(sid);
      const own = sid === aisha.id ? 'Aisha' : 'Rahul';
      for (const name of allNames.filter((x) => x !== own)) {
        expect(n.payload.title).not.toContain(name);
        expect(n.payload.body).not.toContain(name);
      }
    }
    const p2 = await seen(P2);
    expect(p2.length).toBeGreaterThan(0);
    for (const n of p2) {
      expect(n.payload.studentId).toBe(meera.id);
      expect(n.payload.title).toContain('Meera Iyer');
    }
    // P3's child belongs to an unrelated tutor: only Zoya's fee.
    const p3 = await seen(P3);
    expect(p3).toHaveLength(1);
    expect(p3[0].payload.title).toBe(
      'Fee due for Zoya Khan — Other Tutor Batch',
    );
    // pending link: nothing at all
    expect(await seen(P4)).toHaveLength(0);
  });

  it('privacy: the notice carries only the display name — no contact details or extra ids', async () => {
    const [n] = await forFee(P1, 'fee_raised', aishaFee);
    const text = JSON.stringify(n.payload);
    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/\+91\d/);
    expect(Object.keys(n.payload).sort()).toEqual(
      ['batchId', 'body', 'feeLedgerId', 'studentId', 'title'].sort(),
    );
  });
});
