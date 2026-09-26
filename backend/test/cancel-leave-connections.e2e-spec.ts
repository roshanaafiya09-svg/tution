/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { newId } from '../src/database/id';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Cancel-class + leave/substitute connections — real HTTP, real Postgres,
 * real JWTs.
 *
 *  B  student join of a cancelled class is rejected and never touches attendance
 *  C  Academy cancel -> the class's teacher is notified (+ student/parent as before)
 *  D  substitute assignment -> the substitute (only) is notified
 *  E  leave/substitute wording uses the class's real date
 *  F  approved leave blocks NEW Academy classes for that teacher only —
 *     never Individual classes, another academy, or another teacher
 */
jest.setTimeout(300_000);

const IST = 'Asia/Kolkata';
const CANCEL_TEACHER = 'class_cancelled_by_academy';
const SUB_ASSIGNED = 'class_substitute_assigned';

describe('Cancel + leave/substitute connections (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual + member of A (the teacher who goes on leave)
  let T2: Actor; // member of A (the substitute / a second teacher)
  let T3: Actor; // member of B
  let T4: Actor; // member of A who later leaves
  let sAcad: Actor;
  let sInd: Actor;
  let pAcad: Actor;
  let iBatch: string;
  let aBatch: string; // T1 @ A
  let a2Batch: string; // T2 @ A
  let bBatch: string; // T3 @ B
  let a4Batch: string; // T4 @ A

  const inHours = (n: number) => new Date(Date.now() + n * 3600_000);
  const istDay = (plusDays: number) =>
    DateTime.now().setZone(IST).plus({ days: plusDays }).toISODate()!;
  const at = (day: string, hhmm: string) => `${day}T${hhmm}:00`;

  const academyCreate = (
    owner: Actor,
    batchId: string,
    startLocal: string,
    extra: Record<string, unknown> = {},
  ) =>
    h.api('POST', `/academy/me/batches/${batchId}/sessions`, owner.token, {
      body: {
        batchId,
        startLocal,
        durationMin: 60,
        timezone: IST,
        ...extra,
      },
    });
  const teacherCreate = (
    t: Actor,
    batchId: string,
    startLocal: string,
    ctx?: string,
    extra: Record<string, unknown> = {},
  ) =>
    h.api('POST', '/sessions', t.token, {
      ctx,
      body: { batchId, startLocal, durationMin: 60, timezone: IST, ...extra },
    });
  const academyCancel = (owner: Actor, batchId: string, sid: string) =>
    h.api(
      'POST',
      `/academy/me/batches/${batchId}/sessions/${sid}/cancel`,
      owner.token,
    );

  const forSession = async (u: Actor, type: string, sid: string) =>
    (await h.notificationsFor(u.id, type)).filter(
      (n) =>
        (n.payload as any).sessionId === sid ||
        ((n.payload as { sessionIds?: string[] }).sessionIds ?? []).includes(
          sid,
        ),
    );
  const sessionRow = (sid: string) =>
    h.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', '=', sid)
      .executeTakeFirstOrThrow();
  const sessionsOn = (batchId: string) =>
    h.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('batch_id', '=', batchId)
      .execute();

  /** Teacher requests leave at the academy; the academy approves it. */
  async function approvedLeave(
    tutor: Actor,
    academy: typeof A,
    startDate: string,
    opts: {
      endDate?: string;
      leaveType?: 'full_day' | 'specific_classes';
      sessionIds?: string[];
      substituteTutorId?: string;
    } = {},
  ) {
    const created = await h.api('POST', '/leave', tutor.token, {
      body: {
        academyId: academy.id,
        startDate,
        ...(opts.endDate ? { endDate: opts.endDate } : {}),
        leaveType: opts.leaveType ?? 'full_day',
        ...(opts.sessionIds ? { sessionIds: opts.sessionIds } : {}),
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const approved = await h.api(
      'POST',
      `/academy/me/leave-requests/${id}/approve`,
      academy.owner.token,
      {
        body: opts.substituteTutorId
          ? { substituteTutorId: opts.substituteTutorId }
          : {},
      },
    );
    expect(approved.status).toBe(201);
    return id;
  }

  beforeAll(async () => {
    h = await createHarness('clc');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    T3 = await h.makeUser('tutor', 't3');
    T4 = await h.makeUser('tutor', 't4');
    await h.join(A.id, T1.id);
    await h.join(A.id, T2.id);
    await h.join(B.id, T3.id);
    await h.join(A.id, T4.id);
    sAcad = await h.makeUser('student', 'sacad');
    sInd = await h.makeUser('student', 'sind');
    pAcad = await h.makeUser('parent', 'pacad');
    await h.linkParent(pAcad.id, sAcad.id);

    iBatch = await h.createBatch(T1, { title: 'Physics Individual' });
    aBatch = await h.createBatch(T1, {
      ctx: A.ctx,
      title: 'Mathematics Academy',
    });
    a2Batch = await h.createBatch(T2, {
      ctx: A.ctx,
      title: 'Chemistry Academy',
    });
    bBatch = await h.createBatch(T3, { ctx: B.ctx, title: 'Biology B' });
    a4Batch = await h.createBatch(T4, { ctx: A.ctx, title: 'History Academy' });
    await h.enroll(iBatch, sInd.id);
    await h.enroll(aBatch, sAcad.id);
    await h.enroll(a2Batch, sAcad.id);
  });

  afterAll(async () => {
    await h?.close();
  });

  // =========================================================== B — join
  describe('B: a cancelled class cannot be joined', () => {
    async function attendanceRows(sid: string, studentId: string) {
      return h.db
        .selectFrom('attendance')
        .selectAll()
        .where('session_id', '=', sid)
        .where('student_id', '=', studentId)
        .execute();
    }

    it('future Academy class cancelled by the academy -> join is a 400; no attendance row', async () => {
      const sid = await h.scheduleAt(T1, aBatch, inHours(30), { ctx: A.ctx });
      expect((await academyCancel(A.owner, aBatch, sid)).status).toBe(201);

      const join = await h.api(
        'POST',
        `/attendance/session/${sid}/join`,
        sAcad.token,
      );
      expect(join.status).toBe(400);
      expect(join.body.message).toMatch(/cancelled/i);
      expect(await attendanceRows(sid, sAcad.id)).toHaveLength(0);
    });

    it('future Individual class cancelled by the teacher -> join is a 400; no attendance row', async () => {
      const sid = await h.scheduleAt(T1, iBatch, inHours(31));
      expect(
        (await h.api('POST', `/sessions/${sid}/cancel`, T1.token)).status,
      ).toBe(201);

      const join = await h.api(
        'POST',
        `/attendance/session/${sid}/join`,
        sInd.token,
      );
      expect(join.status).toBe(400);
      expect(await attendanceRows(sid, sInd.id)).toHaveLength(0);
    });

    it('a PAST cancelled class cannot be joined either, and an existing attendance row is not overwritten', async () => {
      const sid = await h.scheduleAt(T1, aBatch, inHours(32), { ctx: A.ctx });
      expect((await academyCancel(A.owner, aBatch, sid)).status).toBe(201);
      // Move it into the past and give the student a recorded absence.
      await h.db
        .updateTable('class_sessions')
        .set({ scheduled_start_utc: inHours(-48) })
        .where('id', '=', sid)
        .execute();
      await h.db
        .insertInto('attendance')
        .values({
          id: newId(),
          session_id: sid,
          student_id: sAcad.id,
          status: 'absent',
          method: 'manual',
          marked_by: T1.id,
        })
        .execute();

      const join = await h.api(
        'POST',
        `/attendance/session/${sid}/join`,
        sAcad.token,
      );
      expect(join.status).toBe(400);
      const rows = await attendanceRows(sid, sAcad.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('absent');
      expect(rows[0].method).toBe('manual');
    });

    it("context isolation: a student of the Academy batch can't join the other batch's class; a scheduled class is still joinable", async () => {
      const indSid = await h.scheduleAt(T1, iBatch, inHours(33));
      // sAcad is not enrolled in the Individual batch.
      expect(
        (await h.api('POST', `/attendance/session/${indSid}/join`, sAcad.token))
          .status,
      ).toBe(400);
      expect(await attendanceRows(indSid, sAcad.id)).toHaveLength(0);
      // Sanity: the enrolled student's join of a live class works.
      expect(
        (await h.api('POST', `/attendance/session/${indSid}/join`, sInd.token))
          .status,
      ).toBe(201);
    });
  });

  // ================================================= C — academy cancel
  describe('C: Academy cancel notifies the affected teacher', () => {
    it('Academy A cancels its class: one teacher notice (class, time, academy) + the existing student/parent notices; nobody else; no duplicates on a repeat', async () => {
      const sid = await h.scheduleAt(T1, aBatch, inHours(40), { ctx: A.ctx });

      const res = await academyCancel(A.owner, aBatch, sid);
      expect(res.status).toBe(201);
      const row = await sessionRow(sid);
      expect(row.status).toBe('cancelled');
      expect(row.cancellation_reason).toBe('academy_manual');

      const teacher = await forSession(T1, CANCEL_TEACHER, sid);
      expect(teacher).toHaveLength(1);
      const p = teacher[0].payload as any;
      expect(p.title).toBe('🔔 Class Cancelled by Academy');
      expect(p.body).toMatch(
        /^Your Mathematics Academy class on \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2} [AP]M was cancelled by Academy a .+\.$/,
      );
      expect(p.academyId).toBe(A.id);
      expect(p.reason).toBe('academy_manual');

      // Student + parent: the existing notice, once each, unchanged wording.
      for (const u of [sAcad, pAcad]) {
        const n = await forSession(u, 'class_cancelled', sid);
        expect(n).toHaveLength(1);
        expect((n[0].payload as any).body).toMatch(/cancelled by the academy/);
        expect(await forSession(u, CANCEL_TEACHER, sid)).toHaveLength(0);
      }
      // Nobody unrelated.
      for (const u of [T2, T3, T4, sInd, A.owner, B.owner]) {
        expect(await forSession(u, CANCEL_TEACHER, sid)).toHaveLength(0);
        expect(await forSession(u, 'class_cancelled', sid)).toHaveLength(0);
      }

      // Repeat: the lifecycle guard rejects it and nothing new is sent.
      const again = await academyCancel(A.owner, aBatch, sid);
      expect(again.status).toBe(409);
      expect(await forSession(T1, CANCEL_TEACHER, sid)).toHaveLength(1);
      expect(await forSession(sAcad, 'class_cancelled', sid)).toHaveLength(1);
    });

    it('the teacher sees it through the notification API and the cancelled status on their schedule', async () => {
      const sid = await h.scheduleAt(T1, aBatch, inHours(41), { ctx: A.ctx });
      await academyCancel(A.owner, aBatch, sid);

      const list = await h.api('GET', '/notifications', T1.token);
      expect(
        (list.body as any[]).some(
          (n) => n.type === CANCEL_TEACHER && n.payload.sessionId === sid,
        ),
      ).toBe(true);
      const window = `from=${inHours(0).toISOString()}&to=${inHours(96).toISOString()}`;
      const cal = await h.api('GET', `/sessions/me?${window}`, T1.token, {
        ctx: A.ctx,
      });
      expect((cal.body as any[]).find((s) => s.id === sid)).toMatchObject({
        status: 'cancelled',
        cancellation_reason: 'academy_manual',
      });
      const stu = await h.api(
        'GET',
        `/sessions/upcoming?${window}`,
        sAcad.token,
      );
      expect((stu.body as any[]).find((s) => s.id === sid)).toMatchObject({
        status: 'cancelled',
        cancellation_reason: 'academy_manual',
      });
    });

    it('a series cancelled by the academy: ONE summarised teacher notice', async () => {
      const sid = await h.scheduleAt(T1, aBatch, inHours(200), {
        ctx: A.ctx,
        recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
      });
      const res = await h.api(
        'POST',
        `/academy/me/batches/${aBatch}/sessions/${sid}/cancel?series=true`,
        A.owner.token,
      );
      expect(res.status).toBe(201);
      const notices = await forSession(T1, CANCEL_TEACHER, sid);
      expect(notices).toHaveLength(1);
      expect((notices[0].payload as any).body).toMatch(
        /^3 upcoming Mathematics Academy classes/,
      );
    });

    it('a TEACHER cancelling their own class (Individual or Academy profile): existing behaviour, no teacher notice', async () => {
      const ind = await h.scheduleAt(T1, iBatch, inHours(42));
      const acad = await h.scheduleAt(T1, aBatch, inHours(43), { ctx: A.ctx });
      expect(
        (await h.api('POST', `/sessions/${ind}/cancel`, T1.token)).status,
      ).toBe(201);
      expect(
        (
          await h.api('POST', `/sessions/${acad}/cancel`, T1.token, {
            ctx: A.ctx,
          })
        ).status,
      ).toBe(201);

      for (const sid of [ind, acad]) {
        expect(await forSession(T1, CANCEL_TEACHER, sid)).toHaveLength(0);
        expect(await forSession(T1, 'class_cancelled', sid)).toHaveLength(0);
      }
      expect(await forSession(sInd, 'class_cancelled', ind)).toHaveLength(1);
      expect(await forSession(sAcad, 'class_cancelled', acad)).toHaveLength(1);
      expect(
        ((await forSession(sAcad, 'class_cancelled', acad))[0].payload as any)
          .body,
      ).toMatch(/cancelled by your teacher/);
    });

    it('unauthorized / failed cancels send nothing and change nothing (Individual, other academy, non-member, wrong role, past class)', async () => {
      const indSid = await h.scheduleAt(T1, iBatch, inHours(44));
      const bSid = await h.scheduleAt(T3, bBatch, inHours(45), { ctx: B.ctx });
      const aSid = await h.scheduleAt(T1, aBatch, inHours(46), { ctx: A.ctx });

      // Academy A -> the teacher's Individual class, and -> Academy B's class.
      for (const [batch, sid] of [
        [iBatch, indSid],
        [aBatch, indSid],
        [bBatch, bSid],
        [aBatch, bSid],
      ] as const) {
        expect([403, 404]).toContain(
          (await academyCancel(A.owner, batch, sid)).status,
        );
      }
      // Academy B -> Academy A's class.
      expect([403, 404]).toContain(
        (await academyCancel(B.owner, aBatch, aSid)).status,
      );
      // Teachers (any) hitting the academy-admin route.
      for (const t of [T1, T2, T3]) {
        expect((await academyCancel(t, aBatch, aSid)).status).toBe(403);
      }
      // Non-member teacher on the teacher route; owner in the wrong context.
      expect(
        (
          await h.api('POST', `/sessions/${aSid}/cancel`, T3.token, {
            ctx: A.ctx,
          })
        ).status,
      ).toBe(403);
      expect(
        (await h.api('POST', `/sessions/${aSid}/cancel`, T1.token)).status,
      ).toBe(403);

      for (const sid of [indSid, bSid, aSid]) {
        expect((await sessionRow(sid)).status).toBe('scheduled');
        for (const u of [T1, T2, T3, sInd, sAcad, pAcad]) {
          expect(await forSession(u, CANCEL_TEACHER, sid)).toHaveLength(0);
          expect(await forSession(u, 'class_cancelled', sid)).toHaveLength(0);
        }
      }

      // A class that already started can't be cancelled -> nothing sent.
      const started = await h.scheduleAt(T1, aBatch, inHours(47), {
        ctx: A.ctx,
      });
      await h.db
        .updateTable('class_sessions')
        .set({ scheduled_start_utc: inHours(-2) })
        .where('id', '=', started)
        .execute();
      expect((await academyCancel(A.owner, aBatch, started)).status).toBe(400);
      expect(await forSession(T1, CANCEL_TEACHER, started)).toHaveLength(0);
    });

    it('a departed teacher cannot act on the Academy class, and a substitute cannot cancel / edit / reschedule / complete it', async () => {
      const sid = await h.scheduleAt(T4, a4Batch, inHours(48), { ctx: A.ctx });
      await h.db
        .updateTable('academy_memberships')
        .set({ status: 'left', left_at: new Date() })
        .where('tutor_id', '=', T4.id)
        .execute();
      for (const [m, path, body] of [
        ['POST', `/sessions/${sid}/cancel`, undefined],
        ['POST', `/sessions/${sid}/complete`, undefined],
        [
          'POST',
          `/sessions/${sid}/reschedule`,
          { newStartLocal: at(istDay(9), '10:00'), timezone: IST },
        ],
      ] as const) {
        expect(
          (await h.api(m, path, T4.token, { ctx: A.ctx, body })).status,
        ).toBe(403);
      }
      expect((await sessionRow(sid)).status).toBe('scheduled');
      // The academy keeps authority: it CAN cancel, and the departed teacher
      // is (correctly) not told about an Academy class they no longer run.
      expect((await academyCancel(A.owner, a4Batch, sid)).status).toBe(201);
      expect(await forSession(T4, CANCEL_TEACHER, sid)).toHaveLength(0);

      // Substitute (T2 covering T1's class) is view + attendance only.
      const covered = await h.scheduleAt(T1, aBatch, inHours(49), {
        ctx: A.ctx,
      });
      await h.db
        .updateTable('class_sessions')
        .set({ substitute_tutor_id: T2.id })
        .where('id', '=', covered)
        .execute();
      for (const [m, path, body] of [
        ['POST', `/sessions/${covered}/cancel`, undefined],
        ['POST', `/sessions/${covered}/complete`, undefined],
        [
          'POST',
          `/sessions/${covered}/reschedule`,
          { newStartLocal: at(istDay(9), '10:00'), timezone: IST },
        ],
        [
          'PATCH',
          `/sessions/${covered}`,
          { meetingUrl: 'https://meet.example.com/x' },
        ],
      ] as const) {
        expect(
          (await h.api(m, path, T2.token, { ctx: A.ctx, body })).status,
        ).toBe(403);
      }
      expect((await sessionRow(covered)).status).toBe('scheduled');
    });

    it('no obsolete reminder: a class cancelled by the academy never gets "starts in 10 minutes"', async () => {
      const reminders = h.app.get(RemindersService);
      // Cancel first (outside the window, so no other suite's global sweep can
      // remind a still-scheduled copy), then move the cancelled row into the
      // 10-minute window the sweep looks at.
      const sid = await h.scheduleAt(T1, aBatch, inHours(3), { ctx: A.ctx });
      expect((await academyCancel(A.owner, aBatch, sid)).status).toBe(201);
      await h.db
        .updateTable('class_sessions')
        .set({ scheduled_start_utc: new Date(Date.now() + 10 * 60_000) })
        .where('id', '=', sid)
        .execute();
      await Promise.all([
        reminders.sendUpcomingClassReminders(),
        reminders.sendUpcomingClassReminders(),
      ]);
      expect(await forSession(sAcad, 'class_reminder', sid)).toHaveLength(0);
      expect(await forSession(pAcad, 'class_reminder', sid)).toHaveLength(0);
      expect(await forSession(sAcad, 'class_cancelled', sid)).toHaveLength(1);
      expect(await forSession(T1, CANCEL_TEACHER, sid)).toHaveLength(1);
    });
  });

  // ==================================== D + E — leave, substitute, wording
  describe('D/E: leave approval, substitute assignment and notice wording', () => {
    const classOn = async (day: string, hhmm = '12:00') => {
      const res = await academyCreate(A.owner, aBatch, at(day, hhmm));
      expect(res.status).toBe(201);
      return res.body.id as string;
    };

    it('approve WITH a substitute: the substitute (only) is told; students/parents get the date-aware notice, not "Today\'s"', async () => {
      const day = istDay(12);
      const sid = await classOn(day);
      const leaveId = await approvedLeave(T1, A, day, {
        substituteTutorId: T2.id,
      });

      // Saved: the class stays scheduled with the substitute assigned.
      const row = await sessionRow(sid);
      expect(row.status).toBe('scheduled');
      expect(row.substitute_tutor_id).toBe(T2.id);
      expect(row.teacher_leave_request_id).toBe(leaveId);

      const sub = await forSession(T2, SUB_ASSIGNED, sid);
      expect(sub).toHaveLength(1);
      const p = sub[0].payload as any;
      const label = DateTime.fromISO(day, { zone: IST }).toFormat(
        'cccc, d LLLL',
      );
      expect(p.body).toBe(
        `You have been assigned to cover Tutor t1 ${h.MARKER}'s Mathematics Academy class on ${label} at 12:00 PM at Academy a ${h.MARKER}.`,
      );
      expect(p.leaveRequestId).toBe(leaveId);
      expect(p.originalTutorId).toBe(T1.id);
      expect(p.academyId).toBe(A.id);

      // Only the substitute.
      for (const u of [T1, T3, T4, sAcad, pAcad, sInd, A.owner, B.owner]) {
        expect(await forSession(u, SUB_ASSIGNED, sid)).toHaveLength(0);
      }

      // Student/parent: existing type + recipients, now with the real date.
      for (const u of [sAcad, pAcad]) {
        const n = await forSession(u, 'class_substitute', sid);
        expect(n).toHaveLength(1);
        const body = (n[0].payload as any).body as string;
        expect(body).toMatch(
          new RegExp(
            `^Your Mathematics Academy class on ${label} at 12:00 PM will be conducted by Tutor t2 .+ instead of the usual teacher\\.$`,
          ),
        );
        expect(body).not.toMatch(/Today/);
      }
      // The on-leave teacher still gets their own approval notice.
      expect(
        await h.notificationsFor(T1.id, 'teacher_leave_approved'),
      ).not.toHaveLength(0);

      // The substitute sees "Covering for…" and can mark attendance only.
      const window = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 30 * 864e5).toISOString()}`;
      const cal = await h.api('GET', `/sessions/me?${window}`, T2.token, {
        ctx: A.ctx,
      });
      expect((cal.body as any[]).find((s) => s.id === sid)).toMatchObject({
        viewer_role: 'substitute',
        substitute_display_name: `Tutor t2 ${h.MARKER}`,
      });
      for (const [m, path, body] of [
        ['POST', `/sessions/${sid}/cancel`, undefined],
        [
          'POST',
          `/sessions/${sid}/reschedule`,
          { newStartLocal: at(istDay(13), '10:00'), timezone: IST },
        ],
        ['POST', `/sessions/${sid}/complete`, undefined],
      ] as const) {
        expect(
          (await h.api(m, path, T2.token, { ctx: A.ctx, body })).status,
        ).toBe(403);
      }
    });

    it('a class TOMORROW (IST) says "Tomorrow\'s"; leave without a substitute says cancelled', async () => {
      const day = istDay(1);
      const sid = await classOn(day, '20:00');
      await approvedLeave(T1, A, day);

      expect((await sessionRow(sid)).status).toBe('cancelled');
      expect((await sessionRow(sid)).cancellation_reason).toBe('teacher_leave');
      const n = await forSession(sAcad, 'class_cancelled_leave', sid);
      expect(n).toHaveLength(1);
      expect((n[0].payload as any).body).toBe(
        "Tomorrow's Mathematics Academy class at 8:00 PM has been cancelled because your teacher is on approved leave.",
      );
      expect(
        await forSession(pAcad, 'class_cancelled_leave', sid),
      ).toHaveLength(1);
    });

    it('assigning a substitute LATER notifies them once; repeating the same assignment adds nothing', async () => {
      const day = istDay(14);
      const sid = await classOn(day);
      const leaveId = await approvedLeave(T1, A, day); // no substitute yet
      expect((await sessionRow(sid)).status).toBe('cancelled');
      expect(await forSession(T2, SUB_ASSIGNED, sid)).toHaveLength(0);

      const assign = () =>
        h.api(
          'POST',
          `/academy/me/leave-requests/${leaveId}/substitute`,
          A.owner.token,
          { body: { substituteTutorId: T2.id } },
        );
      expect((await assign()).status).toBe(201);
      expect(await forSession(T2, SUB_ASSIGNED, sid)).toHaveLength(1);
      expect((await sessionRow(sid)).status).toBe('scheduled');
      expect((await assign()).status).toBe(201);
      expect(await forSession(T2, SUB_ASSIGNED, sid)).toHaveLength(1);
    });

    it('failed / cross-academy substitute assignment notifies nobody', async () => {
      const day = istDay(15);
      const sid = await classOn(day);
      const leaveId = await approvedLeave(T1, A, day);
      const before = (await h.notificationsFor(T3.id, SUB_ASSIGNED)).length;

      // Academy B cannot touch Academy A's request.
      const cross = await h.api(
        'POST',
        `/academy/me/leave-requests/${leaveId}/substitute`,
        B.owner.token,
        { body: { substituteTutorId: T3.id } },
      );
      expect(cross.status).toBe(404);
      // A substitute who is not a member of the academy is refused.
      const outsider = await h.api(
        'POST',
        `/academy/me/leave-requests/${leaveId}/substitute`,
        A.owner.token,
        { body: { substituteTutorId: T3.id } },
      );
      expect(outsider.status).toBe(400);
      // The teacher on leave cannot substitute for themself.
      const self = await h.api(
        'POST',
        `/academy/me/leave-requests/${leaveId}/substitute`,
        A.owner.token,
        { body: { substituteTutorId: T1.id } },
      );
      expect(self.status).toBe(400);

      expect((await h.notificationsFor(T3.id, SUB_ASSIGNED)).length).toBe(
        before,
      );
      for (const u of [T1, T2, T3]) {
        expect(await forSession(u, SUB_ASSIGNED, sid)).toHaveLength(0);
      }
      expect((await sessionRow(sid)).substitute_tutor_id).toBeNull();
    });

    it('re-approving an already-approved request is rejected and sends no second notice', async () => {
      const day = istDay(16);
      const sid = await classOn(day);
      const leaveId = await approvedLeave(T1, A, day, {
        substituteTutorId: T2.id,
      });
      const again = await h.api(
        'POST',
        `/academy/me/leave-requests/${leaveId}/approve`,
        A.owner.token,
        { body: { substituteTutorId: T2.id } },
      );
      expect(again.status).toBe(400);
      expect(await forSession(T2, SUB_ASSIGNED, sid)).toHaveLength(1);
      expect(await forSession(sAcad, 'class_substitute', sid)).toHaveLength(1);
    });
  });

  // ==================================== F — approved leave blocks new classes
  describe('F: approved leave blocks NEW conflicting Academy classes only', () => {
    const D = istDay(20);
    let leaveId: string;
    let existingIndividual: string;

    beforeAll(async () => {
      // An Individual class already on D, created BEFORE the leave.
      existingIndividual = (await teacherCreate(T1, iBatch, at(D, '11:00')))
        .body.id;
      leaveId = await approvedLeave(T1, A, D);
    });

    const noClassAt = async (batchId: string, day: string, hhmm: string) => {
      const start = DateTime.fromISO(`${day}T${hhmm}:00`, { zone: IST })
        .toUTC()
        .toJSDate();
      const rows = await sessionsOn(batchId);
      return rows.filter(
        (r) => r.scheduled_start_utc.getTime() === start.getTime(),
      );
    };

    it('the leave is approved and only touched the academy side', async () => {
      const req = await h.db
        .selectFrom('teacher_leave_requests')
        .selectAll()
        .where('id', '=', leaveId)
        .executeTakeFirstOrThrow();
      expect(req.status).toBe('approved');
      // The pre-existing Individual class is untouched by the leave workflow.
      expect((await sessionRow(existingIndividual)).status).toBe('scheduled');
    });

    it('a new Academy class for that teacher during the leave -> 409 TEACHER_ON_APPROVED_LEAVE; no session, no class-created notice, no reminder', async () => {
      const createdBefore = (
        await h.notificationsFor(sAcad.id, 'class_created')
      ).length;
      const parentBefore = (await h.notificationsFor(pAcad.id, 'class_created'))
        .length;
      const viaAdmin = await academyCreate(A.owner, aBatch, at(D, '16:00'));
      expect(viaAdmin.status).toBe(409);
      expect(viaAdmin.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');
      expect(viaAdmin.body.message).toMatch(/on approved leave/);

      const viaTeacher = await teacherCreate(T1, aBatch, at(D, '16:00'), A.ctx);
      expect(viaTeacher.status).toBe(409);
      expect(viaTeacher.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');

      expect(await noClassAt(aBatch, D, '16:00')).toHaveLength(0);
      expect((await h.notificationsFor(sAcad.id, 'class_created')).length).toBe(
        createdBefore,
      );
      expect((await h.notificationsFor(pAcad.id, 'class_created')).length).toBe(
        parentBefore,
      );
      // Nothing scheduled on D for that batch => no reminder can ever fire.
      const onD = (await sessionsOn(aBatch)).filter(
        (r) =>
          r.status === 'scheduled' &&
          DateTime.fromJSDate(r.scheduled_start_utc, {
            zone: IST,
          }).toISODate() === D,
      );
      expect(onD).toHaveLength(0);
    });

    it('a recurring series cannot smuggle a class into the leave (weekly series that lands on the leave day)', async () => {
      const start = istDay(20 - 7);
      const res = await academyCreate(A.owner, aBatch, at(start, '16:00'), {
        recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');
      // Whole series rejected: not even the week before the leave exists.
      expect(await noClassAt(aBatch, start, '16:00')).toHaveLength(0);
    });

    it('non-conflicting days stay allowed: the day before and the day after', async () => {
      expect(
        (await academyCreate(A.owner, aBatch, at(istDay(19), '16:00'))).status,
      ).toBe(201);
      expect(
        (await academyCreate(A.owner, aBatch, at(istDay(21), '16:00'))).status,
      ).toBe(201);
    });

    it('interval semantics: back-to-back is fine, real overlap into the leave day is not', async () => {
      const dayBefore = istDay(19);
      // 22:30-23:30 the evening before: ends before the leave day starts.
      expect(
        (await academyCreate(A.owner, aBatch, at(dayBefore, '22:30'))).status,
      ).toBe(201);
      // 23:30-00:30 spills into the leave day: conflict.
      const spill = await academyCreate(
        A.owner,
        aBatch,
        at(dayBefore, '23:30'),
      );
      expect(spill.status).toBe(409);
      expect(spill.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');
    });

    it("Individual isolation: the same teacher's Individual class during Academy leave is allowed (academy_id NULL)", async () => {
      const res = await teacherCreate(T1, iBatch, at(D, '16:00'));
      expect(res.status).toBe(201);
      const row = await sessionRow(res.body.id as string);
      const batch = await h.db
        .selectFrom('batches')
        .select('academy_id')
        .where('id', '=', row.batch_id)
        .executeTakeFirstOrThrow();
      expect(batch.academy_id).toBeNull();
      expect(row.status).toBe('scheduled');
    });

    it("other academy / other teacher are unaffected: Academy B class on the same day, and Academy A's other teacher", async () => {
      // Academy B creates a class for its own teacher on D.
      const b = await academyCreate(B.owner, bBatch, at(D, '16:00'));
      expect(b.status).toBe(201);
      // Teacher B (T2) at the same academy creates a class on D.
      const other = await academyCreate(A.owner, a2Batch, at(D, '16:00'));
      expect(other.status).toBe(201);
      // T3 (another academy) creating in their own context.
      expect(
        (await teacherCreate(T3, bBatch, at(D, '18:00'), B.ctx)).status,
      ).toBe(201);
    });

    it('the already-scheduled classes and the existing leave workflow are untouched by the guard', async () => {
      expect((await sessionRow(existingIndividual)).status).toBe('scheduled');
      expect(
        (
          await h.db
            .selectFrom('teacher_leave_requests')
            .select('status')
            .where('id', '=', leaveId)
            .executeTakeFirstOrThrow()
        ).status,
      ).toBe('approved');
    });

    it('mobile / direct API route is the same guarded endpoint (no context header -> 403, with header -> 409)', async () => {
      expect((await teacherCreate(T1, aBatch, at(D, '17:30'))).status).toBe(
        403,
      );
      const res = await teacherCreate(T1, aBatch, at(D, '17:30'), A.ctx);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');
      // A client-supplied academyId is not accepted at all.
      expect(
        (
          await teacherCreate(T1, aBatch, at(D, '17:30'), A.ctx, {
            academyId: B.id,
          })
        ).status,
      ).toBe(400);
    });

    it('specific-classes leave blocks only the time slots of the classes it covers (half-open)', async () => {
      const day = istDay(25);
      const covered = (await academyCreate(A.owner, aBatch, at(day, '12:00')))
        .body.id as string;
      await approvedLeave(T1, A, day, {
        leaveType: 'specific_classes',
        sessionIds: [covered],
      });
      // Overlapping the covered 12:00-13:00 slot -> blocked.
      const clash = await academyCreate(A.owner, aBatch, at(day, '12:30'));
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('TEACHER_ON_APPROVED_LEAVE');
      // Ends exactly when the slot starts / starts exactly when it ends -> fine.
      expect(
        (await academyCreate(A.owner, aBatch, at(day, '11:00'))).status,
      ).toBe(201);
      expect(
        (await academyCreate(A.owner, aBatch, at(day, '13:00'))).status,
      ).toBe(201);
      // A later slot the same day is not on leave.
      expect(
        (await academyCreate(A.owner, aBatch, at(day, '18:00'))).status,
      ).toBe(201);
    });

    it('a pending or rejected leave does not block scheduling', async () => {
      const day = istDay(30);
      const created = await h.api('POST', '/leave', T1.token, {
        body: { academyId: A.id, startDate: day, leaveType: 'full_day' },
      });
      expect(created.status).toBe(201); // pending
      expect(
        (await academyCreate(A.owner, aBatch, at(day, '16:00'))).status,
      ).toBe(201);
    });
  });
});
