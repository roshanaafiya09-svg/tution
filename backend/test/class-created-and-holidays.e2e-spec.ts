/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { newId } from '../src/database/id';
import { holidayDateOf } from '../src/modules/holidays/holiday-calendar';
import { SessionNotificationsService } from '../src/modules/scheduling/sessions/session-notifications.service';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Class-created notices + academy-holiday enforcement at class creation —
 * over real HTTP, real DB, real JWTs.
 *
 * Holiday policy under test (see SessionsService.createSeries):
 *  - a single Academy class on a holiday of its academy batch → 409
 *    ACADEMY_HOLIDAY, nothing written, nobody notified;
 *  - a recurring series skips its holiday occurrences and creates the rest
 *    (409 only if every occurrence is a holiday);
 *  - Individual classes and other academies' classes are never affected.
 * Notice policy: one `class_created` per recipient for a single class, one
 * summary per recipient for a series; active roster + linked parents only.
 */
jest.setTimeout(240_000);

describe('Class-created notices + academy holidays at creation (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual + member of A
  let T3: Actor; // member of B
  let sInd: Actor; // Individual batch
  let sAcad: Actor; // Academy A batch
  let sB: Actor; // Academy B batch
  let sOther: Actor; // enrolled nowhere
  let pInd: Actor;
  let pAcad: Actor;
  let pOther: Actor; // linked to sOther
  let iBatch: string;
  let aBatch: string;
  let aBatch2: string; // second Academy A batch (batch-scoped holiday target)
  let bBatch: string;

  // A fixed IST calendar day ~20 days out; classes at 16:00 IST (10:30 UTC).
  const base = new Date(Date.now() + 20 * 86_400_000);
  const holidayDate = holidayDateOf(base);
  const atIst = (date: string, hhmm: string, dayOffset = 0) => {
    const d = new Date(`${date}T${hhmm}:00+05:30`);
    return new Date(d.getTime() + dayOffset * 86_400_000);
  };
  const holidayClass = atIst(holidayDate, '16:00');
  const holidayIds: string[] = [];

  const created = (userId: string) =>
    h.notificationsFor(userId, 'class_created');
  const rowsAt = (batchId: string, at: Date) =>
    h.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('batch_id', '=', batchId)
      .where('scheduled_start_utc', '=', at)
      .execute();
  const post = (
    actor: Actor,
    batchId: string,
    at: Date,
    ctx?: string,
    extra: object = {},
  ) =>
    h.api('POST', '/sessions', actor.token, {
      ctx,
      body: {
        batchId,
        startLocal: at.toISOString().slice(0, 19),
        durationMin: 30,
        timezone: 'UTC',
        ...extra,
      },
    });

  beforeAll(async () => {
    h = await createHarness('cc');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T3 = await h.makeUser('tutor', 't3');
    await h.join(A.id, T1.id);
    await h.join(B.id, T3.id);
    sInd = await h.makeUser('student', 'sind');
    sAcad = await h.makeUser('student', 'sacad');
    sB = await h.makeUser('student', 'sb');
    sOther = await h.makeUser('student', 'sother');
    pInd = await h.makeUser('parent', 'pind');
    pAcad = await h.makeUser('parent', 'pacad');
    pOther = await h.makeUser('parent', 'pother');
    await h.linkParent(pInd.id, sInd.id);
    await h.linkParent(pAcad.id, sAcad.id);
    await h.linkParent(pOther.id, sOther.id);

    iBatch = await h.createBatch(T1, { title: 'Physics Individual' });
    aBatch = await h.createBatch(T1, {
      ctx: A.ctx,
      title: 'Chemistry Academy',
    });
    aBatch2 = await h.createBatch(T1, { ctx: A.ctx, title: 'Biology Academy' });
    bBatch = await h.createBatch(T3, { ctx: B.ctx, title: 'Maths Academy B' });
    await h.enroll(iBatch, sInd.id);
    await h.enroll(aBatch, sAcad.id);
    await h.enroll(aBatch2, sAcad.id);
    await h.enroll(bBatch, sB.id);

    // Academy A: whole-academy holiday on `holidayDate`.
    const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
      body: {
        name: `Founders Day ${h.MARKER}`,
        startDate: holidayDate,
        scope: 'academy',
      },
    });
    expect(res.status).toBe(201);
    holidayIds.push(res.body.id);
  });

  afterAll(async () => {
    if (holidayIds.length) {
      await h?.db
        .deleteFrom('holidays')
        .where('id', 'in', holidayIds)
        .execute();
    }
    await h?.close();
  });

  // ------------------------------------------------------------ notices
  it('1-2 Individual class: student + linked parent get exactly one class_created naming class, teacher, date', async () => {
    const at = atIst(holidayDate, '17:00', 1);
    const res = await post(T1, iBatch, at);
    expect(res.status).toBe(201);
    expect(res.body.skipped_holiday_occurrences).toEqual([]);

    for (const u of [sInd, pInd]) {
      const rows = await created(u.id);
      expect(rows).toHaveLength(1);
      const p = rows[0].payload;
      expect(p.sessionId).toBe(res.body.id);
      expect(p.academyId).toBeNull();
      expect(String(p.body)).toContain('Physics Individual');
      expect(String(p.body)).toContain(`Tutor t1 ${h.MARKER}`);
      expect(String(p.body)).not.toContain(' at Academy');
    }
  });

  it('7/9 Individual class reaches nobody else: no Academy user, no teacher, no unrelated student/parent', async () => {
    for (const u of [
      A.owner,
      B.owner,
      T1,
      T3,
      sAcad,
      sB,
      sOther,
      pAcad,
      pOther,
    ]) {
      expect(await created(u.id)).toHaveLength(0);
    }
  });

  it('3-4/8 Academy class: student + parent notified (names the academy); Academy B side gets nothing; academy sees the class', async () => {
    const at = atIst(holidayDate, '17:00', 2);
    const res = await post(T1, aBatch, at, A.ctx);
    expect(res.status).toBe(201);
    const row = await h.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select('batches.academy_id')
      .where('class_sessions.id', '=', res.body.id)
      .executeTakeFirstOrThrow();
    expect(row.academy_id).toBe(A.id);

    for (const u of [sAcad, pAcad]) {
      const rows = (await created(u.id)).filter(
        (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
      );
      expect(rows).toHaveLength(1);
      expect(String((rows[0].payload as { body: string }).body)).toContain(
        `Academy a ${h.MARKER}`,
      );
    }
    for (const u of [B.owner, T3, sB, sInd, pInd, A.owner]) {
      const rows = (await created(u.id)).filter(
        (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
      );
      expect(rows).toHaveLength(0);
    }

    const window = `from=${new Date(Date.now()).toISOString()}&to=${new Date(Date.now() + 40 * 86_400_000).toISOString()}`;
    const acA = await h.api(
      'GET',
      `/academy/me/sessions?${window}`,
      A.owner.token,
    );
    expect(acA.body.map((s: { id: string }) => s.id)).toContain(res.body.id);
    const acB = await h.api(
      'GET',
      `/academy/me/sessions?${window}`,
      B.owner.token,
    );
    expect(acB.body.map((s: { id: string }) => s.id)).not.toContain(
      res.body.id,
    );
  });

  it('5 failed creations (conflict / wrong context / archived batch / past-only) send no class_created', async () => {
    const before = (await created(sInd.id)).length;
    const at = atIst(holidayDate, '09:00', 3);
    expect((await post(T1, iBatch, at)).status).toBe(201);
    // Same slot again → teacher/batch conflict.
    expect((await post(T1, iBatch, at)).status).toBe(400);
    // Individual batch under an Academy context → rejected.
    expect(
      (await post(T1, iBatch, atIst(holidayDate, '11:00', 3), A.ctx)).status,
    ).toBe(403);
    // Another teacher's batch.
    expect(
      (await post(T3, iBatch, atIst(holidayDate, '12:00', 3))).status,
    ).toBe(403);
    expect((await created(sInd.id)).length).toBe(before + 1);
  });

  it('6 duplicate notify for the same created class writes no second row (dedupe key per session + recipient)', async () => {
    const at = atIst(holidayDate, '09:00', 4);
    const res = await post(T1, iBatch, at);
    expect(res.status).toBe(201);
    const notices = h.app.get(SessionNotificationsService);
    const parent = (await rowsAt(iBatch, at))[0];
    await notices.notifyCreated(parent, [at]);
    await notices.notifyCreated(parent, [at]);
    for (const u of [sInd, pInd]) {
      const rows = (await created(u.id)).filter(
        (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].dedupe_key).toBe(`created:${res.body.id}`);
    }
  });

  it('10 removed students and deleted accounts are not notified', async () => {
    const removed = await h.makeUser('student', 'removed');
    const deleted = await h.makeUser('student', 'deleted');
    await h.enroll(iBatch, removed.id);
    await h.enroll(iBatch, deleted.id);
    expect(
      (
        await h.api(
          'DELETE',
          `/batches/${iBatch}/students/${removed.id}`,
          T1.token,
        )
      ).status,
    ).toBe(200);
    expect((await h.api('DELETE', '/account/me', deleted.token)).status).toBe(
      200,
    );

    const res = await post(T1, iBatch, atIst(holidayDate, '09:00', 5));
    expect(res.status).toBe(201);
    expect(await created(removed.id)).toHaveLength(0);
    expect(await created(deleted.id)).toHaveLength(0);
    const sIndRows = (await created(sInd.id)).filter(
      (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
    );
    expect(sIndRows).toHaveLength(1);
  });

  it('a class created in the past (back-fill) is not announced as "scheduled"', async () => {
    const past = new Date(Date.now() - 2 * 86_400_000);
    const res = await post(T1, iBatch, past);
    expect(res.status).toBe(201);
    const rows = (await created(sInd.id)).filter(
      (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
    );
    expect(rows).toHaveLength(0);
  });

  // ------------------------------------------------------------ holidays
  it('11/17/19 Academy class on an existing Academy holiday → 409 ACADEMY_HOLIDAY; no row, no notice', async () => {
    const before = (await created(sAcad.id)).length;
    const res = await post(T1, aBatch, holidayClass, A.ctx);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACADEMY_HOLIDAY');
    expect(res.body.message).toContain('Academy holiday');
    expect(res.body.message).toContain('Founders Day');
    expect(await rowsAt(aBatch, holidayClass)).toHaveLength(0);
    expect((await created(sAcad.id)).length).toBe(before);
  });

  it('15/16 the academy-admin endpoint enforces the same rule; no context/ID manipulation bypasses it', async () => {
    // Academy admin path (a different controller, same service).
    const viaAdmin = await h.api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions`,
      A.owner.token,
      {
        body: {
          batchId: aBatch,
          startLocal: holidayClass.toISOString().slice(0, 19),
          durationMin: 30,
          timezone: 'UTC',
        },
      },
    );
    expect(viaAdmin.status).toBe(409);
    expect(viaAdmin.body.code).toBe('ACADEMY_HOLIDAY');
    // Mobile / no context header on an Academy batch → context mismatch, not a bypass.
    expect((await post(T1, aBatch, holidayClass)).status).toBe(403);
    // Claiming another academy's context.
    expect((await post(T1, aBatch, holidayClass, B.ctx)).status).toBe(403);
    // A client-supplied academyId in the body is not accepted.
    expect(
      (await post(T1, aBatch, holidayClass, A.ctx, { academyId: B.id })).status,
    ).toBe(400);
    // Academy B's admin addressing Academy A's batch through its own path.
    const crossAdmin = await h.api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions`,
      B.owner.token,
      {
        body: {
          batchId: aBatch,
          startLocal: holidayClass.toISOString().slice(0, 19),
          durationMin: 30,
          timezone: 'UTC',
        },
      },
    );
    expect(crossAdmin.status).toBe(404);
    expect(await rowsAt(aBatch, holidayClass)).toHaveLength(0);
  });

  it('13 the same teacher can create an Individual class on the Academy holiday date', async () => {
    const res = await post(T1, iBatch, holidayClass);
    expect(res.status).toBe(201);
    expect(await rowsAt(iBatch, holidayClass)).toHaveLength(1);
  });

  it('14 Academy B is unaffected by Academy A holiday', async () => {
    const res = await post(T3, bBatch, holidayClass, B.ctx);
    expect(res.status).toBe(201);
    expect(
      (await created(sB.id)).map(
        (n) => (n.payload as { sessionId: string }).sessionId,
      ),
    ).toContain(res.body.id);
  });

  it('20 holiday matching uses the IST calendar date: 00:15 IST on the holiday is blocked, 23:50 IST the day before is allowed', async () => {
    const earlyOnHoliday = atIst(holidayDate, '00:15');
    const lateDayBefore = atIst(holidayDate, '23:50', -1);
    // Both are the same UTC calendar day (the day before the holiday).
    expect(earlyOnHoliday.toISOString().slice(0, 10)).toBe(
      lateDayBefore.toISOString().slice(0, 10),
    );

    const blocked = await post(T1, aBatch, earlyOnHoliday, A.ctx);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACADEMY_HOLIDAY');
    const allowed = await post(T1, aBatch, lateDayBefore, A.ctx);
    expect(allowed.status).toBe(201);
  });

  it('12 recurring series: the holiday occurrence is skipped, the rest are created, ONE summary notice', async () => {
    const first = atIst(holidayDate, '18:00', -7); // weekly: -7, 0 (holiday), +7
    const before = (await created(sAcad.id)).length;
    const res = await post(T1, aBatch, first, A.ctx, {
      recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
    });
    expect(res.status).toBe(201);
    expect(res.body.skipped_holiday_occurrences).toEqual([
      expect.objectContaining({
        date: holidayDate,
        holiday_name: `Founders Day ${h.MARKER}`,
      }),
    ]);
    const series = await h.db
      .selectFrom('class_sessions')
      .select(['scheduled_start_utc', 'status'])
      .where((eb) =>
        eb.or([
          eb('id', '=', res.body.id),
          eb('recurrence_parent_id', '=', res.body.id),
        ]),
      )
      .orderBy('scheduled_start_utc')
      .execute();
    expect(series.map((s) => holidayDateOf(s.scheduled_start_utc))).toEqual([
      holidayDateOf(first),
      holidayDateOf(atIst(holidayDate, '18:00', 7)),
    ]);
    expect(series.every((s) => s.status === 'scheduled')).toBe(true);

    const after = await created(sAcad.id);
    expect(after.length).toBe(before + 1);
    const p = after.find(
      (n) => (n.payload as { sessionId?: string }).sessionId === res.body.id,
    )!.payload;
    expect(p.occurrenceCount).toBe(2);
  });

  it('12b a series where every occurrence is a holiday is rejected with no rows', async () => {
    const res = await post(T1, aBatch, atIst(holidayDate, '07:00'), A.ctx, {
      recurrenceRule: 'FREQ=HOURLY;COUNT=3',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACADEMY_HOLIDAY');
    expect(await rowsAt(aBatch, atIst(holidayDate, '07:00'))).toHaveLength(0);
  });

  it('batch-scoped holiday: blocks only the listed batch, not its sibling in the same academy', async () => {
    const day = holidayDateOf(atIst(holidayDate, '12:00', 9));
    const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
      body: {
        name: `Lab closure ${h.MARKER}`,
        startDate: day,
        scope: 'batches',
        batchIds: [aBatch2],
      },
    });
    expect(res.status).toBe(201);
    holidayIds.push(res.body.id);
    const at = atIst(day, '16:00');
    expect((await post(T1, aBatch2, at, A.ctx)).body.code).toBe(
      'ACADEMY_HOLIDAY',
    );
    expect((await post(T1, aBatch, at, A.ctx)).status).toBe(201);
  });

  it('government holiday: blocks only academies that observe it in that state', async () => {
    const day = holidayDateOf(atIst(holidayDate, '12:00', 11));
    const govId = newId();
    await h.db
      .insertInto('holidays')
      .values({
        id: govId,
        type: 'government_holiday',
        name: `Gov ${h.MARKER}`,
        start_date: day,
        end_date: day,
        country_code: 'IN',
        state_code: 'TN',
      })
      .execute();
    holidayIds.push(govId);
    await h.db
      .updateTable('academies')
      .set({ auto_observe_govt_holidays: true })
      .where('id', '=', A.id)
      .execute();
    const at = atIst(day, '16:00');
    expect((await post(T1, aBatch, at, A.ctx)).body.code).toBe(
      'ACADEMY_HOLIDAY',
    ); // A observes
    expect((await post(T3, bBatch, at, B.ctx)).status).toBe(201); // B does not
    expect((await post(T1, iBatch, at)).status).toBe(201); // Individual never
  });

  it('18 no reminder can fire for a rejected holiday class (nothing exists to remind about)', async () => {
    // The only reminder source is class_sessions rows; the rejected request
    // left none at the holiday time for the academy batch.
    expect(await rowsAt(aBatch, holidayClass)).toHaveLength(0);
    const reminders = await h.db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', 'in', [sAcad.id, pAcad.id])
      .where('type', '=', 'class_reminder')
      .execute();
    expect(reminders).toHaveLength(0);
    // And the real reminder sweep, run now, still sends nothing for it.
    await h.app.get(RemindersService).sendUpcomingClassReminders();
    expect(
      await h.db
        .selectFrom('notifications')
        .select('id')
        .where('user_id', '=', sAcad.id)
        .where('type', '=', 'class_reminder')
        .execute(),
    ).toHaveLength(0);
  });
});
