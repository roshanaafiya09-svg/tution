/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { newId } from '../src/database/id';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Reports consistency, teacher departure and messaging context — real HTTP,
 * real Postgres, real JWTs.
 *
 *  1  Every Academy number that appears on more than one page agrees, and
 *     Individual / other-Academy data never leaks into an Academy report
 *  2  A teacher leaving an Academy: future Academy classes are handled,
 *     Individual + other-Academy classes and history are untouched
 *  3  Messaging honours the teaching context (Individual vs Academy A vs B)
 */
jest.setTimeout(300_000);

const IST = 'Asia/Kolkata';

describe('Reports / teacher departure / messaging context (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // Individual + A
  let T2: Actor; // A
  let T3: Actor; // A + B
  let TX: Actor; // Individual only
  const S: Record<string, Actor> = {};
  let A1: string;
  let A2: string;
  let A3: string;
  let A4: string;
  let B1: string;
  let I1: string;
  let I2: string;

  const dayStart = () => DateTime.now().setZone(IST).startOf('day');
  const d = (n: number) => dayStart().plus({ days: n }).toISODate()!;
  const local = (dt: DateTime) => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const mkSession = async (
    t: Actor,
    batch: string,
    dt: DateTime,
    ctx?: string,
  ) => {
    const res = await h.api('POST', '/sessions', t.token, {
      ctx,
      body: {
        batchId: batch,
        startLocal: local(dt),
        durationMin: 30,
        timezone: IST,
      },
    });
    if (res.status !== 201)
      throw new Error(`session ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  };
  const mark = (
    t: Actor,
    ctx: string | undefined,
    sid: string,
    st: Actor,
    status: string,
  ) =>
    h.api('POST', `/attendance/session/${sid}/mark`, t.token, {
      ctx,
      body: { studentId: st.id, status },
    });
  const complete = (t: Actor, ctx: string | undefined, sid: string) =>
    h.api('POST', `/sessions/${sid}/complete`, t.token, { ctx });
  const get = (u: Actor, url: string) => h.api('GET', url, u.token);
  const notes = async (u: Actor, type: string) =>
    (await h.notificationsFor(u.id, type)) as Array<{
      payload: Record<string, any>;
    }>;

  beforeAll(async () => {
    h = await createHarness('rd');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    T3 = await h.makeUser('tutor', 't3');
    TX = await h.makeUser('tutor', 'tx');
    await h.join(A.id, T1.id);
    await h.join(A.id, T2.id);
    await h.join(A.id, T3.id);
    await h.join(B.id, T3.id);
    for (const n of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) {
      S[n] = await h.makeUser('student', n);
    }
    A1 = await h.createBatch(T1, { ctx: A.ctx, title: 'A1' });
    A2 = await h.createBatch(T2, { ctx: A.ctx, title: 'A2' });
    A3 = await h.createBatch(T3, { ctx: A.ctx, title: 'A3' });
    A4 = await h.createBatch(T2, { ctx: A.ctx, title: 'A4 archived' });
    B1 = await h.createBatch(T3, { ctx: B.ctx, title: 'B1' });
    I1 = await h.createBatch(T1, { title: 'I1' });
    I2 = await h.createBatch(TX, { title: 'I2' });
    expect(
      (await h.api('POST', `/batches/${A4}/archive`, T2.token, { ctx: A.ctx }))
        .status,
    ).toBe(201);
    // s1: A1+A2 (one student, two enrolments); s2: A1; s3: A2 then removed; s4: Individual only;
    // s5: Academy B only; s6: A3 + I1; s7: A1, attends once, then leaves.
    await h.enroll(A1, S.s1.id);
    await h.enroll(A2, S.s1.id);
    await h.enroll(A1, S.s2.id);
    await h.enroll(A2, S.s3.id);
    await h.enroll(I1, S.s4.id);
    await h.enroll(I2, S.s4.id);
    await h.enroll(B1, S.s5.id);
    await h.enroll(A3, S.s6.id);
    await h.enroll(I1, S.s6.id);
    await h.enroll(A1, S.s7.id);
    await h.db
      .updateTable('enrollments')
      .set({ status: 'left', left_at: new Date() })
      .where('batch_id', '=', A2)
      .where('student_id', '=', S.s3.id)
      .execute();
  });

  afterAll(async () => {
    if (h) {
      // Every user this suite created (including those made inside tests) carries
      // the harness marker in their email; messages reference users with no cascade.
      const mine = (eb: any) =>
        eb
          .selectFrom('users')
          .select('id')
          .where('email', 'like', `${h.MARKER}-%`);
      await h.db
        .deleteFrom('messages')
        .where((eb) =>
          eb.or([
            eb('student_id', 'in', mine(eb)),
            eb('sender_id', 'in', mine(eb)),
          ]),
        )
        .execute();
      await h.db
        .deleteFrom('holidays')
        .where('academy_id', 'in', [A.id, B.id])
        .execute();
    }
    await h?.close();
  });

  // ==================================================================
  // 1. REPORT CONSISTENCY
  // ==================================================================
  describe('1: Academy numbers agree across dashboard / detail / report / database', () => {
    let pA1a: string;
    let pA1b: string;
    let sA1: string;

    beforeAll(async () => {
      const day0 = dayStart();
      // Today (Academy A): A1 completed, A2 scheduled later, A3 cancelled by the academy.
      // Individual + Academy B classes today must never be counted.
      sA1 = await mkSession(T1, A1, day0.plus({ minutes: 10 }), A.ctx);
      await mkSession(T2, A2, day0.plus({ hours: 23, minutes: 50 }), A.ctx);
      const sA3 = await mkSession(
        T3,
        A3,
        day0.plus({ hours: 23, minutes: 20 }),
        A.ctx,
      );
      const sI1 = await mkSession(T1, I1, day0.plus({ minutes: 55 }));
      const sB1 = await mkSession(T3, B1, day0.plus({ minutes: 30 }), B.ctx);
      expect((await complete(T1, A.ctx, sA1)).status).toBe(201);
      expect((await complete(T1, undefined, sI1)).status).toBe(201);
      expect((await complete(T3, B.ctx, sB1)).status).toBe(201);
      expect(
        (
          await h.api(
            'POST',
            `/academy/me/batches/${A3}/sessions/${sA3}/cancel`,
            A.owner.token,
          )
        ).status,
      ).toBe(201);
      // Past completed classes in A1 (with a since-departed student's attendance row).
      pA1a = await mkSession(
        T1,
        A1,
        day0.minus({ days: 1 }).plus({ hours: 10 }),
        A.ctx,
      );
      pA1b = await mkSession(
        T1,
        A1,
        day0.minus({ days: 3 }).plus({ hours: 10 }),
        A.ctx,
      );
      const pI = await mkSession(
        T1,
        I1,
        day0.minus({ days: 1 }).plus({ hours: 14 }),
      );
      for (const [ctx, sid] of [
        [A.ctx, pA1a],
        [A.ctx, pA1b],
        [undefined, pI],
      ] as const) {
        expect((await complete(T1, ctx, sid)).status).toBe(201);
      }
      // Attendance. A1 today: s1 present, s2 UNMARKED (=> absent on a completed class).
      await mark(T1, A.ctx, sA1, S.s1, 'present');
      await mark(T1, A.ctx, pA1a, S.s1, 'present');
      await mark(T1, A.ctx, pA1a, S.s2, 'absent');
      await mark(T1, A.ctx, pA1b, S.s1, 'absent');
      await mark(T1, A.ctx, pA1b, S.s2, 'present');
      await mark(T1, A.ctx, pA1b, S.s7, 'present');
      await h.db
        .updateTable('enrollments')
        .set({ status: 'left', left_at: new Date() })
        .where('batch_id', '=', A1)
        .where('student_id', '=', S.s7.id)
        .execute();
      // Individual attendance never enters an Academy number.
      await mark(T1, undefined, sI1, S.s6, 'absent');
      await mark(T1, undefined, pI, S.s4, 'absent');
      // Leave: pending (T1), approved (T2), rejected (T3).
      const leave = async (t: Actor, day: string) =>
        (
          await h.api('POST', '/leave', t.token, {
            body: { academyId: A.id, startDate: day, leaveType: 'full_day' },
          })
        ).body.id as string;
      await leave(T1, d(20));
      const l2 = await leave(T2, d(22));
      const l3 = await leave(T3, d(24));
      await h.api(
        'POST',
        `/academy/me/leave-requests/${l2}/approve`,
        A.owner.token,
        { body: {} },
      );
      await h.api(
        'POST',
        `/academy/me/leave-requests/${l3}/reject`,
        A.owner.token,
        {
          body: { reason: 'no' },
        },
      );
      // A holiday and two contact requests.
      await h.api('POST', '/academy/me/holidays', A.owner.token, {
        body: {
          name: 'Hol',
          startDate: d(10),
          endDate: d(11),
          scope: 'academy',
        },
      });
      await h.api(
        'POST',
        `/marketplace/academies/${A.slug}/contact`,
        S.s4.token,
        { body: { message: 'hi' } },
      );
      await h.api(
        'POST',
        `/marketplace/academies/${A.slug}/contact`,
        S.s5.token,
        { body: { message: 'hi' } },
      );
    });

    it('STUDENTS: dashboard tile = Students report = active distinct students in the database', async () => {
      const summary = (await get(A.owner, '/academy/me/reports/summary')).body;
      const report = (await get(A.owner, '/academy/me/reports/students')).body;
      const stats = (await get(A.owner, '/academy/me/stats')).body;
      const active = await h.db
        .selectFrom('enrollments')
        .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
        .select((eb) =>
          eb.fn.count('enrollments.student_id').distinct().as('c'),
        )
        .where('batches.academy_id', '=', A.id)
        .where('enrollments.status', '=', 'active')
        .executeTakeFirstOrThrow();
      const ever = await h.db
        .selectFrom('enrollments')
        .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
        .select((eb) =>
          eb.fn.count('enrollments.student_id').distinct().as('c'),
        )
        .where('batches.academy_id', '=', A.id)
        .executeTakeFirstOrThrow();
      // s1, s2, s6 are active; s3 and s7 left (5 ever); s4 (Individual) and s5 (B) never count.
      expect(Number(active.c)).toBe(3);
      expect(Number(ever.c)).toBe(5);
      expect(summary.studentsCount).toBe(3);
      expect(report.totalStudents).toBe(3);
      expect(stats.studentsCount).toBe(3);
      // "New in range" counts students (first enrolment), never enrolments: s1 is in
      // two batches but is ONE new student, so it can never exceed the total.
      expect(report.newStudentsInRange).toBe(3);
      expect(report.newStudentsInRange).toBeLessThanOrEqual(
        report.totalStudents,
      );
      // The Students page lists ENROLMENTS (s1 is in two batches): 4 rows, 3 people.
      const page = (await get(A.owner, '/academy/me/students?status=active'))
        .body;
      expect(page).toHaveLength(4);
      expect(
        new Set(page.map((r: any) => r.studentId ?? r.student_id)).size,
      ).toBe(3);
    });

    it('TEACHERS / BATCHES: every page agrees with the database', async () => {
      const summary = (await get(A.owner, '/academy/me/reports/summary')).body;
      const teachersRpt = (await get(A.owner, '/academy/me/reports/teachers'))
        .body;
      const batchesRpt = (await get(A.owner, '/academy/me/reports/batches'))
        .body;
      const today = (await get(A.owner, '/academy/me/today')).body;
      const active = (await get(A.owner, '/academy/me/teachers/active')).body;
      expect(summary.teacherCount).toBe(3);
      expect(teachersRpt.totalTeachers).toBe(3);
      expect(today.overview.teachersActive).toBe(3);
      expect(active).toHaveLength(3);
      expect(summary.batchCount).toBe(4); // A1, A2, A3, A4 — never I1/I2/B1
      expect(summary.activeBatchCount).toBe(3);
      expect(batchesRpt.totalBatches).toBe(4);
      expect(batchesRpt.activeBatches).toBe(3);
      const list = (await get(A.owner, '/academy/me/batches')).body;
      expect(list).toHaveLength(4);
      expect(
        batchesRpt.rows.reduce((s: number, r: any) => s + r.enrolledCount, 0),
      ).toBe(4);
    });

    it('CLASSES TODAY: Today tile = Reports summary = Attendance card = sessions list = database (Individual + Academy B excluded)', async () => {
      const today = (await get(A.owner, '/academy/me/today')).body;
      const summary = (await get(A.owner, '/academy/me/reports/summary')).body;
      const att = (await get(A.owner, '/academy/me/attendance/today')).body;
      const from = dayStart().toUTC().toISO()!;
      const to = dayStart().plus({ days: 1 }).toUTC().toISO()!;
      const list = (
        await get(A.owner, `/academy/me/sessions?from=${from}&to=${to}`)
      ).body;
      const db = await h.db
        .selectFrom('class_sessions')
        .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
        .select(['class_sessions.status'])
        .where('batches.academy_id', '=', A.id)
        .where('class_sessions.scheduled_start_utc', '>=', new Date(from))
        .where('class_sessions.scheduled_start_utc', '<', new Date(to))
        .execute();
      const happening = db.filter((r) => r.status !== 'cancelled').length;
      expect(happening).toBe(2);
      expect(today.overview.classesToday).toBe(happening);
      expect(summary.sessionsToday).toBe(happening);
      expect(att.classesToday).toBe(happening);
      expect(list.filter((s: any) => s.status !== 'cancelled')).toHaveLength(
        happening,
      );
      expect(today.overview.classesCancelledToday).toBe(
        db.filter((r) => r.status === 'cancelled').length,
      );
    });

    it('SESSIONS report (30d): totals and per-status counts equal the rows and the database', async () => {
      const rpt = (
        await get(
          A.owner,
          `/academy/me/reports/sessions?from=${d(-30)}&to=${d(0)}`,
        )
      ).body;
      const rows = await h.db
        .selectFrom('class_sessions')
        .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
        .select('class_sessions.status')
        .where('batches.academy_id', '=', A.id)
        .where(
          'class_sessions.scheduled_start_utc',
          '>=',
          dayStart().minus({ days: 30 }).toJSDate(),
        )
        .where(
          'class_sessions.scheduled_start_utc',
          '<',
          dayStart().plus({ days: 1 }).toJSDate(),
        )
        .execute();
      const by = (st: string) => rows.filter((r) => r.status === st).length;
      expect(rpt.total).toBe(rows.length);
      expect(rpt.completed).toBe(by('completed'));
      expect(rpt.cancelled).toBe(by('cancelled'));
      expect(rpt.scheduled).toBe(by('scheduled'));
      expect(rpt.rows).toHaveLength(rpt.total);
      const teachers = (await get(A.owner, '/academy/me/reports/teachers'))
        .body;
      expect(
        teachers.rows.reduce((s: number, r: any) => s + r.classCount, 0),
      ).toBe(rpt.total);
    });

    it('ATTENDANCE: the Today card, the per-class table and the absent report use one definition', async () => {
      const att = (await get(A.owner, '/academy/me/attendance/today')).body;
      const table = (
        await get(
          A.owner,
          `/academy/me/attendance?from=${dayStart().minus({ days: 7 }).toUTC().toISO()}&to=${dayStart().plus({ days: 1 }).toUTC().toISO()}`,
        )
      ).body;
      const report = (
        await get(
          A.owner,
          `/academy/me/reports/attendance?from=${d(-7)}&to=${d(0)}`,
        )
      ).body;

      // Today: s1 present, s2 unmarked on the COMPLETED A1 class -> present 1, absent 1.
      expect(att.present).toBe(1);
      expect(att.absent).toBe(1);
      const todayCompleted = table.filter(
        (r: any) =>
          r.status === 'completed' &&
          new Date(r.scheduledStartUtc) >= dayStart().toJSDate(),
      );
      expect(
        todayCompleted.reduce((s: number, r: any) => s + r.absent, 0),
      ).toBe(att.absent);

      // Whole week: the table's absent seats on completed classes = the report's absent rows.
      const tableAbsent = table
        .filter((r: any) => r.status === 'completed')
        .reduce((s: number, r: any) => s + r.absent, 0);
      expect(report.totalAbsences).toBe(tableAbsent);
      // pA1b: s1 explicit absent; s2 + s7 present. s7 has since LEFT, but their row counts.
      const rowB = table.find((r: any) => r.sessionId === pA1b);
      expect(rowB).toBeDefined();
      expect(rowB.present).toBe(2);
      expect(rowB.absent).toBe(1);
      expect(rowB.totalStudents).toBe(3);
      expect(rowB.attendancePercent).toBe(67);
      // Individual attendance (s4 / s6 absent in I1) never appears.
      expect(
        report.rows.some(
          (r: any) =>
            [S.s4.id, S.s6.id].includes(r.studentId) && r.batchId === I1,
        ),
      ).toBe(false);
    });

    it('LEAVE and CONTACT numbers agree across summary / Today / report / teachers report', async () => {
      const summary = (await get(A.owner, '/academy/me/reports/summary')).body;
      const today = (await get(A.owner, '/academy/me/today')).body;
      const leave = (await get(A.owner, '/academy/me/reports/leave')).body;
      const teachers = (await get(A.owner, '/academy/me/reports/teachers'))
        .body;
      const contact = (
        await get(A.owner, '/academy/me/reports/contact-requests')
      ).body;
      expect(summary.pendingLeaveCount).toBe(1);
      expect(today.needsAttention.pendingLeaveRequests).toBe(1);
      expect(leave.pendingCount).toBe(1);
      expect(
        teachers.rows.reduce((s: number, r: any) => s + r.pendingLeaveCount, 0),
      ).toBe(1);
      expect(leave.approvedCount).toBe(1);
      expect(leave.rejectedCount).toBe(1);
      expect(summary.contactRequestsByStatus.new).toBe(2);
      expect(today.needsAttention.pendingContactRequests).toBe(2);
      expect(contact.byStatus.new).toBe(2);
    });

    it('HOLIDAYS: reports honour the government-holiday opt-in exactly like the calendar', async () => {
      const from = d(0);
      const to = d(120);
      const calendar = async () =>
        (await get(A.owner, `/academy/me/holidays?from=${from}&to=${to}`)).body;
      const report = async () =>
        (
          await get(
            A.owner,
            `/academy/me/reports/holidays?from=${from}&to=${to}`,
          )
        ).body;

      // Default: the academy does NOT observe government holidays.
      let cal = await calendar();
      let rpt = await report();
      expect(cal.governmentHolidays).toHaveLength(0);
      expect(rpt.governmentCount).toBe(0);
      expect(rpt.academyCount).toBe(cal.academyHolidays.length);
      const summaryOff = (await get(A.owner, '/academy/me/reports/summary'))
        .body;
      const calShort = (
        await get(A.owner, `/academy/me/holidays?from=${d(0)}&to=${d(30)}`)
      ).body;
      expect(summaryOff.upcomingHolidaysCount).toBe(
        calShort.governmentHolidays.length + calShort.academyHolidays.length,
      );

      // Opt in: both now include the same government holidays.
      await h.db
        .updateTable('academies')
        .set({ auto_observe_govt_holidays: true })
        .where('id', '=', A.id)
        .execute();
      cal = await calendar();
      rpt = await report();
      expect(cal.governmentHolidays.length).toBeGreaterThan(0);
      expect(rpt.governmentCount).toBe(cal.governmentHolidays.length);
      expect(rpt.academyCount).toBe(cal.academyHolidays.length);
      const summaryOn = (await get(A.owner, '/academy/me/reports/summary'))
        .body;
      const calShortOn = (
        await get(A.owner, `/academy/me/holidays?from=${d(0)}&to=${d(30)}`)
      ).body;
      expect(summaryOn.upcomingHolidaysCount).toBe(
        calShortOn.governmentHolidays.length +
          calShortOn.academyHolidays.length,
      );
      await h.db
        .updateTable('academies')
        .set({ auto_observe_govt_holidays: false })
        .where('id', '=', A.id)
        .execute();
    });

    it('CONTEXT ISOLATION: no Individual, Academy B or non-member data in any Academy A report; Academy B sees none of A', async () => {
      const sessions = (
        await get(
          A.owner,
          `/academy/me/reports/sessions?from=${d(-30)}&to=${d(0)}`,
        )
      ).body;
      const batches = (await get(A.owner, '/academy/me/reports/batches')).body;
      const students = (await get(A.owner, '/academy/me/reports/students'))
        .body;
      const today = (await get(A.owner, '/academy/me/today')).body;
      const foreign = [I1, I2, B1];
      expect(sessions.rows.some((r: any) => foreign.includes(r.batchId))).toBe(
        false,
      );
      expect(batches.rows.some((r: any) => foreign.includes(r.batchId))).toBe(
        false,
      );
      expect(
        students.rows.some((r: any) =>
          [S.s4.id, S.s5.id].includes(r.studentId),
        ),
      ).toBe(false);
      expect(today.classes.some((c: any) => foreign.includes(c.batchId))).toBe(
        false,
      );

      const bSessions = (
        await get(
          B.owner,
          `/academy/me/reports/sessions?from=${d(-30)}&to=${d(0)}`,
        )
      ).body;
      expect(bSessions.rows.every((r: any) => r.batchId === B1)).toBe(true);
      const bStudents = (await get(B.owner, '/academy/me/reports/students'))
        .body;
      expect(bStudents.rows.map((r: any) => r.studentId)).toEqual([S.s5.id]);
      expect(
        (await get(B.owner, '/academy/me/reports/summary')).body.batchCount,
      ).toBe(1);
    });

    it('a departed teacher’s HISTORICAL classes stay in the Academy’s sessions report, attributed by name', async () => {
      // (verified in section 2 after departure — here just assert the name map covers members)
      const rpt = (
        await get(
          A.owner,
          `/academy/me/reports/sessions?from=${d(-30)}&to=${d(0)}`,
        )
      ).body;
      expect(rpt.byTeacher.length).toBeGreaterThan(0);
      expect(rpt.byTeacher.every((t: any) => t.tutorDisplayName)).toBe(true);
    });
  });

  // ==================================================================
  // 2. TEACHER DEPARTURE
  // ==================================================================
  describe('2: a teacher leaving an Academy', () => {
    let D: Actor; // the departing teacher: Individual + A + B
    let Sub: Actor; // a valid, still-active substitute in A
    let Other: Actor; // another A teacher whose class D is covering
    let dA: string; // D's Academy A batch
    let dB: string; // D's Academy B batch
    let dI: string; // D's Individual batch
    let oA: string; // Other's Academy A batch
    let stA: Actor;
    let stB: Actor;
    let stI: Actor;
    let pA: Actor;
    let pI: Actor;
    const ids: Record<string, string> = {};
    // IST wall-clock, because every session below is created with timezone IST.
    const inHours = (n: number) =>
      DateTime.now().setZone(IST).plus({ hours: n });

    beforeAll(async () => {
      D = await h.makeUser('tutor', 'dep');
      Sub = await h.makeUser('tutor', 'sub');
      Other = await h.makeUser('tutor', 'oth');
      for (const t of [D, Sub, Other]) await h.join(A.id, t.id);
      await h.join(B.id, D.id);
      dA = await h.createBatch(D, { ctx: A.ctx, title: 'D Academy A' });
      dB = await h.createBatch(D, { ctx: B.ctx, title: 'D Academy B' });
      dI = await h.createBatch(D, { title: 'D Individual' });
      oA = await h.createBatch(Other, { ctx: A.ctx, title: 'Other Academy A' });
      stA = await h.makeUser('student', 'dstA');
      stB = await h.makeUser('student', 'dstB');
      stI = await h.makeUser('student', 'dstI');
      pA = await h.makeUser('parent', 'dpA');
      pI = await h.makeUser('parent', 'dpI');
      await h.linkParent(pA.id, stA.id);
      await h.linkParent(pI.id, stI.id);
      await h.enroll(dA, stA.id);
      await h.enroll(oA, stA.id);
      await h.enroll(dB, stB.id);
      await h.enroll(dI, stI.id);

      // Classes (far enough in the future to be outside the reminder window).
      ids.future1 = await mkSession(D, dA, inHours(30), A.ctx);
      ids.future2 = await mkSession(D, dA, inHours(54), A.ctx);
      ids.covered = await mkSession(D, dA, inHours(78), A.ctx); // will have a valid substitute
      ids.coveringOther = await mkSession(Other, oA, inHours(102), A.ctx); // D is the substitute
      ids.bClass = await mkSession(D, dB, inHours(31), B.ctx);
      ids.indClass = await mkSession(D, dI, inHours(32));
      // History: a completed Academy A class.
      ids.past = await mkSession(D, dA, inHours(-5), A.ctx);
      expect((await complete(D, A.ctx, ids.past)).status).toBe(201);
      await mark(D, A.ctx, ids.past, stA, 'present');
      // Coverage arrangements (as the leave-approval flow leaves them).
      await h.db
        .updateTable('class_sessions')
        .set({ substitute_tutor_id: Sub.id })
        .where('id', '=', ids.covered)
        .execute();
      await h.db
        .updateTable('class_sessions')
        .set({ substitute_tutor_id: D.id })
        .where('id', '=', ids.coveringOther)
        .execute();
    });

    const status = async (sid: string) =>
      h.db
        .selectFrom('class_sessions')
        .selectAll()
        .where('id', '=', sid)
        .executeTakeFirstOrThrow();
    const cancelledNotices = async (u: Actor, sid: string) =>
      (await notes(u, 'class_cancelled')).filter(
        (n) =>
          n.payload.sessionId === sid ||
          (n.payload.sessionIds ?? []).includes(sid),
      );

    it('before: everything is scheduled and the student is told nothing yet', async () => {
      for (const k of [
        'future1',
        'future2',
        'covered',
        'coveringOther',
        'bClass',
        'indClass',
      ]) {
        expect((await status(ids[k])).status).toBe('scheduled');
      }
      expect(await cancelledNotices(stA, ids.future1)).toHaveLength(0);
    });

    it('the Academy owner removes the teacher: future Academy classes with no valid teacher are CANCELLED, atomically', async () => {
      const membership = await h.db
        .selectFrom('academy_memberships')
        .select('id')
        .where('academy_id', '=', A.id)
        .where('tutor_id', '=', D.id)
        .executeTakeFirstOrThrow();
      const res = await h.api(
        'DELETE',
        `/academy/me/teachers/${membership.id}`,
        A.owner.token,
      );
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('left'); // the API still returns the membership row

      // Cancelled: D's own future classes and the class D was covering.
      for (const k of ['future1', 'future2', 'coveringOther']) {
        const row = await status(ids[k]);
        expect(row.status).toBe('cancelled');
        expect(row.cancellation_reason).toBe('academy_manual');
      }
      // Kept: covered by a still-active substitute (a valid replacement arrangement).
      expect((await status(ids.covered)).status).toBe('scheduled');
    });

    it('Individual and other-Academy classes are completely untouched', async () => {
      expect((await status(ids.indClass)).status).toBe('scheduled');
      expect((await status(ids.bClass)).status).toBe('scheduled');
      // D is still a member of B and can still work there.
      expect(
        (
          await h.api(
            'GET',
            `/sessions/me?from=${new Date().toISOString()}&to=${new Date(Date.now() + 7 * 864e5).toISOString()}`,
            D.token,
            { ctx: B.ctx },
          )
        ).status,
      ).toBe(200);
      // ...and Individually.
      const mine = await h.api(
        'GET',
        `/sessions/me?from=${new Date().toISOString()}&to=${new Date(Date.now() + 7 * 864e5).toISOString()}`,
        D.token,
      );
      expect(mine.body.map((s: any) => s.id)).toContain(ids.indClass);
    });

    it('history stays: the completed Academy class and its attendance remain, still attributed to the teacher and the Academy', async () => {
      const past = await status(ids.past);
      expect(past.status).toBe('completed');
      expect(past.tutor_id).toBe(D.id);
      const batch = await h.db
        .selectFrom('batches')
        .select('academy_id')
        .where('id', '=', dA)
        .executeTakeFirstOrThrow();
      expect(batch.academy_id).toBe(A.id); // never converted to Individual
      expect(
        await h.db
          .selectFrom('attendance')
          .select('id')
          .where('session_id', '=', ids.past)
          .executeTakeFirst(),
      ).toBeDefined();
      const rpt = (
        await get(
          A.owner,
          `/academy/me/reports/sessions?from=${d(-2)}&to=${d(6)}`,
        )
      ).body;
      const row = rpt.rows.find((r: any) => r.sessionId === ids.past);
      expect(row).toBeDefined();
      expect(row.tutorDisplayName).toContain('dep'); // departed, still attributable by name
      // The Teachers report lists CURRENT members only (intentional) — the departed teacher is not a row.
      const teachers = (await get(A.owner, '/academy/me/reports/teachers'))
        .body;
      expect(teachers.rows.some((r: any) => r.tutorId === D.id)).toBe(false);
    });

    it('students and parents get the existing cancellation notice — once; the Individual family gets nothing', async () => {
      for (const u of [stA, pA]) {
        expect(await cancelledNotices(u, ids.future1)).toHaveLength(1);
        expect(await cancelledNotices(u, ids.future2)).toHaveLength(1);
        expect(await cancelledNotices(u, ids.coveringOther)).toHaveLength(1);
        expect(await cancelledNotices(u, ids.covered)).toHaveLength(0);
      }
      for (const u of [stI, pI, stB]) {
        expect((await notes(u, 'class_cancelled')).length).toBe(0);
      }
      // The departed teacher is NOT sent the "your academy cancelled" teacher notice.
      expect((await notes(D, 'class_cancelled_by_academy')).length).toBe(0);
    });

    it('the student’s and Academy’s views reflect it (calendar/status), with the right reason', async () => {
      const win = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 6 * 864e5).toISOString()}`;
      const student = (await get(stA, `/sessions/upcoming?${win}`)).body;
      const row = student.find((s: any) => s.id === ids.future1);
      expect(row.status).toBe('cancelled');
      expect(row.cancellation_reason).toBe('academy_manual');
      const academy = (await get(A.owner, `/academy/me/sessions?${win}`)).body;
      expect(academy.find((s: any) => s.id === ids.future1).status).toBe(
        'cancelled',
      );
      expect(academy.find((s: any) => s.id === ids.covered).status).toBe(
        'scheduled',
      );
    });

    it('no reminder can fire for the cancelled classes (moved INTO the reminder window), while a real class still reminds', async () => {
      const reminders = h.app.get(RemindersService);
      // H7: the sweep's window is now forward-looking ([now, now+10min], not
      // a ±30s slice around exactly "now+10min") — genuinely inside it, so
      // this still proves cancellation suppresses the reminder despite being
      // "in window", not just that it's outside the window either way.
      const soon = new Date(Date.now() + 9 * 60_000);
      await h.db
        .updateTable('class_sessions')
        .set({ scheduled_start_utc: soon })
        .where('id', '=', ids.future1)
        .execute();
      await reminders.sendUpcomingClassReminders();
      const got = async (u: Actor, type: string, sid: string) =>
        (await notes(u, type)).filter((n) => n.payload.sessionId === sid);
      expect(await got(stA, 'class_reminder', ids.future1)).toHaveLength(0);
      expect(await got(pA, 'class_reminder', ids.future1)).toHaveLength(0);
      // Cancelled-class reminder sweep must not double-announce it either.
      expect(
        await got(stA, 'class_cancelled_reminder', ids.future1),
      ).toHaveLength(0);
      // Control: the still-scheduled Individual class DOES remind.
      await h.db
        .updateTable('class_sessions')
        .set({
          // H7: the sweep's window is now forward-looking ([now, now+10min],
          // not a ±30s slice around exactly "now+10min") — safely inside it,
          // not right at its old edge.
          scheduled_start_utc: new Date(Date.now() + 9 * 60_000),
        })
        .where('id', '=', ids.indClass)
        .execute();
      await reminders.sendUpcomingClassReminders();
      expect(await got(stI, 'class_reminder', ids.indClass)).toHaveLength(1);
      // Put it back so later assertions about it stay valid.
      await h.db
        .updateTable('class_sessions')
        .set({ scheduled_start_utc: new Date(Date.now() + 32 * 3600_000) })
        .where('id', '=', ids.indClass)
        .execute();
    });

    it('the departed teacher has no Academy A access left (context, batch, session, direct IDs)', async () => {
      const win = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 6 * 864e5).toISOString()}`;
      expect(
        (await h.api('GET', `/sessions/me?${win}`, D.token, { ctx: A.ctx }))
          .status,
      ).toBe(403);
      expect(
        (
          await h.api('POST', '/sessions', D.token, {
            ctx: A.ctx,
            body: {
              batchId: dA,
              startLocal: local(inHours(200)),
              durationMin: 30,
              timezone: IST,
            },
          })
        ).status,
      ).toBe(403);
      // Direct ID from the Individual context is "not found", not a leak.
      expect(
        (await h.api('GET', `/batches/${dA}`, D.token)).status,
      ).toBeGreaterThanOrEqual(403);
      // The academy cannot schedule a NEW class for a batch whose teacher has left either.
      const before = await h.db
        .selectFrom('class_sessions')
        .select((eb) => eb.fn.countAll().as('c'))
        .where('batch_id', '=', dA)
        .executeTakeFirstOrThrow();
      const create = await h.api(
        'POST',
        `/academy/me/batches/${dA}/sessions`,
        A.owner.token,
        {
          body: {
            batchId: dA,
            startLocal: local(inHours(220)),
            durationMin: 30,
            timezone: IST,
          },
        },
      );
      expect(create.status).toBeGreaterThanOrEqual(400);
      const after = await h.db
        .selectFrom('class_sessions')
        .select((eb) => eb.fn.countAll().as('c'))
        .where('batch_id', '=', dA)
        .executeTakeFirstOrThrow();
      expect(after.c).toBe(before.c);
    });

    it('Individual profile still works normally for the departed teacher (new class, roster, calendar)', async () => {
      const created = await h.api('POST', '/sessions', D.token, {
        body: {
          batchId: dI,
          startLocal: local(inHours(150)),
          durationMin: 30,
          timezone: IST,
        },
      });
      expect(created.status).toBe(201);
      const row = await status(created.body.id);
      expect(row.status).toBe('scheduled');
      const batch = await h.db
        .selectFrom('batches')
        .select('academy_id')
        .where('id', '=', dI)
        .executeTakeFirstOrThrow();
      expect(batch.academy_id).toBeNull(); // new Individual activity stays Individual
      // ...and never appears in Academy A.
      const rpt = (
        await get(
          A.owner,
          `/academy/me/reports/sessions?from=${d(0)}&to=${d(10)}`,
        )
      ).body;
      expect(rpt.rows.some((r: any) => r.sessionId === created.body.id)).toBe(
        false,
      );
    });

    it('the SELF-SERVE leave path behaves the same, and tells the owner how many classes were cancelled', async () => {
      const L = await h.makeUser('tutor', 'leaver');
      await h.join(A.id, L.id);
      const lb = await h.createBatch(L, { ctx: A.ctx, title: 'Leaver batch' });
      const st = await h.makeUser('student', 'lst');
      await h.enroll(lb, st.id);
      const c1 = await mkSession(L, lb, inHours(60), A.ctx);
      const c2 = await mkSession(L, lb, inHours(84), A.ctx);
      const res = await h.api(
        'POST',
        `/marketplace/academies/${A.slug}/leave`,
        L.token,
      );
      expect(res.status).toBe(201);
      expect((await status(c1)).status).toBe('cancelled');
      expect((await status(c2)).status).toBe('cancelled');
      expect((await notes(st, 'class_cancelled')).length).toBeGreaterThan(0);
      const ownerNote = (await notes(A.owner, 'academy_teacher_left')).find(
        (n) => n.payload.tutorId === L.id,
      );
      expect(ownerNote?.payload.cancelledClassCount).toBe(2);
      expect(ownerNote?.payload.body).toContain(
        '2 upcoming classes were cancelled',
      );
    });

    it('leaving twice / a stale membership id cannot cancel anything again', async () => {
      const membership = await h.db
        .selectFrom('academy_memberships')
        .select('id')
        .where('tutor_id', '=', D.id)
        .where('academy_id', '=', A.id)
        .executeTakeFirstOrThrow();
      const before = (await notes(stA, 'class_cancelled')).length;
      await h.api(
        'DELETE',
        `/academy/me/teachers/${membership.id}`,
        A.owner.token,
      );
      expect((await notes(stA, 'class_cancelled')).length).toBe(before);
      expect((await status(ids.covered)).status).toBe('scheduled');
    });

    it('another academy’s owner cannot remove this academy’s teacher (nothing is cancelled)', async () => {
      const t = await h.makeUser('tutor', 'victim');
      await h.join(A.id, t.id);
      const b = await h.createBatch(t, { ctx: A.ctx, title: 'Victim batch' });
      const sid = await mkSession(t, b, inHours(70), A.ctx);
      const m = await h.db
        .selectFrom('academy_memberships')
        .select('id')
        .where('tutor_id', '=', t.id)
        .executeTakeFirstOrThrow();
      const res = await h.api(
        'DELETE',
        `/academy/me/teachers/${m.id}`,
        B.owner.token,
      );
      expect(res.status).toBe(403);
      expect((await status(sid)).status).toBe('scheduled');
    });
  });

  // ==================================================================
  // 3. MESSAGING CONTEXT
  // ==================================================================
  describe('3: messaging honours the teaching context', () => {
    let M: Actor; // Individual + A (+ never B)
    let M2: Actor; // Academy B teacher
    let st: Actor;
    let stOther: Actor;
    let pm: Actor;
    let pOther: Actor;
    let mInd: string;
    let mA: string;
    let mB: string;
    const thread = (u: Actor, b: string, s: Actor, ctx?: string) =>
      h.api('GET', `/messages/batch/${b}/student/${s.id}`, u.token, { ctx });
    const say = (u: Actor, b: string, s: Actor, ctx?: string, body = 'hello') =>
      h.api('POST', `/messages/batch/${b}/student/${s.id}`, u.token, {
        ctx,
        body: { body },
      });
    const count = async (b: string, s: Actor) =>
      Number(
        (
          await h.db
            .selectFrom('messages')
            .select((eb) => eb.fn.countAll().as('c'))
            .where('batch_id', '=', b)
            .where('student_id', '=', s.id)
            .executeTakeFirstOrThrow()
        ).c,
      );

    beforeAll(async () => {
      M = await h.makeUser('tutor', 'm');
      M2 = await h.makeUser('tutor', 'm2');
      await h.join(A.id, M.id);
      await h.join(B.id, M2.id);
      st = await h.makeUser('student', 'mst');
      stOther = await h.makeUser('student', 'mst2');
      pm = await h.makeUser('parent', 'mp');
      pOther = await h.makeUser('parent', 'mp2');
      await h.linkParent(pm.id, st.id);
      await h.linkParent(pOther.id, stOther.id);
      mInd = await h.createBatch(M, { title: 'M Individual' });
      mA = await h.createBatch(M, { ctx: A.ctx, title: 'M Academy A' });
      mB = await h.createBatch(M2, { ctx: B.ctx, title: 'M2 Academy B' });
      for (const b of [mInd, mA]) await h.enroll(b, st.id);
      await h.enroll(mB, stOther.id);
      await h.enroll(mInd, stOther.id);
    });

    it('INDIVIDUAL context → Individual batch: allowed (read + post)', async () => {
      expect((await thread(M, mInd, st)).status).toBe(200);
      expect(
        (await say(M, mInd, st, undefined, 'individual hello')).status,
      ).toBe(201);
      expect((await say(M, mInd, st, 'individual')).status).toBe(201);
    });

    it('ACADEMY context → the SAME Individual batch by direct ID: rejected, no data, no row (the reported 201 is gone)', async () => {
      const before = await count(mInd, st);
      const read = await thread(M, mInd, st, A.ctx);
      expect(read.status).toBe(403);
      expect(JSON.stringify(read.body)).not.toContain('individual hello');
      const post = await say(M, mInd, st, A.ctx, 'leak?');
      expect(post.status).toBe(403);
      expect(await count(mInd, st)).toBe(before);
    });

    it('ACADEMY context → Academy A batch: allowed', async () => {
      expect((await thread(M, mA, st, A.ctx)).status).toBe(200);
      expect((await say(M, mA, st, A.ctx, 'academy hello')).status).toBe(201);
    });

    it('INDIVIDUAL context → an ACADEMY batch by direct ID: rejected, no row', async () => {
      const before = await count(mA, st);
      expect((await thread(M, mA, st)).status).toBe(403);
      expect((await say(M, mA, st)).status).toBe(403);
      expect(await count(mA, st)).toBe(before);
    });

    it('Academy A → Academy B batch: rejected on read and write (both by context header and by ID)', async () => {
      const before = await count(mB, stOther);
      expect((await thread(M, mB, stOther, A.ctx)).status).toBe(403);
      expect((await say(M, mB, stOther, A.ctx)).status).toBe(403);
      // Claiming Academy B's context without being a member is refused at the guard.
      expect((await thread(M, mB, stOther, B.ctx)).status).toBe(403);
      expect((await say(M, mB, stOther, B.ctx)).status).toBe(403);
      expect(await count(mB, stOther)).toBe(before);
      // Academy B's own teacher works normally.
      expect((await thread(M2, mB, stOther, B.ctx)).status).toBe(200);
      expect((await say(M2, mB, stOther, B.ctx)).status).toBe(201);
    });

    it('a teacher’s message inbox is per context: Individual sees only Individual threads, the Academy only its own', async () => {
      const ind = (await h.api('GET', '/messages/mine', M.token)).body.map(
        (t: any) => t.batch_id,
      );
      const acad = (
        await h.api('GET', '/messages/mine', M.token, { ctx: A.ctx })
      ).body.map((t: any) => t.batch_id);
      expect(ind).toContain(mInd);
      expect(ind).not.toContain(mA);
      expect(acad).toContain(mA);
      expect(acad).not.toContain(mInd);
    });

    it('a DEPARTED teacher: Academy context is refused, the Individual context cannot reach the old Academy thread, history is kept', async () => {
      const gone = await h.makeUser('tutor', 'gone');
      await h.join(A.id, gone.id);
      const gb = await h.createBatch(gone, { ctx: A.ctx, title: 'Gone batch' });
      const gs = await h.makeUser('student', 'gs');
      await h.enroll(gb, gs.id);
      expect((await say(gone, gb, gs, A.ctx, 'while a member')).status).toBe(
        201,
      );
      const m = await h.db
        .selectFrom('academy_memberships')
        .select('id')
        .where('tutor_id', '=', gone.id)
        .executeTakeFirstOrThrow();
      expect(
        (await h.api('DELETE', `/academy/me/teachers/${m.id}`, A.owner.token))
          .status,
      ).toBe(200);
      const before = await count(gb, gs);
      expect((await thread(gone, gb, gs, A.ctx)).status).toBe(403);
      expect((await say(gone, gb, gs, A.ctx)).status).toBe(403);
      expect((await thread(gone, gb, gs)).status).toBe(403); // Individual context ≠ the old Academy batch
      expect((await say(gone, gb, gs)).status).toBe(403);
      expect(await count(gb, gs)).toBe(before); // nothing written, history preserved
      expect(before).toBe(1);
      // The student (still enrolled) keeps their own access to the thread.
      expect((await thread(gs, gb, gs)).status).toBe(200);
    });

    it('STUDENT and PARENT messaging is unchanged: permitted threads work, others are rejected', async () => {
      // student ↔ own threads in both contexts (the student has no teaching context)
      expect((await thread(st, mInd, st)).status).toBe(200);
      expect((await say(st, mInd, st)).status).toBe(201);
      expect((await thread(st, mA, st)).status).toBe(200);
      expect((await say(st, mA, st)).status).toBe(201);
      // parent of st: reads/posts on st's threads
      expect((await thread(pm, mInd, st)).status).toBe(200);
      expect((await say(pm, mInd, st)).status).toBe(201);
      // wrong student → another student's thread
      expect((await thread(st, mInd, stOther)).status).toBe(403);
      expect((await say(st, mInd, stOther)).status).toBe(403);
      // wrong parent → another child's thread
      expect((await thread(pOther, mInd, st)).status).toBe(403);
      expect((await say(pOther, mInd, st)).status).toBe(403);
      expect((await thread(pm, mInd, stOther)).status).toBe(403);
      // a student of Academy B cannot read Academy A's thread
      expect((await thread(stOther, mA, st)).status).toBe(403);
    });

    it('the ACADEMY OWNER has no messaging access to teacher threads (unchanged)', async () => {
      expect((await thread(A.owner, mA, st)).status).toBeGreaterThanOrEqual(
        403,
      );
      expect((await say(A.owner, mA, st)).status).toBeGreaterThanOrEqual(403);
    });

    it('direct-ID probing with random ids reveals nothing', async () => {
      const ghost = newId();
      expect((await thread(M, ghost, st, A.ctx)).status).toBe(403);
      expect(
        (await say(M, mInd, { id: newId(), token: '', label: 'x' }, undefined))
          .status,
      ).toBe(403);
    });
  });
});
