/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Academy reschedule → teacher notification — over real HTTP, real DB, real
 * JWTs. The Academy Admin moving an Academy-owned class must tell the
 * teacher who runs it (`class_rescheduled_by_academy`), while the existing
 * student/parent notice (`class_rescheduled`), the reminder, and the
 * Individual / Academy isolation are all unchanged.
 */
jest.setTimeout(240_000);

const TYPE = 'class_rescheduled_by_academy';

describe('Academy reschedule → teacher notification (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual profile AND member of A
  let T2: Actor; // member of A (substitute in one test)
  let T3: Actor; // member of B only
  let T4: Actor; // member of A who later leaves
  let TX: Actor; // no academy at all
  let sAcad: Actor;
  let sInd: Actor;
  let pAcad: Actor;
  let iBatch: string; // T1's Individual batch
  let aBatch: string; // T1's Academy-A batch
  let bBatch: string; // T3's Academy-B batch

  const inHours = (n: number) => new Date(Date.now() + n * 3600_000);
  const local = (d: Date) => d.toISOString().slice(0, 16);

  const rescheduleAsAcademy = (
    owner: Actor,
    batchId: string,
    sessionId: string,
    to: Date,
  ) =>
    h.api(
      'POST',
      `/academy/me/batches/${batchId}/sessions/${sessionId}/reschedule`,
      owner.token,
      { body: { newStartLocal: local(to), timezone: 'UTC' } },
    );

  const forSession = async (u: Actor, type: string, sid: string) =>
    (await h.notificationsFor(u.id, type)).filter(
      (n) => (n.payload as any).sessionId === sid,
    );

  const sessionRow = (sid: string) =>
    h.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', '=', sid)
      .executeTakeFirstOrThrow();

  beforeAll(async () => {
    h = await createHarness('art');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    T3 = await h.makeUser('tutor', 't3');
    T4 = await h.makeUser('tutor', 't4');
    TX = await h.makeUser('tutor', 'tx');
    await h.join(A.id, T1.id);
    await h.join(A.id, T2.id);
    await h.join(B.id, T3.id);
    await h.join(A.id, T4.id);
    sAcad = await h.makeUser('student', 'sacad');
    sInd = await h.makeUser('student', 'sind');
    pAcad = await h.makeUser('parent', 'pacad');
    await h.linkParent(pAcad.id, sAcad.id);

    iBatch = await h.createBatch(T1);
    aBatch = await h.createBatch(T1, { ctx: A.ctx });
    bBatch = await h.createBatch(T3, { ctx: B.ctx });
    await h.enroll(iBatch, sInd.id);
    await h.enroll(aBatch, sAcad.id);
  });

  afterAll(async () => {
    await h?.close();
  });

  it('A + E: the Academy reschedules its class → exactly one teacher notice with class, academy, old and new time; student + parent notices unchanged; nobody else notified', async () => {
    const start = inHours(30);
    const sid = await h.scheduleAt(T1, aBatch, start, { ctx: A.ctx });
    const newStart = inHours(54);

    const res = await rescheduleAsAcademy(A.owner, aBatch, sid, newStart);
    expect(res.status).toBe(201);

    // class_sessions updated.
    expect((await sessionRow(sid)).scheduled_start_utc.toISOString()).toBe(
      new Date(local(newStart) + ':00Z').toISOString(),
    );

    // Teacher: exactly one, with the change spelled out.
    const teacher = await forSession(T1, TYPE, sid);
    expect(teacher).toHaveLength(1);
    const p = teacher[0].payload as any;
    expect(p.title).toBe('📅 Class Rescheduled by Academy');
    expect(p.body).toMatch(
      /^Your Batch .+ class has been rescheduled by Academy a .+ from .+ to .+\(30 min\)\.$/,
    );
    expect(p.previousStartUtc).toBe(start.toISOString().slice(0, 19) + '.000Z');
    expect(p.newStartUtc).toBe(
      new Date(local(newStart) + ':00Z').toISOString(),
    );
    expect(p.academyId).toBe(A.id);
    // Old and new time, in Scholar's notice format (session tz = UTC).
    const fmt = (d: Date) =>
      DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('ccc d LLL, h:mm a');
    expect(p.body).toContain(
      `from ${fmt(new Date(start.toISOString().slice(0, 19) + 'Z'))} to ${fmt(new Date(local(newStart) + ':00Z'))}`,
    );

    // Student + parent: the existing notice, still exactly once each.
    expect(await forSession(sAcad, 'class_rescheduled', sid)).toHaveLength(1);
    expect(await forSession(pAcad, 'class_rescheduled', sid)).toHaveLength(1);
    // …and they do NOT get the teacher-only type.
    expect(await forSession(sAcad, TYPE, sid)).toHaveLength(0);
    expect(await forSession(pAcad, TYPE, sid)).toHaveLength(0);

    // Unrelated users (other member of A, member of B, no-academy teacher,
    // Individual student, both academy owners) hear nothing.
    for (const u of [T2, T3, T4, TX, sInd, A.owner, B.owner]) {
      expect(await forSession(u, TYPE, sid)).toHaveLength(0);
      expect(await forSession(u, 'class_rescheduled', sid)).toHaveLength(0);
    }

    // The teacher sees it through the real notification API, and the new
    // time on their calendar; student + parent calendars show it too.
    const list = await h.api('GET', '/notifications', T1.token);
    expect(list.status).toBe(200);
    expect(
      (list.body as any[]).some(
        (n) => n.type === TYPE && n.payload.sessionId === sid,
      ),
    ).toBe(true);
    const window = `from=${inHours(0).toISOString()}&to=${inHours(96).toISOString()}`;
    const cal = await h.api('GET', `/sessions/me?${window}`, T1.token, {
      ctx: A.ctx,
    });
    expect(
      (cal.body as any[]).find((s) => s.id === sid).scheduled_start_utc,
    ).toBe(new Date(local(newStart) + ':00Z').toISOString());
    const stu = await h.api('GET', `/sessions/upcoming?${window}`, sAcad.token);
    expect(
      (stu.body as any[]).find((s) => s.id === sid).scheduled_start_utc,
    ).toBe(new Date(local(newStart) + ':00Z').toISOString());
    const par = await h.api(
      'GET',
      `/sessions/student/${sAcad.id}?${window}`,
      pAcad.token,
    );
    expect(
      (par.body as any[]).find((s) => s.id === sid).scheduled_start_utc,
    ).toBe(new Date(local(newStart) + ':00Z').toISOString());
  });

  it('duplicate / simultaneous identical reschedules → one teacher notice; a later genuine reschedule → a second', async () => {
    const sid = await h.scheduleAt(T1, aBatch, inHours(31), { ctx: A.ctx });
    const target = inHours(58);

    const results = await Promise.all([
      rescheduleAsAcademy(A.owner, aBatch, sid, target),
      rescheduleAsAcademy(A.owner, aBatch, sid, target),
      rescheduleAsAcademy(A.owner, aBatch, sid, target),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await forSession(T1, TYPE, sid)).toHaveLength(1);
    expect(await forSession(sAcad, 'class_rescheduled', sid)).toHaveLength(1);

    // Repeating after the fact is a no-op (same time) — still one.
    await rescheduleAsAcademy(A.owner, aBatch, sid, target);
    expect(await forSession(T1, TYPE, sid)).toHaveLength(1);

    // 58h → 59h later is a new event → a new notice.
    const again = await rescheduleAsAcademy(A.owner, aBatch, sid, inHours(59));
    expect(again.status).toBe(201);
    expect(await forSession(T1, TYPE, sid)).toHaveLength(2);
    expect(await forSession(sAcad, 'class_rescheduled', sid)).toHaveLength(2);
  });

  it('failed Academy reschedules (past time, conflict, cancelled class) notify no one and change nothing', async () => {
    const start = inHours(32);
    const sid = await h.scheduleAt(T1, aBatch, start, { ctx: A.ctx });
    const other = await h.scheduleAt(T1, aBatch, inHours(70), { ctx: A.ctx });

    const past = await rescheduleAsAcademy(A.owner, aBatch, sid, inHours(-5));
    expect(past.status).toBe(400);
    // Overlaps `other` (same batch + teacher).
    const clash = await rescheduleAsAcademy(A.owner, aBatch, sid, inHours(70));
    expect(clash.status).toBe(409);

    const cancelled = await h.scheduleAt(T1, aBatch, inHours(80), {
      ctx: A.ctx,
    });
    expect(
      (
        await h.api(
          'POST',
          `/academy/me/batches/${aBatch}/sessions/${cancelled}/cancel`,
          A.owner.token,
        )
      ).status,
    ).toBe(201);
    const dead = await rescheduleAsAcademy(
      A.owner,
      aBatch,
      cancelled,
      inHours(90),
    );
    expect(dead.status).toBe(409);

    for (const id of [sid, other, cancelled]) {
      for (const u of [T1, sAcad, pAcad]) {
        expect(await forSession(u, TYPE, id)).toHaveLength(0);
        expect(await forSession(u, 'class_rescheduled', id)).toHaveLength(0);
      }
    }
    expect((await sessionRow(sid)).scheduled_start_utc.toISOString()).toBe(
      new Date(start.toISOString().slice(0, 19) + 'Z').toISOString(),
    );
  });

  it("B + F: Academy A cannot reschedule the teacher's Individual class — 404, nothing changes, no Academy notice", async () => {
    const start = inHours(33);
    const sid = await h.scheduleAt(T1, iBatch, start);

    // Individual batch id in the path, and also the Academy batch id with the
    // Individual session id (a mismatched-path attempt).
    for (const batchPath of [iBatch, aBatch]) {
      const res = await rescheduleAsAcademy(
        A.owner,
        batchPath,
        sid,
        inHours(60),
      );
      expect([403, 404]).toContain(res.status);
    }
    expect((await sessionRow(sid)).scheduled_start_utc.toISOString()).toBe(
      new Date(start.toISOString().slice(0, 19) + 'Z').toISOString(),
    );
    for (const u of [T1, sInd]) {
      expect(await forSession(u, TYPE, sid)).toHaveLength(0);
      expect(await forSession(u, 'class_rescheduled', sid)).toHaveLength(0);
    }
  });

  it('F: the teacher rescheduling their OWN Individual class never yields an Academy notice', async () => {
    const sid = await h.scheduleAt(T1, iBatch, inHours(34));
    const res = await h.api('POST', `/sessions/${sid}/reschedule`, T1.token, {
      body: { newStartLocal: local(inHours(61)), timezone: 'UTC' },
    });
    expect(res.status).toBe(201);
    expect(await forSession(sInd, 'class_rescheduled', sid)).toHaveLength(1);
    expect(await forSession(T1, TYPE, sid)).toHaveLength(0);
  });

  it('a TEACHER rescheduling their own Academy class (Academy profile): student/parent notified as before, no teacher/admin notice', async () => {
    const sid = await h.scheduleAt(T1, aBatch, inHours(35), { ctx: A.ctx });
    const res = await h.api('POST', `/sessions/${sid}/reschedule`, T1.token, {
      ctx: A.ctx,
      body: { newStartLocal: local(inHours(62)), timezone: 'UTC' },
    });
    expect(res.status).toBe(201);
    expect(await forSession(sAcad, 'class_rescheduled', sid)).toHaveLength(1);
    expect(await forSession(pAcad, 'class_rescheduled', sid)).toHaveLength(1);
    for (const u of [T1, A.owner]) {
      expect(await forSession(u, TYPE, sid)).toHaveLength(0);
    }
  });

  it("B: Academy A cannot reschedule Academy B's class — rejected, unchanged, Academy B's teacher not notified", async () => {
    const start = inHours(36);
    const sid = await h.scheduleAt(T3, bBatch, start, { ctx: B.ctx });

    for (const batchPath of [bBatch, aBatch]) {
      const res = await rescheduleAsAcademy(
        A.owner,
        batchPath,
        sid,
        inHours(63),
      );
      expect([403, 404]).toContain(res.status);
    }
    expect((await sessionRow(sid)).scheduled_start_utc.toISOString()).toBe(
      new Date(start.toISOString().slice(0, 19) + 'Z').toISOString(),
    );
    expect(await forSession(T3, TYPE, sid)).toHaveLength(0);

    // Sanity: B's own admin CAN, and only B's teacher hears it.
    const ok = await rescheduleAsAcademy(B.owner, bBatch, sid, inHours(63));
    expect(ok.status).toBe(201);
    expect(await forSession(T3, TYPE, sid)).toHaveLength(1);
    expect(await forSession(T1, TYPE, sid)).toHaveLength(0);
  });

  it('D + wrong context: non-member / wrong-role / wrong-context callers cannot trigger it', async () => {
    const start = inHours(37);
    const sid = await h.scheduleAt(T1, aBatch, start, { ctx: A.ctx });
    const body = { newStartLocal: local(inHours(64)), timezone: 'UTC' };

    // Teachers hitting the academy-admin route (wrong role).
    for (const t of [T1, T2, T3, TX]) {
      const r = await h.api(
        'POST',
        `/academy/me/batches/${aBatch}/sessions/${sid}/reschedule`,
        t.token,
        { body },
      );
      expect(r.status).toBe(403);
    }
    // A non-member / other-academy teacher on the teacher route.
    for (const t of [T3, TX, T2]) {
      const r = await h.api('POST', `/sessions/${sid}/reschedule`, t.token, {
        body,
      });
      expect(r.status).toBe(403);
    }
    // The owner teacher, but in the WRONG context (Individual profile) for an
    // Academy class.
    const wrongCtx = await h.api(
      'POST',
      `/sessions/${sid}/reschedule`,
      T1.token,
      {
        body,
      },
    );
    expect(wrongCtx.status).toBe(403);

    expect((await sessionRow(sid)).scheduled_start_utc.toISOString()).toBe(
      new Date(start.toISOString().slice(0, 19) + 'Z').toISOString(),
    );
    for (const u of [T1, T2, T3, TX, sAcad, pAcad]) {
      expect(await forSession(u, TYPE, sid)).toHaveLength(0);
      expect(await forSession(u, 'class_rescheduled', sid)).toHaveLength(0);
    }
  });

  it('the assigned substitute is told too; a teacher who left the academy is not', async () => {
    // Substitute: T2 covers T1's class.
    const subSid = await h.scheduleAt(T1, aBatch, inHours(38), { ctx: A.ctx });
    await h.db
      .updateTable('class_sessions')
      .set({ substitute_tutor_id: T2.id })
      .where('id', '=', subSid)
      .execute();
    expect(
      (await rescheduleAsAcademy(A.owner, aBatch, subSid, inHours(65))).status,
    ).toBe(201);
    expect(await forSession(T1, TYPE, subSid)).toHaveLength(1);
    expect(await forSession(T2, TYPE, subSid)).toHaveLength(1);
    expect(await forSession(T3, TYPE, subSid)).toHaveLength(0);

    // Left: T4 ran an Academy class, then left; the academy keeps authority
    // over its own class, but T4 (now Individual-only there) hears nothing.
    const t4Batch = await h.createBatch(T4, { ctx: A.ctx });
    const t4Sid = await h.scheduleAt(T4, t4Batch, inHours(39), { ctx: A.ctx });
    await h.db
      .updateTable('academy_memberships')
      .set({ status: 'left', left_at: new Date() })
      .where('tutor_id', '=', T4.id)
      .execute();
    expect(
      (await rescheduleAsAcademy(A.owner, t4Batch, t4Sid, inHours(66))).status,
    ).toBe(201);
    expect(await forSession(T4, TYPE, t4Sid)).toHaveLength(0);
  });

  it('reminders follow the new time: none at the old time, one at the new time', async () => {
    const reminders = h.app.get(RemindersService);
    const batch = await h.createBatch(T2, { ctx: A.ctx });
    const student = await h.makeUser('student', 'srem');
    await h.enroll(batch, student.id);

    // Moved AWAY from the reminder window: the old time must not remind.
    const inWindow = new Date(Date.now() + 10 * 60_000);
    const movedAway = await h.scheduleAt(T2, batch, inWindow, { ctx: A.ctx });
    const away = await rescheduleAsAcademy(
      A.owner,
      batch,
      movedAway,
      inHours(6),
    );
    expect(away.status).toBe(201);
    await reminders.sendUpcomingClassReminders();
    expect(await forSession(student, 'class_reminder', movedAway)).toHaveLength(
      0,
    );

    // Moved INTO the window: the new time reminds exactly once.
    const movedIn = await h.scheduleAt(T2, batch, inHours(8), { ctx: A.ctx });
    const into = await rescheduleAsAcademy(
      A.owner,
      batch,
      movedIn,
      new Date(Date.now() + 10 * 60_000 + 15_000),
    );
    expect(into.status).toBe(201);
    await Promise.all([
      reminders.sendUpcomingClassReminders(),
      reminders.sendUpcomingClassReminders(),
    ]);
    const got = await forSession(student, 'class_reminder', movedIn);
    expect(got).toHaveLength(1);
    expect((got[0].payload as any).scheduledStartUtc).toBe(
      (await sessionRow(movedIn)).scheduled_start_utc.toISOString(),
    );
  });

  it('database: one teacher row per event, no rows for unrelated users or unrelated sessions', async () => {
    const sid = await h.scheduleAt(T1, aBatch, inHours(41), { ctx: A.ctx });
    const untouched = await h.scheduleAt(T1, aBatch, inHours(90), {
      ctx: A.ctx,
    });
    await rescheduleAsAcademy(A.owner, aBatch, sid, inHours(67));

    const all = await h.db
      .selectFrom('notifications')
      .selectAll()
      .where('type', '=', TYPE)
      .execute();
    const mine = all.filter((n) => (n.payload as any).sessionId === sid);
    expect(mine.map((n) => n.user_id)).toEqual([T1.id]);
    expect(mine[0].dedupe_key).toMatch(new RegExp(`^rescheduled:${sid}:\\d+$`));
    expect(
      all.filter((n) => (n.payload as any).sessionId === untouched),
    ).toHaveLength(0);
  });
});
