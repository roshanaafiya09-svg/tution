/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Kysely } from 'kysely';
import { AppModule } from '../src/app.module';
import { KYSELY_CONNECTION } from '../src/database/database.module';
import type { DB, UserRole } from '../src/database/types';
import { newId } from '../src/database/id';
import { TokensService } from '../src/modules/identity/auth/tokens.service';

/**
 * C4 — attendance correctness, proven over real HTTP against the real
 * database (guards, services, repositories, and the `unique(session_id,
 * student_id)` DB constraint all together).
 *
 * Core claim under test: the attendance roster for a session is built from
 * the batch's EXPECTED (actively enrolled) students, left-joined to
 * whatever attendance row exists for that session — never from "students
 * who happen to already have a row". A student who never taps Join (or an
 * entirely offline class where nobody taps anything) must still appear,
 * as Unmarked, and remain markable.
 */

const MARKER = `att${Date.now().toString(36)}`;
jest.setTimeout(180_000);

type Res = { status: number; body: any };

describe('Attendance roster correctness (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  let subjectId: string;
  let gradeLevelId: string;

  const cleanup = { users: [] as string[], academies: [] as string[] };
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST',
    url: string,
    token: string,
    opts: { body?: unknown; ctx?: string } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    if (opts.ctx) headers['x-teaching-context'] = opts.ctx;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.inject({
      method,
      url,
      headers,
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: any = null;
    try {
      body = res.body ? JSON.parse(res.body) : null;
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body };
  }

  async function makeUser(role: UserRole, label: string) {
    const id = newId();
    phoneSeq += 1;
    await db
      .insertInto('users')
      .values({
        id,
        phone_e164: `+91${MARKER}${String(phoneSeq).padStart(3, '0')}`.slice(
          0,
          20,
        ),
        email: `${MARKER}-${label}@example.test`,
      })
      .execute();
    await db.insertInto('user_roles').values({ user_id: id, role }).execute();
    if (role === 'tutor') {
      await db
        .insertInto('profiles_tutor')
        .values({
          user_id: id,
          display_name: `Tutor ${label} ${MARKER}`,
          slug: `${MARKER}-${label}`,
        })
        .execute();
    }
    if (role === 'student') {
      await db
        .insertInto('profiles_student')
        .values({ user_id: id, display_name: `Student ${label} ${MARKER}` })
        .execute();
    }
    cleanup.users.push(id);
    return { id, token: tokens.signAccessToken(id, [role]), label };
  }

  async function makeAcademy(label: string) {
    const owner = await makeUser('academy', `owner-${label}`);
    const id = newId();
    await db
      .insertInto('academies')
      .values({
        id,
        name: `Academy ${label} ${MARKER}`,
        slug: `${MARKER}-academy-${label}`.toLowerCase(),
        owner_user_id: owner.id,
      })
      .execute();
    cleanup.academies.push(id);
    return { id, owner };
  }

  async function join(academyId: string, tutorId: string) {
    await db
      .insertInto('academy_memberships')
      .values({ id: newId(), academy_id: academyId, tutor_id: tutorId })
      .execute();
  }

  async function enroll(batchId: string, studentId: string) {
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
      .execute();
  }

  async function leaveEnrollment(batchId: string, studentId: string) {
    await db
      .updateTable('enrollments')
      .set({ status: 'left', left_at: new Date() })
      .where('batch_id', '=', batchId)
      .where('student_id', '=', studentId)
      .execute();
  }

  async function teacherCreatesBatch(
    tutor: { token: string },
    title: string,
    ctx?: string,
  ) {
    const res = await api('POST', '/batches', tutor.token, {
      ctx,
      body: { title, subjectId, gradeLevelId, capacity: 30, feeMinor: 100000 },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function teacherSchedules(
    tutor: { token: string },
    batchId: string,
    startLocal: string,
    ctx?: string,
  ) {
    const res = await api('POST', '/sessions', tutor.token, {
      ctx,
      body: { batchId, startLocal, durationMin: 60 },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const isoDay = (offsetDays: number) => {
    const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  };
  const D = isoDay(50);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Kysely<DB>>(KYSELY_CONNECTION);
    tokens = app.get(TokensService);

    subjectId = (
      await db.selectFrom('subjects').select('id').executeTakeFirstOrThrow()
    ).id;
    gradeLevelId = (
      await db.selectFrom('grade_levels').select('id').executeTakeFirstOrThrow()
    ).id;
  });

  afterAll(async () => {
    try {
      if (db) {
        if (cleanup.users.length) {
          // attendance.marked_by -> users(id) has no ON DELETE action (only
          // session_id/student_id cascade), so a manually-marked row must be
          // cleared before its marking teacher can be deleted.
          await db
            .deleteFrom('attendance')
            .where('marked_by', 'in', cleanup.users)
            .execute();
          await db
            .deleteFrom('users')
            .where('id', 'in', cleanup.users)
            .execute();
        }
        if (cleanup.academies.length) {
          await db
            .deleteFrom('academies')
            .where('id', 'in', cleanup.academies)
            .execute();
        }
      }
    } finally {
      await app?.close();
    }
  });

  // ==========================================================================
  // TEST 1, 2, 5, 9 — the core roster bug: 10 enrolled, only 7 "join".
  // ==========================================================================
  it('TEST 1/2/5/9 — GET returns ALL 10 expected students even though only 7 joined, unmarked ones are null (not absent)', async () => {
    const T = await makeUser('tutor', 'roster1');
    const batchId = await teacherCreatesBatch(T, `ROSTER-${MARKER}-1`);
    const students = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser('student', `r1-${i}`)),
    );
    for (const s of students) await enroll(batchId, s.id);
    const sessionId = await teacherSchedules(T, batchId, `${D}T10:00`);

    // Only 7 of the 10 tap Join.
    const joiners = students.slice(0, 7);
    const nonJoiners = students.slice(7);
    for (const s of joiners) {
      const res = await api(
        'POST',
        `/attendance/session/${sessionId}/join`,
        s.token,
      );
      expect(res.status).toBe(201);
    }

    const list = await api(
      'GET',
      `/attendance/session/${sessionId}`,
      T.token,
    );
    expect(list.status).toBe(200);
    const rows = list.body as Array<{
      student_id: string;
      status: string | null;
      method: string | null;
    }>;

    // ALL 10 expected students appear — none disappeared.
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.student_id).sort()).toEqual(
      students.map((s) => s.id).sort(),
    );

    // Joiners were pre-filled present via join_tap.
    for (const s of joiners) {
      const row = rows.find((r) => r.student_id === s.id);
      expect(row?.status).toBe('present');
      expect(row?.method).toBe('join_tap');
    }

    // Non-joiners are still shown, but as Unmarked — NOT auto-absent.
    for (const s of nonJoiners) {
      const row = rows.find((r) => r.student_id === s.id);
      expect(row).toBeDefined();
      expect(row?.status).toBeNull();
      expect(row?.method).toBeNull();
    }
  });

  // ==========================================================================
  // TEST 3 — a non-joiner can still be marked absent; TEST 6/7/8 — status
  // is returned correctly and can be changed both ways; TEST 15 — history
  // persists after reload.
  // ==========================================================================
  it('TEST 3/6/7/8/15 — a non-joiner can be marked Absent, and status changes persist across reloads', async () => {
    const T = await makeUser('tutor', 'roster2');
    const batchId = await teacherCreatesBatch(T, `ROSTER-${MARKER}-2`);
    const [joined, neverJoined] = await Promise.all([
      makeUser('student', 'r2-joined'),
      makeUser('student', 'r2-never'),
    ]);
    await enroll(batchId, joined.id);
    await enroll(batchId, neverJoined.id);
    const sessionId = await teacherSchedules(T, batchId, `${D}T11:00`);
    await api('POST', `/attendance/session/${sessionId}/join`, joined.token);

    // The student who never joined can be marked Absent.
    const markAbsent = await api(
      'POST',
      `/attendance/session/${sessionId}/mark`,
      T.token,
      { body: { studentId: neverJoined.id, status: 'absent' } },
    );
    expect(markAbsent.status).toBe(201);

    let rows = (
      await api('GET', `/attendance/session/${sessionId}`, T.token)
    ).body as Array<{ student_id: string; status: string | null }>;
    expect(rows.find((r) => r.student_id === neverJoined.id)?.status).toBe(
      'absent',
    );

    // Present -> Absent
    await api('POST', `/attendance/session/${sessionId}/mark`, T.token, {
      body: { studentId: joined.id, status: 'absent' },
    });
    rows = (await api('GET', `/attendance/session/${sessionId}`, T.token))
      .body as Array<{ student_id: string; status: string | null }>;
    expect(rows.find((r) => r.student_id === joined.id)?.status).toBe(
      'absent',
    );

    // Absent -> Present
    await api('POST', `/attendance/session/${sessionId}/mark`, T.token, {
      body: { studentId: joined.id, status: 'present' },
    });
    rows = (await api('GET', `/attendance/session/${sessionId}`, T.token))
      .body as Array<{ student_id: string; status: string | null }>;
    expect(rows.find((r) => r.student_id === joined.id)?.status).toBe(
      'present',
    );

    // Reload once more — the absent mark on the non-joiner is durable, not
    // reverted by anything re-deriving from join activity.
    rows = (await api('GET', `/attendance/session/${sessionId}`, T.token))
      .body as Array<{ student_id: string; status: string | null }>;
    expect(rows.find((r) => r.student_id === neverJoined.id)?.status).toBe(
      'absent',
    );
  });

  // ==========================================================================
  // TEST 4 — an OFFLINE-style session (zero join events at all) still
  // returns every expected student.
  // ==========================================================================
  it('TEST 4 — a session with zero join events (offline class) still returns every expected student as Unmarked', async () => {
    const T = await makeUser('tutor', 'roster3');
    const batchId = await teacherCreatesBatch(T, `ROSTER-${MARKER}-3`);
    const students = await Promise.all(
      Array.from({ length: 5 }, (_, i) => makeUser('student', `r3-${i}`)),
    );
    for (const s of students) await enroll(batchId, s.id);
    const sessionId = await teacherSchedules(T, batchId, `${D}T12:00`);

    const rows = (
      await api('GET', `/attendance/session/${sessionId}`, T.token)
    ).body as Array<{ student_id: string; status: string | null }>;
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.status === null)).toBe(true);

    // Teacher marks the whole offline class by hand.
    for (const [i, s] of students.entries()) {
      const status = i % 2 === 0 ? 'present' : 'absent';
      const res = await api(
        'POST',
        `/attendance/session/${sessionId}/mark`,
        T.token,
        { body: { studentId: s.id, status } },
      );
      expect(res.status).toBe(201);
    }
    const after = (
      await api('GET', `/attendance/session/${sessionId}`, T.token)
    ).body as Array<{ student_id: string; status: string | null }>;
    for (const [i, s] of students.entries()) {
      const expected = i % 2 === 0 ? 'present' : 'absent';
      expect(after.find((r) => r.student_id === s.id)?.status).toBe(expected);
    }
  });

  // ==========================================================================
  // TEST 10 — attendance cannot be created for a student not expected for
  // the session (not enrolled, or enrolled elsewhere).
  // ==========================================================================
  it('TEST 10 — cannot mark attendance for a student not enrolled in this session\'s batch', async () => {
    const T = await makeUser('tutor', 'roster4');
    const batchId = await teacherCreatesBatch(T, `ROSTER-${MARKER}-4`);
    const enrolled = await makeUser('student', 'r4-enrolled');
    const stranger = await makeUser('student', 'r4-stranger');
    await enroll(batchId, enrolled.id);
    const sessionId = await teacherSchedules(T, batchId, `${D}T13:00`);

    const res = await api(
      'POST',
      `/attendance/session/${sessionId}/mark`,
      T.token,
      { body: { studentId: stranger.id, status: 'present' } },
    );
    expect(res.status).toBe(400);

    // A student who left the batch no longer counts as expected either.
    await enroll(batchId, stranger.id);
    await leaveEnrollment(batchId, stranger.id);
    const res2 = await api(
      'POST',
      `/attendance/session/${sessionId}/mark`,
      T.token,
      { body: { studentId: stranger.id, status: 'present' } },
    );
    expect(res2.status).toBe(400);

    // ...and doesn't appear in the roster either.
    const rows = (
      await api('GET', `/attendance/session/${sessionId}`, T.token)
    ).body as Array<{ student_id: string }>;
    expect(rows.map((r) => r.student_id)).toEqual([enrolled.id]);
  });

  // ==========================================================================
  // TEST 11 — duplicate/conflicting attendance for the same session/student
  // is prevented: repeated marks update the one row, never create a second.
  // ==========================================================================
  it('TEST 11 — repeated marks for the same session/student never create duplicate rows', async () => {
    const T = await makeUser('tutor', 'roster5');
    const batchId = await teacherCreatesBatch(T, `ROSTER-${MARKER}-5`);
    const s = await makeUser('student', 'r5');
    await enroll(batchId, s.id);
    const sessionId = await teacherSchedules(T, batchId, `${D}T14:00`);

    await api('POST', `/attendance/session/${sessionId}/join`, s.token);
    for (const status of ['present', 'absent', 'late', 'present']) {
      await api('POST', `/attendance/session/${sessionId}/mark`, T.token, {
        body: { studentId: s.id, status },
      });
    }

    const dbRows = await db
      .selectFrom('attendance')
      .selectAll()
      .where('session_id', '=', sessionId)
      .where('student_id', '=', s.id)
      .execute();
    expect(dbRows).toHaveLength(1);
    expect(dbRows[0].status).toBe('present');
  });

  // ==========================================================================
  // TEST 12/13/14/16 — Academy isolation for attendance, using the real
  // Academy-facing endpoints (per-session marking is teacher-only by
  // design; the academy's own attendance views must still be scoped).
  // ==========================================================================
  it('TEST 12/13/14/16 — Academy A cannot reach Individual, Academy B, or a non-member teacher\'s attendance; its own stays visible', async () => {
    const A = await makeAcademy('attA');
    const B = await makeAcademy('attB');
    const memberOfA = await makeUser('tutor', 'memberA');
    const memberOfB = await makeUser('tutor', 'memberB');
    const nonMember = await makeUser('tutor', 'nonmember');
    await join(A.id, memberOfA.id);
    await join(B.id, memberOfB.id);

    const ctxA = `academy:${A.id}`;
    const ctxB = `academy:${B.id}`;

    // Academy A's own batch/session/attendance.
    const aBatch = await teacherCreatesBatch(memberOfA, `ACAD-A-${MARKER}`, ctxA);
    const aStudent = await makeUser('student', 'acadA-student');
    await enroll(aBatch, aStudent.id);
    const aSession = await teacherSchedules(memberOfA, aBatch, `${D}T15:00`, ctxA);
    await api('POST', `/attendance/session/${aSession}/mark`, memberOfA.token, {
      body: { studentId: aStudent.id, status: 'present' },
    });

    // The SAME teacher's private Individual batch/session/attendance.
    const iBatch = await teacherCreatesBatch(memberOfA, `PRIVATE-${MARKER}`);
    const iStudent = await makeUser('student', 'indiv-student');
    await enroll(iBatch, iStudent.id);
    const iSession = await teacherSchedules(memberOfA, iBatch, `${D}T16:00`);
    await api('POST', `/attendance/session/${iSession}/mark`, memberOfA.token, {
      body: { studentId: iStudent.id, status: 'present' },
    });

    // Academy B's own batch/session/attendance.
    const bBatch = await teacherCreatesBatch(memberOfB, `ACAD-B-${MARKER}`, ctxB);
    const bStudent = await makeUser('student', 'acadB-student');
    await enroll(bBatch, bStudent.id);
    const bSession = await teacherSchedules(memberOfB, bBatch, `${D}T17:00`, ctxB);
    await api('POST', `/attendance/session/${bSession}/mark`, memberOfB.token, {
      body: { studentId: bStudent.id, status: 'present' },
    });

    // A non-member teacher's private attendance.
    const nBatch = await teacherCreatesBatch(nonMember, `NONMEMBER-${MARKER}`);
    const nStudent = await makeUser('student', 'nonmember-student');
    await enroll(nBatch, nStudent.id);
    const nSession = await teacherSchedules(nonMember, nBatch, `${D}T18:00`);
    await api('POST', `/attendance/session/${nSession}/mark`, nonMember.token, {
      body: { studentId: nStudent.id, status: 'present' },
    });

    // Academy A's own attendance is visible via its own API.
    const aBatchView = await api(
      'GET',
      `/academy/me/attendance/batch/${aBatch}`,
      A.owner.token,
    );
    expect(aBatchView.status).toBe(200);
    expect(JSON.stringify(aBatchView.body)).toContain(aStudent.id);

    // TEST 12 — Academy A cannot see the same teacher's Individual attendance.
    for (const url of [
      `/academy/me/attendance/batch/${iBatch}`,
      `/academy/me/attendance/student/${iStudent.id}`,
    ]) {
      expect((await api('GET', url, A.owner.token)).status).toBe(404);
    }

    // TEST 13 — Academy A cannot see Academy B's attendance.
    for (const url of [
      `/academy/me/attendance/batch/${bBatch}`,
      `/academy/me/attendance/student/${bStudent.id}`,
    ]) {
      expect((await api('GET', url, A.owner.token)).status).toBe(404);
    }

    // TEST 14 — Academy A cannot see a non-member teacher's attendance.
    for (const url of [
      `/academy/me/attendance/batch/${nBatch}`,
      `/academy/me/attendance/student/${nStudent.id}`,
    ]) {
      expect((await api('GET', url, A.owner.token)).status).toBe(404);
    }

    // Cross-check: none of it leaks into Academy A's table/summary either.
    const table = await api(
      'GET',
      `/academy/me/attendance?from=${isoDay(-1)}T00:00:00Z&to=${isoDay(90)}T00:00:00Z`,
      A.owner.token,
    );
    const text = JSON.stringify(table.body);
    expect(text).not.toContain(iBatch);
    expect(text).not.toContain(bBatch);
    expect(text).not.toContain(nBatch);

    // TEST 16 — Academy B still sees its own attendance normally.
    const bBatchView = await api(
      'GET',
      `/academy/me/attendance/batch/${bBatch}`,
      B.owner.token,
    );
    expect(bBatchView.status).toBe(200);
    expect(JSON.stringify(bBatchView.body)).toContain(bStudent.id);

    // TEST 15 — the teacher still sees Individual attendance in their own
    // Individual profile (no context header == Individual).
    const teacherIndividualView = await api(
      'GET',
      `/attendance/session/${iSession}`,
      memberOfA.token,
    );
    expect(teacherIndividualView.status).toBe(200);
    expect(
      (teacherIndividualView.body as Array<{ student_id: string }>).map(
        (r) => r.student_id,
      ),
    ).toEqual([iStudent.id]);

    // ...and reading the Academy session from the Individual profile (no
    // ctx header) is refused — same context-mismatch rule as every other
    // batch-owned resource (getOwnedBatch), never a "tutor_id IN(...)"
    // shortcut that would blur Individual and Academy together.
    const wrongProfile = await api(
      'GET',
      `/attendance/session/${aSession}`,
      memberOfA.token,
    );
    expect(wrongProfile.status).toBe(403);
  });
});
