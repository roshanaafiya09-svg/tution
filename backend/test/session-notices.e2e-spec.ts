/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { newId } from '../src/database/id';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * H4 / H6 / H7 remediation — over real HTTP, real DB, real JWTs.
 *
 *  H4.1  reschedule → immediate notice to the class's students + linked parents
 *  H4.2  teacher / academy / archive cancel → immediate notice with the right actor
 *  H4.3  no duplicate notice for the same event; the 10-minute sweep never
 *        re-announces it; a cancelled class never gets a "starts in 10 min"
 *  H4.4  removing a student keeps history, blocks future access
 *  H6    substitute: view + attendance only; UI hints; API still 403s the rest
 *  Every notice stays inside its own teaching context (Individual vs Academy).
 */
jest.setTimeout(240_000);

describe('Session notices, substitute access, student removal (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual + member of A
  let T2: Actor; // member of A — the substitute
  let T3: Actor; // member of B only
  let sInd: Actor; // Individual batch only
  let sAcad: Actor; // Academy A batch only
  let sBoth: Actor; // both batches
  let pInd: Actor; // parent of sInd
  let pAcad: Actor; // parent of sAcad
  let iBatch: string;
  let aBatch: string;

  const inHours = (n: number) => new Date(Date.now() + n * 3600_000);

  async function types(userId: string, type: string) {
    return h.notificationsFor(userId, type);
  }

  beforeAll(async () => {
    h = await createHarness('sn');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    T3 = await h.makeUser('tutor', 't3');
    await h.join(A.id, T1.id);
    await h.join(A.id, T2.id);
    await h.join(B.id, T3.id);
    sInd = await h.makeUser('student', 'sind');
    sAcad = await h.makeUser('student', 'sacad');
    sBoth = await h.makeUser('student', 'sboth');
    pInd = await h.makeUser('parent', 'pind');
    pAcad = await h.makeUser('parent', 'pacad');
    await h.linkParent(pInd.id, sInd.id);
    await h.linkParent(pAcad.id, sAcad.id);

    iBatch = await h.createBatch(T1);
    aBatch = await h.createBatch(T1, { ctx: A.ctx });
    await h.enroll(iBatch, sInd.id);
    await h.enroll(iBatch, sBoth.id);
    await h.enroll(aBatch, sAcad.id);
    await h.enroll(aBatch, sBoth.id);
  });

  afterAll(async () => {
    await h?.close();
  });

  // ------------------------------------------------------------------ H4.1
  it('H4.1 reschedule: immediate notice with the new time, to Individual recipients only; duplicates notify once', async () => {
    const sid = await h.scheduleAt(T1, iBatch, inHours(30));
    const newStart = inHours(54);
    const body = {
      newStartLocal: newStart.toISOString().slice(0, 16),
      timezone: 'UTC',
    };

    // Double-submit at the same moment, then once more afterwards.
    const [r1, r2] = await Promise.all([
      h.api('POST', `/sessions/${sid}/reschedule`, T1.token, { body }),
      h.api('POST', `/sessions/${sid}/reschedule`, T1.token, { body }),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    const r3 = await h.api('POST', `/sessions/${sid}/reschedule`, T1.token, {
      body,
    });
    expect(r3.status).toBe(201);

    for (const recipient of [sInd, sBoth, pInd]) {
      const notices = (await types(recipient.id, 'class_rescheduled')).filter(
        (n) => (n.payload as any).sessionId === sid,
      );
      expect({ who: recipient.label, count: notices.length }).toEqual({
        who: recipient.label,
        count: 1,
      });
      expect((notices[0].payload as any).newStartUtc).toBe(
        new Date(body.newStartLocal + ':00Z').toISOString(),
      );
      expect((notices[0].payload as any).body).toMatch(/has moved to/);
    }
    // Academy-only student and parent never hear about an Individual class.
    for (const outsider of [sAcad, pAcad]) {
      expect(await types(outsider.id, 'class_rescheduled')).toHaveLength(0);
    }
  });

  it('H4.1 a genuinely new reschedule of the same class is a new event and notifies again', async () => {
    const sid = await h.scheduleAt(T1, iBatch, inHours(31));
    for (const hrs of [55, 56]) {
      const res = await h.api('POST', `/sessions/${sid}/reschedule`, T1.token, {
        body: {
          newStartLocal: inHours(hrs).toISOString().slice(0, 16),
          timezone: 'UTC',
        },
      });
      expect(res.status).toBe(201);
    }
    const notices = (await types(sInd.id, 'class_rescheduled')).filter(
      (n) => (n.payload as any).sessionId === sid,
    );
    expect(notices).toHaveLength(2);
  });

  it('H4.1 an academy-side reschedule of an Academy class reaches Academy recipients only', async () => {
    const sid = await h.scheduleAt(T1, aBatch, inHours(32), { ctx: A.ctx });
    const res = await h.api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions/${sid}/reschedule`,
      A.owner.token,
      {
        body: {
          newStartLocal: inHours(57).toISOString().slice(0, 16),
          timezone: 'UTC',
        },
      },
    );
    expect(res.status).toBe(201);
    const bySession = async (u: Actor) =>
      (await types(u.id, 'class_rescheduled')).filter(
        (n) => (n.payload as any).sessionId === sid,
      );
    expect(await bySession(sAcad)).toHaveLength(1);
    expect(await bySession(pAcad)).toHaveLength(1);
    expect(await bySession(sBoth)).toHaveLength(1);
    expect(await bySession(sInd)).toHaveLength(0);
    expect(await bySession(pInd)).toHaveLength(0);
  });

  // ------------------------------------------------------------------ H4.2 / H4.3
  it('H4.2 teacher cancel: immediate notice naming the teacher, Individual recipients only, never duplicated', async () => {
    const sid = await h.scheduleAt(T1, iBatch, inHours(33));
    const [c1, c2] = await Promise.all([
      h.api('POST', `/sessions/${sid}/cancel`, T1.token),
      h.api('POST', `/sessions/${sid}/cancel`, T1.token),
    ]);
    expect([c1.status, c2.status].sort()).toEqual([201, 409]);

    for (const recipient of [sInd, sBoth, pInd]) {
      const notices = (await types(recipient.id, 'class_cancelled')).filter(
        (n) => (n.payload as any).sessionId === sid,
      );
      expect({ who: recipient.label, count: notices.length }).toEqual({
        who: recipient.label,
        count: 1,
      });
      expect((notices[0].payload as any).reason).toBe('teacher_manual');
      expect((notices[0].payload as any).body).toMatch(
        /cancelled by your teacher/,
      );
    }
    for (const outsider of [sAcad, pAcad]) {
      expect(
        (await types(outsider.id, 'class_cancelled')).filter(
          (n) => (n.payload as any).sessionId === sid,
        ),
      ).toHaveLength(0);
    }
    const row = await h.db
      .selectFrom('class_sessions')
      .select('cancellation_notified_at')
      .where('id', '=', sid)
      .executeTakeFirstOrThrow();
    expect(row.cancellation_notified_at).not.toBeNull();
  });

  it('H4.2 academy cancel: attributed to the academy, Academy recipients only', async () => {
    const sid = await h.scheduleAt(T1, aBatch, inHours(34), { ctx: A.ctx });
    const res = await h.api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions/${sid}/cancel`,
      A.owner.token,
    );
    expect(res.status).toBe(201);
    const bySession = async (u: Actor) =>
      (await types(u.id, 'class_cancelled')).filter(
        (n) => (n.payload as any).sessionId === sid,
      );
    const [notice] = await bySession(sAcad);
    expect((notice.payload as any).reason).toBe('academy_manual');
    expect((notice.payload as any).body).toMatch(/cancelled by the academy/);
    expect(await bySession(pAcad)).toHaveLength(1);
    expect(await bySession(sInd)).toHaveLength(0);
    expect(await bySession(pInd)).toHaveLength(0);
  });

  it('H4.2 whole-series cancel: ONE summarised notice per recipient, not one per class', async () => {
    const sid = await h.scheduleAt(T1, iBatch, inHours(35), {
      recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
    });
    const res = await h.api(
      'POST',
      `/sessions/${sid}/cancel?series=true`,
      T1.token,
    );
    expect(res.status).toBe(201);
    const seriesNotices = (await types(sInd.id, 'class_cancelled')).filter(
      (n) => ((n.payload as any).sessionIds ?? []).includes(sid),
    );
    expect(seriesNotices).toHaveLength(1);
    expect((seriesNotices[0].payload as any).sessionIds).toHaveLength(4);
    expect((seriesNotices[0].payload as any).body).toMatch(/4 upcoming/);
  });

  it('H4.3 the 10-minute sweep never re-announces an immediate cancellation, and a cancelled class never gets "starts in 10 minutes"', async () => {
    const reminders = h.app.get(RemindersService);
    // Exactly 10 minutes out — inside the sweep's window.
    const at = new Date(Date.now() + 10 * 60_000);
    const cancelledSid = await h.scheduleAt(T1, iBatch, at);
    const cancel = await h.api(
      'POST',
      `/sessions/${cancelledSid}/cancel`,
      T1.token,
    );
    expect(cancel.status).toBe(201);

    await Promise.all([
      reminders.sendUpcomingClassReminders(),
      reminders.sendUpcomingClassReminders(),
    ]);

    const all = await h.notificationsFor(sInd.id);
    const aboutIt = all.filter(
      (n) =>
        (n.payload as any).sessionId === cancelledSid ||
        ((n.payload as any).sessionIds ?? []).includes(cancelledSid),
    );
    // Its own creation notice, then the one immediate cancellation — no
    // sweep re-announcement and no "starts in 10 minutes".
    expect(aboutIt.map((n) => n.type).sort()).toEqual([
      'class_cancelled',
      'class_created',
    ]);
  });

  it('H4.3 a scheduled class in the window gets exactly one reminder even when the sweep runs twice concurrently', async () => {
    const reminders = h.app.get(RemindersService);
    const at = new Date(Date.now() + 10 * 60_000);
    // A separate batch so this class can't overlap the one above.
    const batch = await h.createBatch(T2);
    const student = await h.makeUser('student', 'swindow');
    await h.enroll(batch, student.id);
    const sid = await h.scheduleAt(T2, batch, at);

    await Promise.all([
      reminders.sendUpcomingClassReminders(),
      reminders.sendUpcomingClassReminders(),
    ]);
    await reminders.sendUpcomingClassReminders();

    const got = (await types(student.id, 'class_reminder')).filter(
      (n) => (n.payload as any).sessionId === sid,
    );
    expect(got).toHaveLength(1);
  });

  it('H4.2 archiving a batch announces its cancelled future classes once (reason: batch_archived)', async () => {
    const batch = await h.createBatch(T1);
    const student = await h.makeUser('student', 'sarch');
    await h.enroll(batch, student.id);
    await h.scheduleAt(T1, batch, inHours(40));
    await h.scheduleAt(T1, batch, inHours(64));

    expect(
      (await h.api('POST', `/batches/${batch}/archive`, T1.token)).status,
    ).toBe(201);
    expect(
      (await h.api('POST', `/batches/${batch}/archive`, T1.token)).status,
    ).toBe(201); // idempotent re-archive

    const notices = await types(student.id, 'class_cancelled');
    expect(notices).toHaveLength(1);
    expect((notices[0].payload as any).reason).toBe('batch_archived');
    expect((notices[0].payload as any).sessionIds).toHaveLength(2);
  });

  // ------------------------------------------------------------------ H4.4
  it('H4.4 removing a student keeps their history and removes future access — in that context only', async () => {
    const batch = await h.createBatch(T1);
    const academyBatch = await h.createBatch(T1, { ctx: A.ctx });
    const s = await h.makeUser('student', 'sremove');
    await h.enroll(batch, s.id);
    await h.enroll(academyBatch, s.id);

    // A past, completed class with recorded attendance.
    const pastSid = newId();
    await h.db
      .insertInto('class_sessions')
      .values({
        id: pastSid,
        batch_id: batch,
        tutor_id: T1.id,
        scheduled_start_utc: new Date(Date.now() - 48 * 3600_000),
        duration_min: 30,
        status: 'completed',
      })
      .execute();
    await h.db
      .insertInto('attendance')
      .values({
        id: newId(),
        session_id: pastSid,
        student_id: s.id,
        status: 'present',
        method: 'manual',
      })
      .execute();
    const futureSid = await h.scheduleAt(T1, batch, inHours(80));
    const academyFutureSid = await h.scheduleAt(T1, academyBatch, inHours(81), {
      ctx: A.ctx,
    });

    const del = await h.api(
      'DELETE',
      `/batches/${batch}/students/${s.id}`,
      T1.token,
    );
    expect([200, 204]).toContain(del.status);

    // History: the attendance row still exists and still shows on the past
    // class's roster (as a former student).
    const kept = await h.db
      .selectFrom('attendance')
      .select('status')
      .where('session_id', '=', pastSid)
      .where('student_id', '=', s.id)
      .executeTakeFirst();
    expect(kept?.status).toBe('present');
    const pastRoster = await h.api(
      'GET',
      `/attendance/session/${pastSid}`,
      T1.token,
    );
    expect(pastRoster.status).toBe(200);
    const pastRow = (pastRoster.body as any[]).find(
      (r) => r.student_id === s.id,
    );
    expect(pastRow).toMatchObject({
      status: 'present',
      enrollment_status: 'left',
    });
    const enrollment = await h.db
      .selectFrom('enrollments')
      .select(['status', 'left_at'])
      .where('batch_id', '=', batch)
      .where('student_id', '=', s.id)
      .executeTakeFirstOrThrow();
    expect(enrollment.status).toBe('left');
    expect(enrollment.left_at).not.toBeNull();

    // Future access: gone from the future roster, the schedule, can't join,
    // can't be marked, and isn't notified about the class any more.
    const futureRoster = await h.api(
      'GET',
      `/attendance/session/${futureSid}`,
      T1.token,
    );
    expect((futureRoster.body as any[]).map((r) => r.student_id)).not.toContain(
      s.id,
    );
    const upcoming = await h.api(
      'GET',
      `/sessions/upcoming?from=${new Date().toISOString()}&to=${inHours(200).toISOString()}`,
      s.token,
    );
    const upcomingIds = (upcoming.body as any[]).map((x) => x.id);
    expect(upcomingIds).not.toContain(futureSid);
    // ...while the Academy enrollment (a different context) is untouched.
    expect(upcomingIds).toContain(academyFutureSid);
    expect(
      (await h.api('POST', `/attendance/session/${futureSid}/join`, s.token))
        .status,
    ).toBe(400);
    expect(
      (
        await h.api('POST', `/attendance/session/${pastSid}/mark`, T1.token, {
          body: { studentId: s.id, status: 'absent' },
        })
      ).status,
    ).toBe(400);
    await h.api('POST', `/sessions/${futureSid}/cancel`, T1.token);
    expect(
      (await types(s.id, 'class_cancelled')).filter(
        (n) => (n.payload as any).sessionId === futureSid,
      ),
    ).toHaveLength(0);

    // The Academy never sees the removal's Individual history.
    const academyView = await h.api(
      'GET',
      `/academy/me/students/${s.id}`,
      A.owner.token,
    );
    expect(JSON.stringify(academyView.body)).not.toContain(pastSid);
  });

  // ------------------------------------------------------------------ H6
  describe('H6 substitute teacher', () => {
    let sid: string;

    beforeAll(async () => {
      sid = await h.scheduleAt(T1, aBatch, inHours(90), { ctx: A.ctx });
      await h.db
        .updateTable('class_sessions')
        .set({ substitute_tutor_id: T2.id })
        .where('id', '=', sid)
        .execute();
    });

    it('sees the covered class, labelled as covering for the original teacher', async () => {
      const res = await h.api(
        'GET',
        `/sessions/me?from=${new Date().toISOString()}&to=${inHours(200).toISOString()}`,
        T2.token,
        { ctx: A.ctx },
      );
      expect(res.status).toBe(200);
      const row = (res.body as any[]).find((r) => r.id === sid);
      expect(row).toMatchObject({
        viewer_role: 'substitute',
        tutor_id: T1.id,
        original_tutor_display_name: `Tutor t1 ${h.MARKER}`,
        substitute_display_name: `Tutor t2 ${h.MARKER}`,
      });
    });

    it('the original teacher still owns it (ownership/history intact)', async () => {
      const res = await h.api(
        'GET',
        `/sessions/me?from=${new Date().toISOString()}&to=${inHours(200).toISOString()}`,
        T1.token,
        { ctx: A.ctx },
      );
      const row = (res.body as any[]).find((r) => r.id === sid);
      expect(row).toMatchObject({ viewer_role: 'owner', tutor_id: T1.id });
      const db = await h.db
        .selectFrom('class_sessions')
        .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
        .select(['class_sessions.tutor_id', 'batches.academy_id'])
        .where('class_sessions.id', '=', sid)
        .executeTakeFirstOrThrow();
      expect(db).toEqual({ tutor_id: T1.id, academy_id: A.id });
    });

    it('can view the roster and mark attendance', async () => {
      const roster = await h.api(
        'GET',
        `/attendance/session/${sid}`,
        T2.token,
        {
          ctx: A.ctx,
        },
      );
      expect(roster.status).toBe(200);
      const mark = await h.api(
        'POST',
        `/attendance/session/${sid}/mark`,
        T2.token,
        { ctx: A.ctx, body: { studentId: sAcad.id, status: 'present' } },
      );
      expect(mark.status).toBe(201);
    });

    it('cannot cancel, complete, reschedule or edit — even calling the API directly', async () => {
      const opts = { ctx: A.ctx };
      const attempts = await Promise.all([
        h.api('POST', `/sessions/${sid}/cancel`, T2.token, opts),
        h.api('POST', `/sessions/${sid}/complete`, T2.token, opts),
        h.api('POST', `/sessions/${sid}/reschedule`, T2.token, {
          ...opts,
          body: {
            newStartLocal: inHours(120).toISOString().slice(0, 16),
            timezone: 'UTC',
          },
        }),
        h.api('PATCH', `/sessions/${sid}`, T2.token, {
          ...opts,
          body: { meetingUrl: 'https://meet.example.test/x' },
        }),
      ]);
      expect(attempts.map((a) => a.status)).toEqual([403, 403, 403, 403]);
      const row = await h.db
        .selectFrom('class_sessions')
        .select(['status', 'meeting_url'])
        .where('id', '=', sid)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe('scheduled');
      expect(row.meeting_url).toBeNull();
    });

    it('wrong context / wrong academy stays rejected', async () => {
      // The substitute under their Individual profile.
      const ind = await h.api('GET', `/attendance/session/${sid}`, T2.token);
      expect(ind.status).toBe(403);
      expect(ind.body.code).toBe('TEACHING_CONTEXT_MISMATCH');
      // A teacher of another academy, in either context.
      expect(
        (await h.api('GET', `/attendance/session/${sid}`, T3.token)).status,
      ).toBe(403);
      expect(
        (
          await h.api('GET', `/attendance/session/${sid}`, T3.token, {
            ctx: B.ctx,
          })
        ).status,
      ).toBe(403);
      // Academy B's owner can't reach it by id.
      expect(
        (
          await h.api(
            'POST',
            `/academy/me/batches/${aBatch}/sessions/${sid}/cancel`,
            B.owner.token,
          )
        ).status,
      ).toBe(404);
    });
  });
});
