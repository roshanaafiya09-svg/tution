/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { newId } from '../src/database/id';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Remediation of the five partially-connected features — real HTTP, real
 * Postgres, real JWTs.
 *
 *  1  Remove student   — removed students lose the batch's messaging; history stays
 *  3  Calendar         — /holidays/me is context- and student-scoped; parent schedule;
 *                        one timezone rule across every schedule API
 *  4  Notifications    — announcement→parents, fees, verification outcomes,
 *                        deleted/removed recipients never notified, dedupe intact
 *  5  Assessment       — completion follows the CURRENT required roster
 *
 * (Academy cancel/reschedule → teacher, class-created and substitute notices
 * are covered by their own suites.)
 */
jest.setTimeout(300_000);

const IST = 'Asia/Kolkata';

describe('Five-feature remediation (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual + member of A
  let T3: Actor; // member of B
  let S1: Actor; // in iBatch + aBatch (removed from aBatch in the removal flow)
  let S2: Actor; // in aBatch
  let S3: Actor; // in bBatch (Academy B)
  let SI: Actor; // Individual batch only
  let P1: Actor; // parent of S1
  let P2: Actor; // parent of S2
  let P3: Actor; // parent of S3
  let PI: Actor; // parent of SI
  let iBatch: string;
  let aBatch: string;
  let aBatch2: string;
  let aBatch3: string;
  let bBatch: string;
  const holidayIds: string[] = [];
  const day = (plus: number) =>
    DateTime.now().setZone(IST).plus({ days: plus }).toISODate()!;

  const notes = async (u: Actor, type: string) =>
    (await h.notificationsFor(u.id, type)) as Array<{
      payload: Record<string, any>;
    }>;
  const messageCount = async (batchId: string, studentId: string) =>
    Number(
      (
        await h.db
          .selectFrom('messages')
          .select((eb) => eb.fn.countAll().as('c'))
          .where('batch_id', '=', batchId)
          .where('student_id', '=', studentId)
          .executeTakeFirstOrThrow()
      ).c,
    );
  const thread = (u: Actor, batchId: string, studentId: string) =>
    h.api('GET', `/messages/batch/${batchId}/student/${studentId}`, u.token);
  const say = (u: Actor, batchId: string, studentId: string, body = 'hello') =>
    h.api('POST', `/messages/batch/${batchId}/student/${studentId}`, u.token, {
      body: { body },
    });

  beforeAll(async () => {
    h = await createHarness('ff');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T3 = await h.makeUser('tutor', 't3');
    await h.join(A.id, T1.id);
    await h.join(B.id, T3.id);
    S1 = await h.makeUser('student', 's1');
    S2 = await h.makeUser('student', 's2');
    S3 = await h.makeUser('student', 's3');
    SI = await h.makeUser('student', 'si');
    P1 = await h.makeUser('parent', 'p1');
    P2 = await h.makeUser('parent', 'p2');
    P3 = await h.makeUser('parent', 'p3');
    PI = await h.makeUser('parent', 'pi');
    await h.linkParent(P1.id, S1.id);
    await h.linkParent(P2.id, S2.id);
    await h.linkParent(P3.id, S3.id);
    await h.linkParent(PI.id, SI.id);
    iBatch = await h.createBatch(T1, { title: 'Individual Physics' });
    aBatch = await h.createBatch(T1, {
      ctx: A.ctx,
      title: 'Academy Chemistry',
    });
    aBatch2 = await h.createBatch(T1, { ctx: A.ctx, title: 'Academy Biology' });
    bBatch = await h.createBatch(T3, { ctx: B.ctx, title: 'Academy B Maths' });
    await h.enroll(iBatch, S1.id);
    await h.enroll(aBatch, S1.id);
    await h.enroll(aBatch, S2.id);
    await h.enroll(bBatch, S3.id);
    await h.enroll(iBatch, SI.id);
  });

  afterAll(async () => {
    if (holidayIds.length) {
      await h?.db
        .deleteFrom('holidays')
        .where('id', 'in', holidayIds)
        .execute();
    }
    // messages.sender_id / student_id reference users
    const users = [S1, S2, S3, SI, P1, P2, P3, PI, T1, T3].filter(Boolean);
    if (h && users.length) {
      await h.db
        .deleteFrom('messages')
        .where((eb) =>
          eb.or([
            eb(
              'student_id',
              'in',
              users.map((u) => u.id),
            ),
            eb(
              'sender_id',
              'in',
              users.map((u) => u.id),
            ),
          ]),
        )
        .execute();
    }
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

  // ==================================================================
  // 1. REMOVE STUDENT
  // ==================================================================
  describe('1: a removed student loses the batch messaging, history stays', () => {
    let pastSession: string;

    it('1-2 an active student, their parent and the teacher can read and post', async () => {
      expect((await thread(S1, aBatch, S1.id)).status).toBe(200);
      expect((await say(S1, aBatch, S1.id, 'sir, a doubt')).status).toBe(201);
      expect((await say(T1, aBatch, S1.id, 'sure')).status).toBe(201);
      expect((await thread(P1, aBatch, S1.id)).status).toBe(200);
      expect((await say(P1, aBatch, S1.id, 'thanks')).status).toBe(201);
      // Academy context does not matter for messaging access — enrolment does.
      const inbox = await h.api('GET', '/messages/mine', S1.token);
      expect(inbox.body.map((t: any) => t.batch_id)).toContain(aBatch);
    });

    it('a student can only ever use their OWN id in the thread (direct-ID guard)', async () => {
      expect((await thread(S1, aBatch, S2.id)).status).toBe(403);
      expect((await say(S1, aBatch, S2.id)).status).toBe(403);
      expect((await thread(S3, aBatch, S3.id)).status).toBe(403); // not enrolled here
    });

    it('history exists before removal: a past class with attendance', async () => {
      pastSession = await h.scheduleAt(
        T1,
        aBatch,
        new Date(Date.now() - 3 * 24 * 3600_000),
        { ctx: A.ctx },
      );
      await h.db
        .insertInto('attendance')
        .values({
          id: newId(),
          session_id: pastSession,
          student_id: S1.id,
          status: 'present',
          marked_by: T1.id,
          method: 'manual',
        })
        .execute();
    });

    it('3-9 after removal the student and parent are rejected on GET and POST; no message row is written', async () => {
      const removed = await h.api(
        'DELETE',
        `/batches/${aBatch}/students/${S1.id}`,
        T1.token,
        { ctx: A.ctx },
      );
      expect(removed.status).toBe(200);

      const before = await messageCount(aBatch, S1.id);
      expect((await thread(S1, aBatch, S1.id)).status).toBe(403);
      expect((await say(S1, aBatch, S1.id, 'let me back in')).status).toBe(403);
      expect((await thread(P1, aBatch, S1.id)).status).toBe(403);
      expect((await say(P1, aBatch, S1.id, 'hello?')).status).toBe(403);
      expect(await messageCount(aBatch, S1.id)).toBe(before);
    });

    it('the teacher can still READ the kept history but cannot post to a removed student', async () => {
      const res = await thread(T1, aBatch, S1.id);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
      expect((await say(T1, aBatch, S1.id)).status).toBe(403);
    });

    it("the removed batch drops out of the student's and parent's inbox; other enrolments stay", async () => {
      // A message in the still-active Individual batch.
      expect((await say(S1, iBatch, S1.id, 'physics doubt')).status).toBe(201);
      const inbox = await h.api('GET', '/messages/mine', S1.token);
      const batchIds = inbox.body.map((t: any) => t.batch_id);
      expect(batchIds).toContain(iBatch);
      expect(batchIds).not.toContain(aBatch);
      const parentInbox = await h.api('GET', '/messages/mine', P1.token);
      expect(parentInbox.body.map((t: any) => t.batch_id)).not.toContain(
        aBatch,
      );
      expect((await thread(S1, iBatch, S1.id)).status).toBe(200);
    });

    it('6-7 history is kept: enrollment row is `left`, attendance and class rows remain', async () => {
      const enrollment = await h.db
        .selectFrom('enrollments')
        .selectAll()
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .executeTakeFirstOrThrow();
      expect(enrollment.status).toBe('left');
      const att = await h.db
        .selectFrom('attendance')
        .selectAll()
        .where('session_id', '=', pastSession)
        .where('student_id', '=', S1.id)
        .execute();
      expect(att).toHaveLength(1);
      expect(
        await h.db
          .selectFrom('class_sessions')
          .select('id')
          .where('id', '=', pastSession)
          .executeTakeFirst(),
      ).toBeDefined();
      // Other students in the batch are untouched.
      expect((await thread(S2, aBatch, S2.id)).status).toBe(200);
    });

    it('re-enrolling restores access (removal is not a permanent ban)', async () => {
      await h.db
        .updateTable('enrollments')
        .set({ status: 'active', left_at: null })
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .execute();
      expect((await thread(S1, aBatch, S1.id)).status).toBe(200);
      expect((await say(S1, aBatch, S1.id, 'back again')).status).toBe(201);
      // Leave again for the flows below.
      await h.api('DELETE', `/batches/${aBatch}/students/${S1.id}`, T1.token, {
        ctx: A.ctx,
      });
    });
  });

  // ==================================================================
  // 3. CALENDAR — holidays, parent schedule, timezone
  // ==================================================================
  describe('3: calendar feeds', () => {
    const feed = (u: Actor, ctx?: string) =>
      h.api('GET', `/holidays/me?from=${day(-1)}&to=${day(60)}`, u.token, {
        ctx,
      });
    let holidayId: string;
    let batchHolidayId: string;

    beforeAll(async () => {
      // S1 is back in the Academy batch for the calendar flows.
      await h.db
        .updateTable('enrollments')
        .set({ status: 'active', left_at: null })
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .execute();
      const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
        body: {
          name: `Founders Day ${h.MARKER}`,
          startDate: day(10),
          endDate: day(11),
          scope: 'academy',
        },
      });
      expect(res.status).toBe(201);
      holidayId = res.body.id;
      holidayIds.push(holidayId);
      const scoped = await h.api(
        'POST',
        '/academy/me/holidays',
        A.owner.token,
        {
          body: {
            name: `Biology Field Trip ${h.MARKER}`,
            startDate: day(20),
            scope: 'batches',
            batchIds: [aBatch2],
          },
        },
      );
      expect(scoped.status).toBe(201);
      batchHolidayId = scoped.body.id;
      holidayIds.push(batchHolidayId);
    });

    const ids = (res: { body: any[] }) => res.body.map((x: any) => x.id);

    it('19 the Academy teacher sees the Academy holiday under the Academy profile', async () => {
      const res = await feed(T1, A.ctx);
      expect(res.status).toBe(200);
      expect(ids(res)).toContain(holidayId);
      const row = res.body.find((x: any) => x.id === holidayId);
      expect(row.academy_name).toContain(h.MARKER);
      expect(row.start_date.slice(0, 10)).toBe(day(10));
      expect(row.end_date.slice(0, 10)).toBe(day(11));
    });

    it('22 the same teacher on the INDIVIDUAL profile gets no Academy holiday at all', async () => {
      expect((await feed(T1)).body).toEqual([]);
      expect((await feed(T1, 'individual')).body).toEqual([]);
    });

    it('23 Academy B and its teacher never see Academy A holidays; a non-member cannot borrow the context', async () => {
      expect(ids(await feed(T3, B.ctx))).not.toContain(holidayId);
      expect(ids(await feed(S3))).not.toContain(holidayId);
      expect(ids(await feed(P3))).not.toContain(holidayId);
      // T3 is not a member of A — the context header is rejected.
      expect((await feed(T3, A.ctx)).status).toBe(403);
    });

    it('20-21 the Academy student and their parent see it, tagged with whom it touches', async () => {
      const student = await feed(S1);
      expect(ids(student)).toContain(holidayId);
      expect(
        student.body.find((x: any) => x.id === holidayId).student_ids,
      ).toEqual([S1.id]);
      const parent = await feed(P1);
      expect(ids(parent)).toContain(holidayId);
      expect(
        parent.body.find((x: any) => x.id === holidayId).student_ids,
      ).toEqual([S1.id]);
    });

    it('a student of an Individual batch only, and their parent, see no Academy holiday', async () => {
      expect((await feed(SI)).body).toEqual([]);
      expect((await feed(PI)).body).toEqual([]);
    });

    it('a batch-scoped holiday reaches only that batch’s people', async () => {
      // S2 is in aBatch only; the holiday is for aBatch2.
      expect(ids(await feed(S2))).not.toContain(batchHolidayId);
      expect(ids(await feed(S2))).toContain(holidayId);
      // T1 teaches aBatch2, so the teacher does see it.
      expect(ids(await feed(T1, A.ctx))).toContain(batchHolidayId);
      // A student in aBatch2 sees it.
      const s4 = await h.makeUser('student', 's4');
      await h.enroll(aBatch2, s4.id);
      expect(ids(await feed(s4))).toContain(batchHolidayId);
    });

    it('a removed student no longer sees the academy’s holidays', async () => {
      await h.db
        .updateTable('enrollments')
        .set({ status: 'left' })
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .execute();
      // S1 is still in the Individual batch only -> no Academy holiday.
      expect(ids(await feed(S1))).not.toContain(holidayId);
      await h.db
        .updateTable('enrollments')
        .set({ status: 'active' })
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .execute();
    });

    it('24-25 the parent schedule shows only the linked child; other children are 403', async () => {
      const at = new Date(Date.now() + 2 * 24 * 3600_000);
      const sid = await h.scheduleAt(T1, aBatch, at, { ctx: A.ctx });
      const win = `from=${new Date(Date.now() - 24 * 3600_000).toISOString()}&to=${new Date(Date.now() + 7 * 24 * 3600_000).toISOString()}`;
      const own = await h.api(
        'GET',
        `/sessions/student/${S1.id}?${win}`,
        P1.token,
      );
      expect(own.status).toBe(200);
      expect(own.body.map((s: any) => s.id)).toContain(sid);
      expect(
        (await h.api('GET', `/sessions/student/${S2.id}?${win}`, P1.token))
          .status,
      ).toBe(403);
      expect(
        (await h.api('GET', `/sessions/student/${S1.id}?${win}`, P2.token))
          .status,
      ).toBe(403);
      // 27 cancellation shows on the parent's calendar with its reason
      expect(
        (
          await h.api(
            'POST',
            `/academy/me/batches/${aBatch}/sessions/${sid}/cancel`,
            A.owner.token,
          )
        ).status,
      ).toBe(201);
      const after = await h.api(
        'GET',
        `/sessions/student/${S1.id}?${win}`,
        P1.token,
      );
      const row = after.body.find((s: any) => s.id === sid);
      expect(row.status).toBe('cancelled');
      expect(row.cancellation_reason).toBe('academy_manual');
    });

    it('26 a NON-IST class carries the same instant and timezone on every dashboard API', async () => {
      const zone = 'America/Los_Angeles';
      const local = DateTime.now()
        .setZone(zone)
        .plus({ days: 5 })
        .set({ hour: 19, minute: 0, second: 0, millisecond: 0 });
      const expectedUtc = local.toUTC().toISO()!;
      const created = await h.api('POST', '/sessions', T1.token, {
        ctx: A.ctx,
        body: {
          batchId: aBatch,
          startLocal: local.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
          durationMin: 60,
          timezone: zone,
        },
      });
      expect(created.status).toBe(201);
      const sid = created.body.id as string;
      const win = `from=${new Date(Date.now()).toISOString()}&to=${new Date(Date.now() + 9 * 24 * 3600_000).toISOString()}`;

      const teacher = (
        await h.api('GET', `/sessions/me?${win}`, T1.token, { ctx: A.ctx })
      ).body.find((s: any) => s.id === sid);
      const student = (
        await h.api('GET', `/sessions/upcoming?${win}`, S2.token)
      ).body.find((s: any) => s.id === sid);
      const parent = (
        await h.api('GET', `/sessions/student/${S2.id}?${win}`, P2.token)
      ).body.find((s: any) => s.id === sid);
      const academy = (
        await h.api('GET', `/academy/me/sessions?${win}`, A.owner.token)
      ).body.find((s: any) => s.id === sid);

      for (const s of [teacher, student, parent]) {
        expect(s.timezone).toBe(zone);
        expect(new Date(s.scheduled_start_utc).toISOString()).toBe(
          new Date(expectedUtc).toISOString(),
        );
      }
      expect(academy.timezone).toBe(zone);
      expect(new Date(academy.scheduledStartUtc).toISOString()).toBe(
        new Date(expectedUtc).toISOString(),
      );
      // The class's own day is the LA day (7pm LA is already tomorrow in UTC / IST):
      // the front-end rule (lib/calendar.ts) reads the day in this zone.
      expect(
        DateTime.fromISO(teacher.scheduled_start_utc, { zone }).toISODate(),
      ).toBe(local.toISODate());
      expect(
        DateTime.fromISO(teacher.scheduled_start_utc, {
          zone: IST,
        }).toISODate(),
      ).not.toBe(local.toISODate());
    });
  });

  // ==================================================================
  // 4. NOTIFICATIONS
  // ==================================================================
  describe('4: notification connections', () => {
    it('31 a batch announcement reaches the batch students AND their linked parents only', async () => {
      // S2 + P2 in aBatch (S1 is currently removed from it).
      await h.db
        .updateTable('enrollments')
        .set({ status: 'left' })
        .where('batch_id', '=', aBatch)
        .where('student_id', '=', S1.id)
        .execute();
      const res = await h.api(
        'POST',
        `/announcements/batch/${aBatch}`,
        T1.token,
        {
          ctx: A.ctx,
          body: { body: `Test on Friday ${h.MARKER}` },
        },
      );
      expect(res.status).toBe(201);
      const forParent = (await notes(P2, 'announcement')).filter(
        (n) => n.payload.announcementId === res.body.id,
      );
      expect(forParent).toHaveLength(1);
      expect(forParent[0].payload.audience).toBe('parent');
      expect(forParent[0].payload.body).toContain('Test on Friday');
      expect(
        (await notes(S2, 'announcement')).filter(
          (n) => n.payload.announcementId === res.body.id,
        ),
      ).toHaveLength(1);
      // 38/36 unrelated parents, the removed student's parent, other academies: nothing.
      for (const u of [P1, P3, PI, S1, S3, SI]) {
        expect(
          (await notes(u, 'announcement')).filter(
            (n) => n.payload.announcementId === res.body.id,
          ),
        ).toHaveLength(0);
      }
    });

    it('a PENDING (unconsented) parent link is never notified', async () => {
      const pPending = await h.makeUser('parent', 'ppending');
      await h.db
        .insertInto('parent_child_links')
        .values({
          id: newId(),
          parent_id: pPending.id,
          student_id: S2.id,
          status: 'pending',
        })
        .execute();
      const res = await h.api(
        'POST',
        `/announcements/batch/${aBatch}`,
        T1.token,
        {
          ctx: A.ctx,
          body: { body: 'second notice' },
        },
      );
      expect(
        (await notes(pPending, 'announcement')).filter(
          (n) => n.payload.announcementId === res.body.id,
        ),
      ).toHaveLength(0);
      expect((await notes(P2, 'announcement')).length).toBe(2);
    });

    describe('32 fees', () => {
      let feeId: string;
      const period = DateTime.now().setZone(IST).toFormat('yyyy-MM');

      it('raising a fee tells the student and the linked parent — once, even if regenerated', async () => {
        const gen = () =>
          h.api('POST', `/fees/batch/${aBatch}/generate`, T1.token, {
            ctx: A.ctx,
            body: { periodLabel: period },
          });
        const first = await gen();
        expect(first.status).toBe(201);
        feeId = first.body.find((f: any) => f.student_id === S2.id).id;
        await gen(); // regenerate — same rows, no second notice
        for (const u of [S2, P2]) {
          const rows = (await notes(u, 'fee_raised')).filter(
            (n) => n.payload.feeLedgerId === feeId,
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].payload.title).toContain('Academy Chemistry');
          expect(rows[0].payload.body).toContain('due');
        }
        // Other families / the removed student: nothing.
        for (const u of [P1, S1, P3, S3, PI, SI]) {
          expect(await notes(u, 'fee_raised')).toHaveLength(0);
        }
      });

      it('a teacher-recorded partial then full payment notifies student + parent (not the teacher)', async () => {
        const part = await h.api(
          'POST',
          `/fees/${feeId}/record-payment`,
          T1.token,
          {
            ctx: A.ctx,
            body: { paidMinor: 40000 },
          },
        );
        expect(part.status).toBe(201);
        const full = await h.api(
          'POST',
          `/fees/${feeId}/record-payment`,
          T1.token,
          {
            ctx: A.ctx,
            body: { paidMinor: 100000 },
          },
        );
        expect(full.status).toBe(201);
        for (const u of [S2, P2]) {
          const rows = (await notes(u, 'fee_payment_recorded')).filter(
            (n) => n.payload.feeLedgerId === feeId,
          );
          expect(rows.map((r) => r.payload.title).sort()).toEqual([
            'Fee paid — Academy Chemistry',
            'Payment received — Academy Chemistry',
          ]);
        }
        expect(await notes(T1, 'fee_payment_recorded')).toHaveLength(0);
      });

      it('waiving a fee notifies student + parent; a failed action notifies nobody', async () => {
        const gen = await h.api(
          'POST',
          `/fees/batch/${iBatch}/generate`,
          T1.token,
          {
            body: { periodLabel: period },
          },
        );
        const siFee = gen.body.find((f: any) => f.student_id === SI.id).id;
        const waived = await h.api('POST', `/fees/${siFee}/waive`, T1.token, {
          body: {},
        });
        expect(waived.status).toBe(201);
        for (const u of [SI, PI]) {
          expect(
            (await notes(u, 'fee_waived')).filter(
              (n) => n.payload.feeLedgerId === siFee,
            ),
          ).toHaveLength(1);
        }
        // waiving again fails (409) and adds nothing
        expect(
          (await h.api('POST', `/fees/${siFee}/waive`, T1.token, { body: {} }))
            .status,
        ).toBe(409);
        expect(await notes(SI, 'fee_waived')).toHaveLength(1);
        // Individual fee: the Academy family got nothing.
        expect(await notes(P2, 'fee_waived')).toHaveLength(0);
      });

      it('an ONLINE payment tells the teacher who is owed and the other family member — not the payer', async () => {
        const s5 = await h.makeUser('student', 's5');
        const p5 = await h.makeUser('parent', 'p5');
        await h.linkParent(p5.id, s5.id);
        await h.enroll(iBatch, s5.id);
        const gen = await h.api(
          'POST',
          `/fees/batch/${iBatch}/generate`,
          T1.token,
          {
            body: { periodLabel: period },
          },
        );
        const fee = gen.body.find((f: any) => f.student_id === s5.id).id;
        const order = await h.api(
          'POST',
          `/payments/fee/${fee}/order`,
          p5.token,
        );
        expect(order.status).toBe(201);
        const payment = await h.db
          .selectFrom('payments')
          .selectAll()
          .where('fee_ledger_id', '=', fee)
          .executeTakeFirstOrThrow();
        const captured = await h.api(
          'POST',
          `/payments/${payment.id}/simulate-capture`,
          p5.token,
        );
        expect(captured.status).toBe(201);
        expect(
          (await notes(T1, 'fee_payment_recorded')).some(
            (n) => n.payload.feeLedgerId === fee,
          ),
        ).toBe(true);
        expect(
          (await notes(s5, 'fee_payment_recorded')).some(
            (n) => n.payload.feeLedgerId === fee,
          ),
        ).toBe(true);
        // the payer (the parent) is not told about their own payment
        expect(
          (await notes(p5, 'fee_payment_recorded')).some(
            (n) => n.payload.feeLedgerId === fee,
          ),
        ).toBe(false);
        // replaying the capture is an idempotent no-op — no second notice
        await h.api(
          'POST',
          `/payments/${payment.id}/simulate-capture`,
          p5.token,
        );
        expect(
          (await notes(T1, 'fee_payment_recorded')).filter(
            (n) => n.payload.feeLedgerId === fee,
          ),
        ).toHaveLength(1);
      });
    });

    describe('33 verification outcomes', () => {
      let reviewer: Actor;
      beforeAll(async () => {
        // Reviewer actions write append-only audit_logs rows keyed to the actor
        // (no delete cascade), so — like verifications-queue.e2e-spec — this
        // user is deliberately NOT registered for cleanup.
        const id = newId();
        await h.db
          .insertInto('users')
          .values({
            id,
            phone_e164: `+91${h.MARKER}999`.slice(0, 20),
            email: `${h.MARKER}-reviewer@example.test`,
          })
          .execute();
        await h.db
          .insertInto('user_roles')
          .values({ user_id: id, role: 'superadmin' })
          .execute();
        reviewer = {
          id,
          token: h.tokens.signAccessToken(id, ['superadmin']),
          label: 'reviewer',
        };
      });

      it('a tutor is told when a reviewer approves / rejects a document; the verified badge notice fires once both are approved', async () => {
        const tutor = await h.makeUser('tutor', 'vtutor');
        const mk = async (type: 'id_proof' | 'qualification') => {
          const id = newId();
          await h.db
            .insertInto('tutor_verifications')
            .values({
              id,
              tutor_id: tutor.id,
              type,
              document_key: `t/${id}.pdf`,
            })
            .execute();
          return id;
        };
        const idProof = await mk('id_proof');
        const qual = await mk('qualification');
        const review = (id: string, status: string, note?: string) =>
          h.api('POST', `/verifications/${id}/review`, reviewer.token, {
            body: { status, ...(note ? { note } : {}) },
          });

        expect((await review(idProof, 'approved')).status).toBe(201);
        let approved = await notes(tutor, 'verification_approved');
        expect(approved).toHaveLength(1);
        expect(approved[0].payload.title).toContain('ID proof was approved');

        expect((await review(qual, 'approved')).status).toBe(201);
        approved = await notes(tutor, 'verification_approved');
        expect(approved).toHaveLength(2);
        expect(
          approved.some((n) => n.payload.title === "You're verified"),
        ).toBe(true);

        // a repeated review is rejected and adds nothing
        expect((await review(qual, 'approved')).status).toBe(400);
        expect(await notes(tutor, 'verification_approved')).toHaveLength(2);

        const tutor2 = await h.makeUser('tutor', 'vtutor2');
        const id2 = newId();
        await h.db
          .insertInto('tutor_verifications')
          .values({
            id: id2,
            tutor_id: tutor2.id,
            type: 'id_proof',
            document_key: `t/${id2}.pdf`,
          })
          .execute();
        expect((await review(id2, 'rejected', 'Photo is blurry')).status).toBe(
          201,
        );
        const rejected = await notes(tutor2, 'verification_rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].payload.body).toContain('Photo is blurry');
        // nobody else was told
        expect(await notes(tutor, 'verification_rejected')).toHaveLength(0);
      });

      it('an Academy owner is told when KYC is verified / rejected; queue-only states stay silent', async () => {
        const submit = async (academyId: string) => {
          const id = newId();
          await h.db
            .insertInto('academy_kyc_verifications')
            .values({ id, academy_id: academyId, status: 'pending' })
            .execute();
          return id;
        };
        const reviewKyc = (id: string, status: string, reason?: string) =>
          h.api(
            'POST',
            `/admin/academy-verifications/${id}/review`,
            reviewer.token,
            {
              body: { status, ...(reason ? { reason } : {}) },
            },
          );

        // needs_manual_review is a queue-internal state — the owner is not told.
        const flagged = await submit(A.id);
        expect(
          (await reviewKyc(flagged, 'needs_manual_review', 'Owner PAN unclear'))
            .status,
        ).toBe(201);
        expect(
          await notes(A.owner, 'academy_verification_approved'),
        ).toHaveLength(0);
        expect(
          await notes(A.owner, 'academy_verification_rejected'),
        ).toHaveLength(0);

        const kycA = await submit(A.id);
        expect((await reviewKyc(kycA, 'verified')).status).toBe(201);
        expect(
          await notes(A.owner, 'academy_verification_approved'),
        ).toHaveLength(1);
        // an already-resolved submission cannot be re-reviewed (and adds nothing)
        expect((await reviewKyc(kycA, 'verified')).status).toBe(400);
        expect(
          await notes(A.owner, 'academy_verification_approved'),
        ).toHaveLength(1);

        const kycB = await submit(B.id);
        expect(
          (await reviewKyc(kycB, 'rejected', 'Documents mismatch')).status,
        ).toBe(201);
        const rej = await notes(B.owner, 'academy_verification_rejected');
        expect(rej).toHaveLength(1);
        expect(rej[0].payload.body).toContain('Documents mismatch');
        // Academy A's owner heard nothing about B.
        expect(
          await notes(A.owner, 'academy_verification_rejected'),
        ).toHaveLength(0);
      });
    });

    it('34 student removal sends the removed student NO notice (documented product model)', async () => {
      const s6 = await h.makeUser('student', 's6');
      await h.enroll(iBatch, s6.id);
      expect(
        (
          await h.api(
            'DELETE',
            `/batches/${iBatch}/students/${s6.id}`,
            T1.token,
          )
        ).status,
      ).toBe(200);
      const all = await h.notificationsFor(s6.id);
      expect(all).toHaveLength(0);
    });

    it('35-36 deleted accounts and removed students get nothing new, while live recipients still do', async () => {
      const gone = await h.makeUser('student', 'gone');
      const goneParent = await h.makeUser('parent', 'goneparent');
      const stays = await h.makeUser('student', 'stays');
      await h.linkParent(goneParent.id, gone.id);
      await h.enroll(iBatch, gone.id);
      await h.enroll(iBatch, stays.id);
      expect((await h.api('DELETE', '/account/me', gone.token)).status).toBe(
        200,
      );
      expect(
        (await h.api('DELETE', '/account/me', goneParent.token)).status,
      ).toBe(200);

      const removed = await h.makeUser('student', 'removed');
      const removedParent = await h.makeUser('parent', 'removedparent');
      await h.linkParent(removedParent.id, removed.id);
      await h.enroll(iBatch, removed.id);
      await h.api(
        'DELETE',
        `/batches/${iBatch}/students/${removed.id}`,
        T1.token,
      );

      const res = await h.api(
        'POST',
        `/announcements/batch/${iBatch}`,
        T1.token,
        {
          body: { body: 'Individual batch notice' },
        },
      );
      expect(res.status).toBe(201);
      const got = async (u: Actor) =>
        (await notes(u, 'announcement')).filter(
          (n) => n.payload.announcementId === res.body.id,
        );
      expect(await got(stays)).toHaveLength(1);
      expect(await got(gone)).toHaveLength(0);
      expect(await got(goneParent)).toHaveLength(0);
      expect(await got(removed)).toHaveLength(0);
      expect(await got(removedParent)).toHaveLength(0);

      // ...and the guard is at the choke point, not just this caller:
      const svc = h.app.get(NotificationsService);
      const delivered = await svc.notify({
        userIds: [gone.id, goneParent.id, stays.id],
        type: 'direct_probe',
        title: 't',
        body: 'b',
      });
      expect(delivered).toEqual([stays.id]);
      expect(await h.notificationsFor(gone.id, 'direct_probe')).toHaveLength(0);
    });

    it('37 dedupe still works (same key twice = one row) and 38 recipients stay isolated', async () => {
      const svc = h.app.get(NotificationsService);
      const input = {
        userIds: [S2.id, S3.id],
        type: 'dedupe_probe',
        title: 't',
        body: 'b',
        dedupeKey: `probe:${h.MARKER}`,
      };
      expect(await svc.notify(input)).toHaveLength(2);
      expect(await svc.notify(input)).toHaveLength(0);
      expect(await h.notificationsFor(S2.id, 'dedupe_probe')).toHaveLength(1);
      expect(await h.notificationsFor(S1.id, 'dedupe_probe')).toHaveLength(0);
    });

    it('a departed academy teacher is not told about a batch-scoped academy holiday', async () => {
      const t5 = await h.makeUser('tutor', 't5');
      await h.join(A.id, t5.id);
      const scopedBatch = await h.createBatch(t5, {
        ctx: A.ctx,
        title: 'T5 Batch',
      });
      // t5 leaves the academy but keeps the (academy-owned) batch.
      await h.db
        .updateTable('academy_memberships')
        .set({ status: 'left' })
        .where('tutor_id', '=', t5.id)
        .execute();
      const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
        body: {
          name: `Scoped ${h.MARKER}`,
          startDate: day(40),
          scope: 'batches',
          batchIds: [scopedBatch],
        },
      });
      expect(res.status).toBe(201);
      holidayIds.push(res.body.id);
      expect(await h.notificationsFor(t5.id, 'academy_holiday')).toHaveLength(
        0,
      );
      // Positive control: T1 (an ACTIVE member) runs aBatch2 and was told about
      // the batch-scoped Biology Field Trip earlier.
      expect(
        (await h.notificationsFor(T1.id, 'academy_holiday')).length,
      ).toBeGreaterThan(0);
    });
  });

  // ==================================================================
  // 5. ASSESSMENT COMPLETION
  // ==================================================================
  describe('5: online assessment completion follows the current required roster', () => {
    let assessmentId: string;
    let sA: Actor;
    let sB: Actor;
    let sC: Actor;
    let stranger: Actor;

    const submit = (u: Actor, answers = [1, 2]) =>
      h.api('POST', `/assessments/online/${assessmentId}/submit`, u.token, {
        body: { answers },
      });
    const status = async () =>
      (
        await h.db
          .selectFrom('assessments')
          .select('status')
          .where('id', '=', assessmentId)
          .executeTakeFirstOrThrow()
      ).status;
    const leave = (u: Actor) =>
      h.api('DELETE', `/batches/${aBatch3}/students/${u.id}`, T1.token, {
        ctx: A.ctx,
      });

    beforeAll(async () => {
      aBatch3 = await h.createBatch(T1, { ctx: A.ctx, title: 'Roster batch' });
      sA = await h.makeUser('student', 'as1');
      sB = await h.makeUser('student', 'as2');
      sC = await h.makeUser('student', 'as3');
      stranger = await h.makeUser('student', 'stranger');
      await h.enroll(aBatch3, sA.id);
      await h.enroll(aBatch3, sB.id);
      // Not in any batch of this assessment.
      await h.enroll(bBatch, stranger.id);
    });

    it('39-41 create → add questions → publish works; both current students are notified', async () => {
      const created = await h.api('POST', '/assessments/online', T1.token, {
        ctx: A.ctx,
        body: {
          title: `Roster test ${h.MARKER}`,
          subjectId: h.subjectId,
          batchIds: [aBatch3],
        },
      });
      expect(created.status).toBe(201);
      assessmentId = created.body.id;
      // Questions are AI-generated in prod; seed them directly here.
      await h.db
        .insertInto('assessment_questions')
        .values([
          {
            id: newId(),
            assessment_id: assessmentId,
            order_index: 0,
            question_text: 'Q1',
            choices: JSON.stringify(['a', 'b', 'c', 'd']),
            correct_choice_index: 1,
            marks: 2,
            difficulty: 'easy',
            explanation: null,
          },
          {
            id: newId(),
            assessment_id: assessmentId,
            order_index: 1,
            question_text: 'Q2',
            choices: JSON.stringify(['a', 'b', 'c', 'd']),
            correct_choice_index: 2,
            marks: 3,
            difficulty: 'easy',
            explanation: null,
          },
        ])
        .execute();
      await h.db
        .updateTable('assessments')
        .set({ max_score: 5 })
        .where('id', '=', assessmentId)
        .execute();
      const published = await h.api(
        'POST',
        `/assessments/online/${assessmentId}/publish`,
        T1.token,
        { ctx: A.ctx },
      );
      expect(published.status).toBe(201);
      expect(await status()).toBe('published');
      for (const u of [sA, sB]) {
        expect(
          (await notes(u, 'assessment_published')).some(
            (n) => n.payload.assessmentId === assessmentId,
          ),
        ).toBe(true);
      }
    });

    it('42-46 S1 submits, S3 joins, S1 is removed, S2 submits → NOT complete; S3 can still submit; then it completes', async () => {
      expect((await submit(sA)).status).toBe(201); // S1
      await h.enroll(aBatch3, sC.id); // S3 joins after publication
      expect((await leave(sA)).status).toBe(200); // S1 removed (result kept)
      expect((await submit(sB)).status).toBe(201); // S2

      // The bug: 2 results (S1's kept one + S2's) vs 2 active students -> completed.
      expect(await status()).toBe('published');
      // S3 is still allowed in.
      const take = await h.api(
        'GET',
        `/assessments/online/${assessmentId}/take`,
        sC.token,
      );
      expect(take.status).toBe(200);
      expect(take.body.open).toBe(true);

      expect((await submit(sC)).status).toBe(201); // S3
      expect(await status()).toBe('completed');
      // The removed student's result is history, not deleted.
      expect(
        await h.db
          .selectFrom('assessment_results')
          .select('id')
          .where('assessment_id', '=', assessmentId)
          .where('student_id', '=', sA.id)
          .executeTakeFirst(),
      ).toBeDefined();
      // completion notices went to the teacher and current participants only
      expect(
        (await notes(T1, 'assessment_completed')).some(
          (n) => n.payload.assessmentId === assessmentId,
        ),
      ).toBe(true);
      expect(
        (await notes(sA, 'assessment_result_available')).some(
          (n) => n.payload.assessmentId === assessmentId,
        ),
      ).toBe(false);
    });

    it('a removed student cannot submit or open it; strangers and other roles are rejected (direct-ID)', async () => {
      // an unattempted removed student can't take it
      const late = await h.makeUser('student', 'late');
      await h.enroll(aBatch3, late.id);
      await leave(late);
      expect(
        (
          await h.api(
            'GET',
            `/assessments/online/${assessmentId}/take`,
            late.token,
          )
        ).status,
      ).toBe(403);
      expect((await submit(late)).status).toBeGreaterThanOrEqual(400);
      expect(
        (
          await h.api(
            'GET',
            `/assessments/online/${assessmentId}/take`,
            stranger.token,
          )
        ).status,
      ).toBe(403);
      expect((await submit(stranger)).status).toBeGreaterThanOrEqual(400);
      // Academy B's teacher cannot read or publish Academy A's assessment.
      expect(
        (
          await h.api('GET', `/assessments/online/${assessmentId}`, T3.token, {
            ctx: B.ctx,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await h.api(
            'GET',
            `/assessments/online/${assessmentId}/results`,
            T3.token,
            { ctx: B.ctx },
          )
        ).status,
      ).toBe(403);
      // The teacher's Individual profile cannot reach the Academy assessment either.
      expect(
        (await h.api('GET', `/assessments/online/${assessmentId}`, T1.token))
          .status,
      ).toBeGreaterThanOrEqual(403);
    });

    it('with no membership change, completion still needs every current student', async () => {
      const created = await h.api('POST', '/assessments/online', T1.token, {
        ctx: A.ctx,
        body: {
          title: `Plain ${h.MARKER}`,
          subjectId: h.subjectId,
          batchIds: [aBatch],
        },
      });
      const id = created.body.id;
      await h.db
        .insertInto('assessment_questions')
        .values({
          id: newId(),
          assessment_id: id,
          order_index: 0,
          question_text: 'Q',
          choices: JSON.stringify(['a', 'b', 'c', 'd']) as never,
          correct_choice_index: 0,
          marks: 1,
          difficulty: 'easy',
          explanation: null,
        })
        .execute();
      await h.db
        .updateTable('assessments')
        .set({ max_score: 1 })
        .where('id', '=', id)
        .execute();
      expect(
        (
          await h.api('POST', `/assessments/online/${id}/publish`, T1.token, {
            ctx: A.ctx,
          })
        ).status,
      ).toBe(201);
      // aBatch's active students right now: S2 only (S1 was removed).
      const s = await h.db
        .selectFrom('assessments')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(s.status).toBe('published');
      const res = await h.api(
        'POST',
        `/assessments/online/${id}/submit`,
        S2.token,
        { body: { answers: [0] } },
      );
      expect(res.status).toBe(201);
      const done = await h.db
        .selectFrom('assessments')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(done.status).toBe('completed');
    });
  });
});
