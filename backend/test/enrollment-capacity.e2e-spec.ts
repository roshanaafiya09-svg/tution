/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { createHarness, type Actor, type Harness } from './support/harness';
import { newId } from '../src/database/id';
import { SubscriptionCapacityService } from '../src/modules/billing/subscriptions/subscription-capacity.service';

/**
 * H9 (batch capacity) + H1 (25-student block billing). Real HTTP, real
 * Postgres, real concurrency: every "simultaneous" test fires requests with
 * Promise.all against the running app and then reads the database.
 */
jest.setTimeout(300_000);

describe('enrollment capacity and student-block billing (H9 + H1)', () => {
  let h: Harness;
  let capacity: SubscriptionCapacityService;
  const DAY = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    h = await createHarness('encap');
    capacity = h.app.get(SubscriptionCapacityService, { strict: false });
  });
  afterAll(async () => {
    await h.close();
  });

  // ---- helpers ---------------------------------------------------------
  async function batchFor(tutor: Actor, capacityN: number, ctx?: string) {
    const res = await h.api('POST', '/batches', tutor.token, {
      ctx,
      body: {
        title: `B ${newId().slice(-6)}`,
        subjectId: h.subjectId,
        gradeLevelId: h.gradeLevelId,
        capacity: capacityN,
        feeMinor: 1000,
      },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function inviteFor(tutor: Actor, batchId: string, ctx?: string) {
    const res = await h.api('POST', `/invites/batch/${batchId}`, tutor.token, {
      ctx,
      body: { maxUses: 200 },
    });
    expect(res.status).toBe(201);
    return res.body.token as string;
  }

  const redeem = (token: string, student: Actor) =>
    h.api('POST', `/invites/${token}/redeem`, student.token, { body: {} });

  async function students(n: number, label: string) {
    const out: Actor[] = [];
    for (let i = 0; i < n; i++)
      out.push(await h.makeUser('student', `${label}${i}`));
    return out;
  }

  const activeIn = async (batchId: string) =>
    Number(
      (
        await h.db
          .selectFrom('enrollments')
          .select((eb) => eb.fn.countAll().as('c'))
          .where('batch_id', '=', batchId)
          .where('status', '=', 'active')
          .executeTakeFirstOrThrow()
      ).c,
    );

  const inviteUses = async (token: string) =>
    (
      await h.db
        .selectFrom('invites')
        .select('used_count')
        .where('token', '=', token)
        .executeTakeFirstOrThrow()
    ).used_count;

  /** Puts a tutor on a PAID subscription with `blocks` of capacity. */
  async function paidTutor(tutorId: string, blocks: number, periodDays = 30) {
    await h.db
      .insertInto('subscriptions')
      .values({
        id: newId(),
        tutor_id: tutorId,
        status: 'active',
        plan_id: blocks >= 4 ? 'monthly_pro' : 'monthly_basic',
        trial_ends_at: new Date(Date.now() - DAY),
        current_period_end: new Date(Date.now() + periodDays * DAY),
        purchased_blocks: blocks,
      })
      .onConflict((oc) =>
        oc.column('tutor_id').doUpdateSet({
          status: 'active',
          plan_id: blocks >= 4 ? 'monthly_pro' : 'monthly_basic',
          trial_ends_at: new Date(Date.now() - DAY),
          current_period_end: new Date(Date.now() + periodDays * DAY),
          purchased_blocks: blocks,
        }),
      )
      .execute();
  }

  const setBlocks = (tutorId: string, blocks: number) =>
    h.db
      .updateTable('subscriptions')
      .set({ purchased_blocks: blocks })
      .where('tutor_id', '=', tutorId)
      .execute();

  // ======================================================================
  describe('H9 — a batch can never exceed its capacity', () => {
    let tutor: Actor;
    beforeAll(async () => {
      tutor = await h.makeUser('tutor', 'cap-tutor');
    });

    it('capacity 3, 3 simultaneous valid enrollments -> all 3 succeed', async () => {
      const batch = await batchFor(tutor, 3);
      const token = await inviteFor(tutor, batch);
      const kids = await students(3, 'c3a');
      const res = await Promise.all(kids.map((k) => redeem(token, k)));
      expect(res.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(await activeIn(batch)).toBe(3);
    });

    it('capacity 3, 15 simultaneous enrollments -> exactly 3, no orphan rows, no burned invite uses', async () => {
      const batch = await batchFor(tutor, 3);
      const token = await inviteFor(tutor, batch);
      const kids = await students(15, 'c15');
      const res = await Promise.all(kids.map((k) => redeem(token, k)));

      const ok = res.filter((r) => r.status === 201);
      const rejected = res.filter((r) => r.status !== 201);
      expect(ok).toHaveLength(3);
      expect(rejected).toHaveLength(12);
      expect(rejected.every((r) => r.status === 400)).toBe(true);
      expect(rejected.every((r) => r.body.code === 'BATCH_FULL')).toBe(true);

      expect(await activeIn(batch)).toBe(3);
      // rejected requests left NO enrollment row at all
      const rows = await h.db
        .selectFrom('enrollments')
        .select('id')
        .where('batch_id', '=', batch)
        .execute();
      expect(rows).toHaveLength(3);
      // ...and did not consume an invite use (the claim rolled back with them)
      expect(await inviteUses(token)).toBe(3);
    });

    it('the same student redeeming 10x at once creates ONE enrollment and consumes ONE use', async () => {
      const batch = await batchFor(tutor, 5);
      const token = await inviteFor(tutor, batch);
      const [kid] = await students(1, 'dup');
      const res = await Promise.all(
        Array.from({ length: 10 }, () => redeem(token, kid)),
      );
      expect(res.every((r) => r.status === 201)).toBe(true);
      expect(await activeIn(batch)).toBe(1);
      expect(await inviteUses(token)).toBe(1);
    });

    it('removing a student frees the seat; a left student can rejoin when there is room', async () => {
      const batch = await batchFor(tutor, 2);
      const token = await inviteFor(tutor, batch);
      const [a, b, c] = await students(3, 'free');
      expect((await redeem(token, a)).status).toBe(201);
      expect((await redeem(token, b)).status).toBe(201);
      expect((await redeem(token, c)).status).toBe(400); // full

      const removed = await h.api(
        'DELETE',
        `/batches/${batch}/students/${a.id}`,
        tutor.token,
      );
      expect(removed.status).toBeLessThan(300);
      expect((await redeem(token, c)).status).toBe(201); // seat reused
      expect(await activeIn(batch)).toBe(2);
      expect((await redeem(token, a)).status).toBe(400); // a is out, batch full again
    });

    it('concurrent removal + enrollment never corrupts capacity', async () => {
      const batch = await batchFor(tutor, 3);
      const token = await inviteFor(tutor, batch);
      const inside = await students(3, 'in');
      for (const s of inside) expect((await redeem(token, s)).status).toBe(201);
      const outside = await students(6, 'out');

      const ops: Promise<unknown>[] = [
        ...inside.map((s) =>
          h.api('DELETE', `/batches/${batch}/students/${s.id}`, tutor.token),
        ),
        ...outside.map((s) => redeem(token, s)),
      ];
      await Promise.all(ops);
      const n = await activeIn(batch);
      expect(n).toBeLessThanOrEqual(3);
      expect(n).toBeGreaterThanOrEqual(0);
      // and the invariant still holds for anyone who tries afterwards
      const late = await students(5, 'late');
      await Promise.all(late.map((s) => redeem(token, s)));
      expect(await activeIn(batch)).toBeLessThanOrEqual(3);
    });

    it('database backstop: a direct insert cannot exceed capacity either', async () => {
      const batch = await batchFor(tutor, 2);
      const kids = await students(3, 'db');
      await h.enroll(batch, kids[0].id);
      await h.enroll(batch, kids[1].id);
      await expect(h.enroll(batch, kids[2].id)).rejects.toMatchObject({
        code: '23514',
      });
      expect(await activeIn(batch)).toBe(2);
    });

    it('archived batches cannot take students', async () => {
      const batch = await batchFor(tutor, 5);
      const token = await inviteFor(tutor, batch);
      const [kid] = await students(1, 'arch');
      expect(
        (await h.api('POST', `/batches/${batch}/archive`, tutor.token)).status,
      ).toBeLessThan(300);
      const res = await redeem(token, kid);
      expect(res.status).toBe(400);
      expect(await activeIn(batch)).toBe(0);
    });
  });

  // ======================================================================
  describe('H1 — 25-student blocks (individual teacher)', () => {
    let tutor: Actor;
    let batchA: string;
    let batchB: string;
    let tokenA: string;
    let tokenB: string;
    const roster: Actor[] = [];

    beforeAll(async () => {
      tutor = await h.makeUser('tutor', 'blk-tutor');
      batchA = await batchFor(tutor, 100);
      batchB = await batchFor(tutor, 100);
      tokenA = await inviteFor(tutor, batchA);
      tokenB = await inviteFor(tutor, batchB);
      await paidTutor(tutor.id, 1);
      roster.push(...(await students(60, 'blk')));
    });

    const usage = () => capacity.getUsage({ kind: 'tutor', tutorId: tutor.id });

    it('students 1..24 fill the first block; the 25th still succeeds', async () => {
      for (let i = 0; i < 24; i++) await h.enroll(batchA, roster[i].id);
      expect((await usage()).activeStudents).toBe(24);
      const res = await redeem(tokenA, roster[24]);
      expect(res.status).toBe(201);
      const u = await usage();
      expect(u.activeStudents).toBe(25);
      expect(u.blocksRequired).toBe(1);
      expect(u.freeSlots).toBe(0);
    });

    it('the 26th student FAILS without a second block (402), and nothing is written', async () => {
      const res = await redeem(tokenA, roster[25]);
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('BLOCK_CAPACITY_EXCEEDED');
      expect(res.body.message).toMatch(/26/);
      expect((await usage()).activeStudents).toBe(25);
      expect(await inviteUses(tokenA)).toBe(1); // only the 25th consumed a use
    });

    it('an already-counted student in a second batch needs no extra capacity', async () => {
      const res = await redeem(tokenB, roster[0]); // student 0 is already one of the 25
      expect(res.status).toBe(201);
      expect((await usage()).activeStudents).toBe(25);
    });

    it('the 26th succeeds once a second block is purchased; the 50th succeeds; the 51st fails', async () => {
      await setBlocks(tutor.id, 2);
      expect((await redeem(tokenA, roster[25])).status).toBe(201); // 26th
      for (let i = 26; i < 49; i++) await h.enroll(batchA, roster[i].id);
      expect((await usage()).activeStudents).toBe(49);
      expect((await redeem(tokenA, roster[49])).status).toBe(201); // 50th
      const u = await usage();
      expect(u.activeStudents).toBe(50);
      expect(u.blocksRequired).toBe(2);
      expect((await redeem(tokenA, roster[50])).status).toBe(402); // 51st
    });

    it('a third block admits the 51st', async () => {
      await setBlocks(tutor.id, 3);
      expect((await redeem(tokenA, roster[50])).status).toBe(201);
      const u = await usage();
      expect(u.activeStudents).toBe(51);
      expect(u.blocksRequired).toBe(3);
    });

    it('a student leaving lowers the blocks REQUIRED for next period, but nothing is refunded mid-cycle', async () => {
      // 51 active on 3 purchased blocks. Drop to 50 -> next period needs 2.
      await h.api(
        'DELETE',
        `/batches/${batchA}/students/${roster[50].id}`,
        tutor.token,
      );
      const u = await usage();
      expect(u.activeStudents).toBe(50);
      expect(u.blocksRequired).toBe(2);
      // the block already paid for this period is still there (no refund,
      // no capacity taken away)
      expect(u.purchasedBlocks).toBe(3);
      expect(u.capacityStudents).toBe(75);
      const row = await h.db
        .selectFrom('subscriptions')
        .select(['purchased_blocks', 'status'])
        .where('tutor_id', '=', tutor.id)
        .executeTakeFirstOrThrow();
      expect(row.purchased_blocks).toBe(3);
      expect(row.status).toBe('active');
      // and the next-period quote is sized from real usage: 2 blocks, not 3
      expect(u.renewalQuote.kind).toBe('individual');
      if (u.renewalQuote.kind === 'individual') {
        expect(u.renewalQuote.monthly.totalBlocks).toBe(2);
        expect(u.renewalQuote.monthly.amountMinor).toBe(99_800); // basic + 1 extra block
      }
    });

    it('freed paid capacity is REUSED inside the same period with no new charge', async () => {
      const before = await h.db
        .selectFrom('payments')
        .select((eb) => eb.fn.countAll().as('c'))
        .where('payer_id', '=', tutor.id)
        .executeTakeFirstOrThrow();
      // a NEW student takes the freed seat: allowed with no purchase
      expect((await redeem(tokenA, roster[51])).status).toBe(201);
      expect((await usage()).activeStudents).toBe(51);
      const after = await h.db
        .selectFrom('payments')
        .select((eb) => eb.fn.countAll().as('c'))
        .where('payer_id', '=', tutor.id)
        .executeTakeFirstOrThrow();
      expect(Number(after.c)).toBe(Number(before.c));
    });

    it('concurrent enrollment cannot oversell the paid blocks (even across different batches)', async () => {
      // exactly 3 blocks = 75 seats. Fill to 74, then race 12 new students
      // split over both batches: only ONE may get in.
      const racers = await students(12, 'race');
      await setBlocks(tutor.id, 3);
      const filler = await students(75 - 51 - 1, 'fill');
      for (const f of filler) await h.enroll(batchB, f.id);
      expect((await usage()).activeStudents).toBe(74);

      const res = await Promise.all(
        racers.map((r, i) => redeem(i % 2 === 0 ? tokenA : tokenB, r)),
      );
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 402)).toHaveLength(11);
      expect((await usage()).activeStudents).toBe(75);
    });
  });

  // ======================================================================
  describe('H1 — subscription state gates creation, never reads', () => {
    let tutor: Actor;
    let batch: string;
    let token: string;

    beforeAll(async () => {
      tutor = await h.makeUser('tutor', 'gate-tutor');
      batch = await batchFor(tutor, 50);
      token = await inviteFor(tutor, batch);
    });

    it('during the trial, capacity is unrestricted (existing behaviour preserved)', async () => {
      const kids = await students(30, 'trial');
      for (const k of kids) await h.enroll(batch, k.id);
      const [extra] = await students(1, 'trialx');
      expect((await redeem(token, extra)).status).toBe(201);
      const u = await capacity.getUsage({ kind: 'tutor', tutorId: tutor.id });
      expect(u.status).toBe('trialing');
      expect(u.capacityStudents).toBeNull();
      expect(u.activeStudents).toBe(31);
    });

    it('an EXPIRED subscription blocks gated creation actions with 402...', async () => {
      await h.db
        .updateTable('subscriptions')
        .set({
          status: 'active',
          current_period_end: new Date(Date.now() - DAY),
          purchased_blocks: 2,
        })
        .where('tutor_id', '=', tutor.id)
        .execute();

      const [newcomer] = await students(1, 'exp');
      const tomorrow = new Date(Date.now() + 2 * DAY)
        .toISOString()
        .slice(0, 16);
      const attempts = await Promise.all([
        h.api('POST', '/batches', tutor.token, {
          body: {
            title: 'x',
            subjectId: h.subjectId,
            gradeLevelId: h.gradeLevelId,
            capacity: 5,
            feeMinor: 1,
          },
        }),
        h.api('POST', '/sessions', tutor.token, {
          body: {
            batchId: batch,
            startLocal: tomorrow,
            durationMin: 30,
            timezone: 'UTC',
          },
        }),
        h.api('POST', `/invites/batch/${batch}`, tutor.token, { body: {} }),
        h.api('POST', `/announcements/batch/${batch}`, tutor.token, {
          body: { body: 'hi' },
        }),
        h.api('POST', '/materials/upload-url', tutor.token, {
          body: {
            batchId: batch,
            title: 't',
            mime: 'application/pdf',
            sizeBytes: 100,
          },
        }),
        redeem(token, newcomer),
      ]);
      expect(attempts.map((a) => a.status)).toEqual([
        402, 402, 402, 402, 402, 402,
      ]);
      expect(await activeIn(batch)).toBe(31); // nothing enrolled
    });

    it('...while reading (and renewing) stays possible', async () => {
      const reads = await Promise.all([
        h.api('GET', '/batches/me', tutor.token),
        h.api('GET', `/batches/${batch}/students`, tutor.token),
        h.api('GET', '/subscriptions/recap', tutor.token),
      ]);
      expect(reads.every((r) => r.status === 200)).toBe(true);
    });

    it('a renewed subscription re-opens the gate', async () => {
      await paidTutor(tutor.id, 2);
      const [newcomer] = await students(1, 'renew');
      expect((await redeem(token, newcomer)).status).toBe(201);
    });

    it('cancelled / past_due subscriptions are also blocked', async () => {
      for (const status of ['cancelled', 'past_due'] as const) {
        await h.db
          .updateTable('subscriptions')
          .set({ status })
          .where('tutor_id', '=', tutor.id)
          .execute();
        const [k] = await students(1, `st${status}`);
        expect((await redeem(token, k)).status).toBe(402);
      }
      await paidTutor(tutor.id, 2);
    });
  });

  // ======================================================================
  describe('H1 — academy blocks are separate from individual teachers', () => {
    it("an academy has its own 25-student blocks; its students never count against a teacher's own plan", async () => {
      const academy = await h.makeAcademy('blocks');
      const teacher = await h.makeUser('tutor', 'acad-teacher');
      await h.join(academy.id, teacher.id);

      // Academy on a paid plan with ONE block
      await h.db
        .insertInto('academy_subscriptions')
        .values({
          id: newId(),
          academy_id: academy.id,
          status: 'active',
          plan_id: 'academy_monthly',
          trial_ends_at: new Date(Date.now() - DAY),
          current_period_end: new Date(Date.now() + 30 * DAY),
          purchased_blocks: 1,
        })
        .execute();

      const aBatch = await batchFor(teacher, 100, academy.ctx);
      const aToken = await inviteFor(teacher, aBatch, academy.ctx);
      const kids = await students(26, 'ac');
      for (let i = 0; i < 24; i++) await h.enroll(aBatch, kids[i].id);
      expect((await redeem(aToken, kids[24])).status).toBe(201); // 25th
      const over = await redeem(aToken, kids[25]);
      expect(over.status).toBe(402);
      expect(over.body.code).toBe('BLOCK_CAPACITY_EXCEEDED');

      // the teacher's OWN individual plan is unaffected (still a trial, none counted)
      const own = await capacity.getUsage({
        kind: 'tutor',
        tutorId: teacher.id,
      });
      expect(own.activeStudents).toBe(0);
      const acad = await capacity.getUsage({
        kind: 'academy',
        academyId: academy.id,
      });
      expect(acad.activeStudents).toBe(25);
      expect(acad.purchasedBlocks).toBe(1);
      expect(acad.renewalQuote.kind).toBe('academy');
    });

    it('an academy whose plan expired cannot take students or create classes', async () => {
      const academy = await h.makeAcademy('expired');
      const teacher = await h.makeUser('tutor', 'acad-exp');
      await h.join(academy.id, teacher.id);
      const aBatch = await batchFor(teacher, 10, academy.ctx);
      const aToken = await inviteFor(teacher, aBatch, academy.ctx);
      await h.db
        .updateTable('academy_subscriptions')
        .set({ status: 'trialing', trial_ends_at: new Date(Date.now() - DAY) })
        .where('academy_id', '=', academy.id)
        .execute();
      const [kid] = await students(1, 'acexp');
      expect((await redeem(aToken, kid)).status).toBe(402);
      const inv = await h.api(
        'POST',
        `/academy/me/batches/${aBatch}/invites`,
        academy.owner.token,
        { body: {} },
      );
      expect(inv.status).toBe(402);
    });
  });
});
