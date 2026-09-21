/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import { sql, type Kysely } from 'kysely';
import { AppModule } from '../src/app.module';
import { KYSELY_CONNECTION } from '../src/database/database.module';
import type { DB, UserRole } from '../src/database/types';
import { newId } from '../src/database/id';
import { TokensService } from '../src/modules/identity/auth/tokens.service';

/**
 * Individual vs Academy teaching contexts — end-to-end isolation proof.
 *
 * Boots the real application against the local dev database and drives it
 * over HTTP with real JWTs, so what is proven is what a browser would
 * actually get: guards, services, repositories and DB triggers together.
 * Every academy is exercised through its OWN Academy API (never a
 * teacher's), and forbidden data is detected by scanning the serialized
 * responses for the ids / titles / names of records that must never appear.
 *
 * All rows created here are tagged with a per-run marker and removed in
 * afterAll (users cascade to their batches/sessions/enrollments; academies
 * are removed once nothing references them).
 */

const MARKER = `ctx${Date.now().toString(36)}`;
jest.setTimeout(180_000);

type Res = { status: number; body: any };

describe('Teaching contexts — Individual vs Academy isolation (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  let subjectId: string;
  let gradeLevelId: string;

  const cleanup = { users: [] as string[], academies: [] as string[] };
  let phoneSeq = 0;

  // --- tiny HTTP helper --------------------------------------------------
  async function api(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  // --- fixtures ------------------------------------------------------------
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

  async function leave(academyId: string, tutorId: string) {
    await db
      .updateTable('academy_memberships')
      .set({ status: 'left', left_at: new Date() })
      .where('academy_id', '=', academyId)
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'active')
      .execute();
  }

  async function enroll(batchId: string, studentId: string) {
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
      .execute();
  }

  /** Creates a batch AS THE TEACHER, in the given profile (header), and
   *  returns its id — exactly how the teacher dashboard does it. */
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
  const D_HOLIDAY = isoDay(40);
  const D_LEAVE = isoDay(41);
  const D_OTHER = isoDay(42);
  const WINDOW = `from=${isoDay(-1)}T00:00:00Z&to=${isoDay(120)}T00:00:00Z`;

  // --- the actors -----------------------------------------------------------
  let A: Awaited<ReturnType<typeof makeAcademy>>;
  let B: Awaited<ReturnType<typeof makeAcademy>>;
  let T1: Awaited<ReturnType<typeof makeUser>>; // member of A, teaches in BOTH contexts
  let T2: Awaited<ReturnType<typeof makeUser>>; // member of nobody
  let T3: Awaited<ReturnType<typeof makeUser>>; // member of B
  let T4: Awaited<ReturnType<typeof makeUser>>; // member of A, later leaves, later rejoins
  const S: Record<string, Awaited<ReturnType<typeof makeUser>>> = {};

  // records, by owner
  const id = {
    aBatchT1: '',
    iBatchT1: '',
    iBatchT2: '',
    bBatchT3: '',
    aBatchT4: '',
    iBatchT4: '',
    iBatchT4After: '',
    aSessT1Holiday: '',
    iSessT1Holiday: '',
    aSessT1Leave: '',
    iSessT1Leave: '',
    aSessT1Other: '',
    iSessT1Other: '',
    iSessT2: '',
    bSessT3: '',
    aSessT4: '',
    iSessT4: '',
  };
  const titles = {
    aT1: `ACADEMY-A-T1-${MARKER}`,
    iT1: `PRIVATE-INDIVIDUAL-T1-${MARKER}`,
    iT2: `PRIVATE-T2-${MARKER}`,
    bT3: `ACADEMY-B-T3-${MARKER}`,
    aT4: `ACADEMY-A-T4-${MARKER}`,
    iT4: `PRIVATE-INDIVIDUAL-T4-${MARKER}`,
    iT4After: `PRIVATE-T4-AFTER-LEAVING-${MARKER}`,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // 300 req/min global throttle would trip on a suite this chatty.
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

    A = await makeAcademy('A');
    B = await makeAcademy('B');
    T1 = await makeUser('tutor', 't1');
    T2 = await makeUser('tutor', 't2');
    T3 = await makeUser('tutor', 't3');
    T4 = await makeUser('tutor', 't4');
    for (const k of ['a1', 'i1', 'i2', 'b3', 'a4', 'i4', 'i4b', 'x'])
      S[k] = await makeUser('student', k);
    await join(A.id, T1.id);
    await join(B.id, T3.id);
    await join(A.id, T4.id);

    const ctxA = `academy:${A.id}`;
    const ctxB = `academy:${B.id}`;

    // T1: an Academy A batch (in the Academy A profile) and a private one.
    id.aBatchT1 = await teacherCreatesBatch(T1, titles.aT1, ctxA);
    id.iBatchT1 = await teacherCreatesBatch(T1, titles.iT1);
    await enroll(id.aBatchT1, S.a1.id);
    await enroll(id.iBatchT1, S.i1.id);
    // Same day, two hours apart, in two different contexts (holiday / leave / control days).
    id.aSessT1Holiday = await teacherSchedules(
      T1,
      id.aBatchT1,
      `${D_HOLIDAY}T17:00`,
      ctxA,
    );
    id.iSessT1Holiday = await teacherSchedules(
      T1,
      id.iBatchT1,
      `${D_HOLIDAY}T19:00`,
    );
    id.aSessT1Leave = await teacherSchedules(
      T1,
      id.aBatchT1,
      `${D_LEAVE}T17:00`,
      ctxA,
    );
    id.iSessT1Leave = await teacherSchedules(
      T1,
      id.iBatchT1,
      `${D_LEAVE}T19:00`,
    );
    id.aSessT1Other = await teacherSchedules(
      T1,
      id.aBatchT1,
      `${D_OTHER}T17:00`,
      ctxA,
    );
    id.iSessT1Other = await teacherSchedules(
      T1,
      id.iBatchT1,
      `${D_OTHER}T19:00`,
    );

    // T2: a teacher who is not a member of any academy.
    id.iBatchT2 = await teacherCreatesBatch(T2, titles.iT2);
    await enroll(id.iBatchT2, S.i2.id);
    id.iSessT2 = await teacherSchedules(T2, id.iBatchT2, `${D_OTHER}T17:00`);

    // T3: Academy B's teacher.
    id.bBatchT3 = await teacherCreatesBatch(T3, titles.bT3, ctxB);
    await enroll(id.bBatchT3, S.b3.id);
    id.bSessT3 = await teacherSchedules(
      T3,
      id.bBatchT3,
      `${D_OTHER}T17:00`,
      ctxB,
    );

    // T4: Academy A batch + a private batch, both before leaving.
    id.aBatchT4 = await teacherCreatesBatch(T4, titles.aT4, ctxA);
    id.iBatchT4 = await teacherCreatesBatch(T4, titles.iT4);
    await enroll(id.aBatchT4, S.a4.id);
    await enroll(id.iBatchT4, S.i4.id);
    id.aSessT4 = await teacherSchedules(
      T4,
      id.aBatchT4,
      `${D_OTHER}T10:00`,
      ctxA,
    );
    id.iSessT4 = await teacherSchedules(T4, id.iBatchT4, `${D_OTHER}T12:00`);
  });

  afterAll(async () => {
    try {
      if (db) {
        // Tutors/students/owners first: users cascade to their batches,
        // sessions, enrollments and attendance, which frees the academies
        // (batches.academy_id is ON DELETE RESTRICT by design).
        if (cleanup.users.length) {
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

  // --- leak scanning -------------------------------------------------------
  /** Every Academy-facing read an academy admin can make. */
  async function scanAcademy(
    owner: { token: string },
    extraStudentIds: string[] = [],
  ) {
    const urls = [
      '/academy/me/batches',
      '/academy/me/students?status=all',
      `/academy/me/sessions?${WINDOW}`,
      `/academy/me/attendance?${WINDOW}`,
      '/academy/me/attendance/today',
      `/academy/me/attendance/teachers?${WINDOW}`,
      '/academy/me/attendance/teachers/today',
      '/academy/me/today',
      '/academy/me/stats',
      '/academy/me/academic-info',
      '/academy/me/parents',
      '/academy/me/teachers/active',
      '/academy/me/assessments/weekly-compliance',
      '/academy/me/reports/summary',
      `/academy/me/reports/students?${WINDOW}`,
      `/academy/me/reports/teachers?${WINDOW}`,
      '/academy/me/reports/batches',
      `/reports-placeholder`,
      `/academy/me/reports/attendance?${WINDOW}`,
      `/academy/me/reports/sessions?${WINDOW}`,
      '/academy/me/reports/leave',
      '/academy/me/reports/holidays',
      `/academy/me/holidays?from=${isoDay(-5)}&to=${isoDay(200)}`,
    ].filter((u) => u !== '/reports-placeholder');
    const out: Record<string, Res> = {};
    for (const url of urls) out[url] = await api('GET', url, owner.token);
    for (const sid of extraStudentIds) {
      out[`/academy/me/students/${sid}`] = await api(
        'GET',
        `/academy/me/students/${sid}`,
        owner.token,
      );
      out[`/academy/me/attendance/student/${sid}`] = await api(
        'GET',
        `/academy/me/attendance/student/${sid}`,
        owner.token,
      );
    }
    return out;
  }

  const serialized = (scan: Record<string, Res>) =>
    Object.entries(scan)
      .filter(([, r]) => r.status < 400)
      .map(([, r]) => JSON.stringify(r.body))
      .join('\n');

  function expectNoneOf(haystack: string, needles: string[]) {
    for (const needle of needles) {
      expect({ needle, leaked: haystack.includes(needle) }).toEqual({
        needle,
        leaked: false,
      });
    }
  }

  /** Everything that belongs to a teacher's private Individual business. */
  const individualT1 = () => [
    id.iBatchT1,
    id.iSessT1Holiday,
    id.iSessT1Leave,
    id.iSessT1Other,
    titles.iT1,
    S.i1.id,
    S.i1.label && `Student i1 ${MARKER}`,
  ];

  // ==========================================================================
  it("TEST 1 — an active member's ACADEMY activity is visible to that academy", async () => {
    const scan = await scanAcademy(A.owner, [S.a1.id]);
    for (const [url, r] of Object.entries(scan))
      expect({ url, ok: r.status < 400 }).toEqual({ url, ok: true });

    const batches = scan['/academy/me/batches'].body as Array<{
      id: string;
      title: string;
      tutorId: string;
    }>;
    expect(batches.map((b) => b.id)).toEqual(
      expect.arrayContaining([id.aBatchT1, id.aBatchT4]),
    );
    expect(batches.find((b) => b.id === id.aBatchT1)?.tutorId).toBe(T1.id);

    const students = scan['/academy/me/students?status=all'].body as Array<{
      studentId: string;
    }>;
    expect(students.map((s) => s.studentId)).toEqual(
      expect.arrayContaining([S.a1.id, S.a4.id]),
    );

    const sessions = scan[`/academy/me/sessions?${WINDOW}`].body as Array<{
      id: string;
    }>;
    expect(sessions.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        id.aSessT1Holiday,
        id.aSessT1Leave,
        id.aSessT1Other,
        id.aSessT4,
      ]),
    );

    // the batch was really stored as the academy's, taught by T1
    const row = await db
      .selectFrom('batches')
      .select(['academy_id', 'tutor_id'])
      .where('id', '=', id.aBatchT1)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ academy_id: A.id, tutor_id: T1.id });
  });

  it("TEST 2 — the SAME teacher's Individual activity is invisible to the academy (every Academy endpoint, plus direct ids)", async () => {
    const scan = await scanAcademy(A.owner, [S.i1.id]);
    expectNoneOf(serialized(scan), individualT1());

    // Direct-id probes of the private records through the Academy API.
    const probes = await Promise.all([
      api('GET', `/academy/me/batches/${id.iBatchT1}`, A.owner.token),
      api('GET', `/academy/me/batches/${id.iBatchT1}/students`, A.owner.token),
      api('GET', `/academy/me/batches/${id.iBatchT1}/sessions`, A.owner.token),
      api('GET', `/academy/me/batches/${id.iBatchT1}/invites`, A.owner.token),
      api('GET', `/academy/me/attendance/batch/${id.iBatchT1}`, A.owner.token),
      api('GET', `/academy/me/students/${S.i1.id}`, A.owner.token),
    ]);
    for (const r of probes) expect(r.status).toBe(404);

    // The teacher's detail page shows only academy batches, never private ones.
    const detail = await api(
      'GET',
      `/academy/me/teachers/${T1.id}`,
      A.owner.token,
    );
    expect(detail.status).toBe(200);
    expect(
      (detail.body.batches as Array<{ id: string }>).map((b) => b.id),
    ).toEqual([id.aBatchT1]);
    expectNoneOf(JSON.stringify(detail.body), individualT1());
  });

  it('TEST 3 — a teacher who is NOT a member: the academy sees nothing of theirs', async () => {
    const everything = [id.iBatchT2, id.iSessT2, titles.iT2, S.i2.id, T2.id];
    const scan = await scanAcademy(A.owner, [S.i2.id]);
    expectNoneOf(serialized(scan), everything);
    for (const path of [
      `/academy/me/batches/${id.iBatchT2}`,
      `/academy/me/students/${S.i2.id}`,
      `/academy/me/teachers/${T2.id}`,
    ]) {
      expect((await api('GET', path, A.owner.token)).status).toBe(404);
    }
  });

  it('TEST 4 — a teacher in ANOTHER academy: Academy A sees nothing of Academy B', async () => {
    const everything = [id.bBatchT3, id.bSessT3, titles.bT3, S.b3.id, T3.id];
    const scan = await scanAcademy(A.owner, [S.b3.id]);
    expectNoneOf(serialized(scan), everything);
    // ...while Academy B itself does see it (the boundary isn't just "nobody sees anything").
    const bBatches = (await api('GET', '/academy/me/batches', B.owner.token))
      .body as Array<{ id: string }>;
    expect(bBatches.map((b) => b.id)).toEqual([id.bBatchT3]);
  });

  it('TEST 7 + 8 — direct ids are rejected: Individual and other-academy records, read AND write', async () => {
    const foreignBatches = [id.iBatchT1, id.iBatchT2, id.bBatchT3];
    const foreignSessions = [id.iSessT1Other, id.bSessT3];
    for (const batchId of foreignBatches) {
      expect(
        (await api('GET', `/academy/me/batches/${batchId}`, A.owner.token))
          .status,
      ).toBe(404);
      expect(
        (
          await api(
            'GET',
            `/academy/me/batches/${batchId}/students`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'GET',
            `/academy/me/batches/${batchId}/sessions`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'GET',
            `/academy/me/attendance/batch/${batchId}`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
    }
    // Academy B cannot reach Academy A's records either.
    expect(
      (await api('GET', `/academy/me/batches/${id.aBatchT1}`, B.owner.token))
        .status,
    ).toBe(404);
    expect(
      (
        await api(
          'GET',
          `/academy/me/batches/${id.aBatchT1}/sessions`,
          B.owner.token,
        )
      ).status,
    ).toBe(404);

    // TEST 9 — writes against records the academy doesn't own.
    for (const batchId of foreignBatches) {
      expect(
        (
          await api('PATCH', `/academy/me/batches/${batchId}`, A.owner.token, {
            body: { title: 'HIJACKED' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'POST',
            `/academy/me/batches/${batchId}/archive`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'POST',
            `/academy/me/batches/${batchId}/invites`,
            A.owner.token,
            { body: {} },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'POST',
            `/academy/me/batches/${batchId}/sessions`,
            A.owner.token,
            {
              body: {
                batchId,
                startLocal: `${D_OTHER}T22:00`,
                durationMin: 30,
              },
            },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'DELETE',
            `/academy/me/batches/${batchId}/students/${S.i1.id}`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
    }
    for (const sessionId of foreignSessions) {
      const owningBatch =
        sessionId === id.iSessT1Other ? id.iBatchT1 : id.bBatchT3;
      expect(
        (
          await api(
            'POST',
            `/academy/me/batches/${id.aBatchT1}/sessions/${sessionId}/cancel`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            'POST',
            `/academy/me/batches/${owningBatch}/sessions/${sessionId}/cancel`,
            A.owner.token,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api('POST', '/academy/me/attendance/teachers', A.owner.token, {
            body: { sessionId, status: 'present' },
          })
        ).status,
      ).toBe(404);
    }
    // Nothing was actually touched.
    const iBatch = await db
      .selectFrom('batches')
      .select(['title', 'status'])
      .where('id', '=', id.iBatchT1)
      .executeTakeFirstOrThrow();
    expect(iBatch).toEqual({ title: titles.iT1, status: 'active' });
    const iSess = await db
      .selectFrom('class_sessions')
      .select('status')
      .where('id', '=', id.iSessT1Other)
      .executeTakeFirstOrThrow();
    expect(iSess.status).toBe('scheduled');
    const ta = await db
      .selectFrom('teacher_attendance')
      .select('id')
      .where('session_id', 'in', [id.iSessT1Other, id.bSessT3])
      .execute();
    expect(ta).toHaveLength(0);
    // A hand-crafted batch-scoped academy announcement can't point at a private batch either.
    const ann = await api('POST', '/academy/me/announcements', A.owner.token, {
      body: {
        title: 'x',
        body: 'y',
        audienceType: 'batch',
        audienceBatchId: id.iBatchT1,
      },
    });
    expect(ann.status).toBe(404);
  });

  it('TEST 10 — the Academy context cannot be used to create private Individual activity', async () => {
    // (a) A batch made from the Academy dashboard belongs to the academy.
    const made = await api('POST', '/academy/me/batches', A.owner.token, {
      body: {
        tutorId: T1.id,
        title: `via-academy-${MARKER}`,
        subjectId,
        gradeLevelId,
        capacity: 10,
        feeMinor: 5000,
      },
    });
    expect(made.status).toBe(201);
    expect(
      (
        await db
          .selectFrom('batches')
          .select('academy_id')
          .where('id', '=', made.body.id)
          .executeTakeFirstOrThrow()
      ).academy_id,
    ).toBe(A.id);
    // (b) ...and only for one of ITS OWN active teachers.
    for (const stranger of [T2, T3]) {
      const denied = await api('POST', '/academy/me/batches', A.owner.token, {
        body: {
          tutorId: stranger.id,
          title: 'nope',
          subjectId,
          gradeLevelId,
          capacity: 10,
          feeMinor: 5000,
        },
      });
      expect(denied.status).toBe(403);
    }
    // (c) A teacher working in the Academy profile gets an Academy batch —
    //     there is no way to ask for a private one from that profile.
    const viaCtx = await api('POST', '/batches', T1.token, {
      ctx: `academy:${A.id}`,
      body: {
        title: `ctx-${MARKER}`,
        subjectId,
        gradeLevelId,
        capacity: 10,
        feeMinor: 5000,
      },
    });
    expect(viaCtx.status).toBe(201);
    expect(viaCtx.body.academy_id).toBe(A.id);
    // (d) The Academy profile cannot schedule on, invite to, roster, or archive a private batch...
    const wrongProfile = `academy:${A.id}`;
    expect(
      (
        await api('POST', '/sessions', T1.token, {
          ctx: wrongProfile,
          body: {
            batchId: id.iBatchT1,
            startLocal: `${D_OTHER}T21:00`,
            durationMin: 30,
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/invites/batch/${id.iBatchT1}`, T1.token, {
          ctx: wrongProfile,
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('GET', `/batches/${id.iBatchT1}/students`, T1.token, {
          ctx: wrongProfile,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/batches/${id.iBatchT1}/archive`, T1.token, {
          ctx: wrongProfile,
        })
      ).status,
    ).toBe(403);
    // ...and the Individual profile can't touch academy batches.
    expect(
      (
        await api('POST', '/sessions', T1.token, {
          body: {
            batchId: id.aBatchT1,
            startLocal: `${D_OTHER}T21:00`,
            durationMin: 30,
          },
        })
      ).status,
    ).toBe(403);
    // (e) A context can't be claimed for an academy the teacher doesn't belong to.
    expect(
      (await api('GET', '/batches/me', T2.token, { ctx: `academy:${A.id}` }))
        .status,
    ).toBe(403);
    expect(
      (
        await api('POST', '/batches', T2.token, {
          ctx: `academy:${A.id}`,
          body: {
            title: 'x',
            subjectId,
            gradeLevelId,
            capacity: 1,
            feeMinor: 0,
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (await api('GET', '/batches/me', T2.token, { ctx: 'academy:not-a-uuid' }))
        .status,
    ).toBe(400);
    // (f) A batch's context is immutable — even with raw SQL.
    await expect(
      sql`update batches set academy_id = null where id = ${id.aBatchT1}`.execute(
        db,
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      sql`update batches set academy_id = ${A.id} where id = ${id.iBatchT1}`.execute(
        db,
      ),
    ).rejects.toThrow(/immutable/);
  });

  it('TEST 11 — an Academy holiday affects Academy classes only', async () => {
    const created = await api('POST', '/academy/me/holidays', A.owner.token, {
      body: {
        name: `Holiday ${MARKER}`,
        startDate: D_HOLIDAY,
        scope: 'academy',
      },
    });
    expect(created.status).toBe(201);
    const status = async (sid: string) =>
      db
        .selectFrom('class_sessions')
        .select(['status', 'cancellation_reason'])
        .where('id', '=', sid)
        .executeTakeFirstOrThrow();
    expect(await status(id.aSessT1Holiday)).toEqual({
      status: 'cancelled',
      cancellation_reason: 'academy_holiday',
    });
    // The 7 PM Individual class of the very same teacher, same day, is untouched.
    expect(await status(id.iSessT1Holiday)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
    });
    // Another academy's class and a non-member's class that day are untouched too.
    expect((await status(id.iSessT2)).status).toBe('scheduled');
    // A batch-scoped holiday can't name a private batch.
    const scoped = await api('POST', '/academy/me/holidays', A.owner.token, {
      body: {
        name: 'x',
        startDate: D_HOLIDAY,
        scope: 'batches',
        batchIds: [id.iBatchT1],
      },
    });
    expect(scoped.status).toBe(404);
    await expect(
      sql`insert into holiday_batches (holiday_id, batch_id) values (${created.body.id}, ${id.iBatchT1})`.execute(
        db,
      ),
    ).rejects.toThrow(/holiday can only target batches owned by its academy/);
    // Students of the private batch get no academy-holiday notification.
    const note = await db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', S.i1.id)
      .where('type', '=', 'academy_holiday')
      .execute();
    expect(note).toHaveLength(0);
  });

  it('TEST 12 — Academy teacher leave affects Academy classes only', async () => {
    const applied = await api('POST', '/leave', T1.token, {
      body: {
        academyId: A.id,
        startDate: D_LEAVE,
        leaveType: 'full_day',
        reason: 'test',
      },
    });
    expect(applied.status).toBe(201);
    // The request snapshots the academy class only.
    const snap = await db
      .selectFrom('teacher_leave_request_sessions')
      .select('session_id')
      .where('leave_request_id', '=', applied.body.id)
      .execute();
    expect(snap.map((r) => r.session_id)).toEqual([id.aSessT1Leave]);
    // Even a hand-made snapshot row pointing at the private class is refused by the DB.
    await expect(
      sql`insert into teacher_leave_request_sessions (id, leave_request_id, session_id) values (${newId()}, ${applied.body.id}, ${id.iSessT1Leave})`.execute(
        db,
      ),
    ).rejects.toThrow(
      /leave request can only cover classes owned by its academy/,
    );

    // A specific-classes request can't smuggle in the private class either.
    const smuggle = await api('POST', '/leave', T1.token, {
      body: {
        academyId: A.id,
        startDate: D_LEAVE,
        leaveType: 'specific_classes',
        sessionIds: [id.iSessT1Leave],
      },
    });
    expect(smuggle.status).toBe(400);

    const approved = await api(
      'POST',
      `/academy/me/leave-requests/${applied.body.id}/approve`,
      A.owner.token,
      { body: {} },
    );
    expect(approved.status).toBe(201);
    const status = async (sid: string) =>
      db
        .selectFrom('class_sessions')
        .select(['status', 'cancellation_reason'])
        .where('id', '=', sid)
        .executeTakeFirstOrThrow();
    expect(await status(id.aSessT1Leave)).toEqual({
      status: 'cancelled',
      cancellation_reason: 'teacher_leave',
    });
    expect(await status(id.iSessT1Leave)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
    });
    // The academy's leave-session listing shows only academy classes.
    const listing = await api(
      'GET',
      `/academy/me/leave-requests/${applied.body.id}/sessions`,
      A.owner.token,
    );
    expect(JSON.stringify(listing.body)).not.toContain(id.iSessT1Leave);
    expect(JSON.stringify(listing.body)).not.toContain(titles.iT1);
  });

  it('TEST 13 — switching profile never merges datasets', async () => {
    const list = async (path: string, ctx?: string) =>
      (await api('GET', path, T1.token, { ctx })).body as any[];
    const ctxA = `academy:${A.id}`;

    const indiv = await list('/batches/me');
    const acad = await list('/batches/me', ctxA);
    expect(indiv.map((b) => b.id)).toEqual([id.iBatchT1]);
    expect(acad.map((b) => b.id).sort()).toEqual(
      expect.arrayContaining([id.aBatchT1]),
    );
    expect(acad.map((b) => b.id)).not.toContain(id.iBatchT1);
    expect(indiv.map((b) => b.id)).not.toContain(id.aBatchT1);
    // no header at all == Individual, never "everything"
    expect((await list('/batches/me', 'individual')).map((b) => b.id)).toEqual([
      id.iBatchT1,
    ]);

    const indivStudents = await list('/batches/me/students');
    const acadStudents = await list('/batches/me/students', ctxA);
    expect(indivStudents.map((s) => s.student_id)).toEqual([S.i1.id]);
    expect(acadStudents.map((s) => s.student_id)).toEqual([S.a1.id]);

    const cal = async (ctx?: string) =>
      (
        (await api('GET', `/sessions/me?${WINDOW}`, T1.token, { ctx }))
          .body as any[]
      ).map((s) => s.id);
    const indivCal = await cal();
    const acadCal = await cal(ctxA);
    expect(indivCal).toEqual(
      expect.arrayContaining([id.iSessT1Holiday, id.iSessT1Other]),
    );
    expect(indivCal.some((s) => acadCal.includes(s))).toBe(false);
    expect(acadCal).toEqual(expect.arrayContaining([id.aSessT1Other]));

    // Money and messages are per profile as well.
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await api('POST', `/fees/batch/${id.iBatchT1}/generate`, T1.token, {
      body: { periodLabel: period },
    });
    await api('POST', `/fees/batch/${id.aBatchT1}/generate`, T1.token, {
      ctx: ctxA,
      body: { periodLabel: period },
    });
    const feesI = (await api('GET', `/fees/period?period=${period}`, T1.token))
      .body as any[];
    const feesA = (
      await api('GET', `/fees/period?period=${period}`, T1.token, { ctx: ctxA })
    ).body as any[];
    expect(feesI.map((f) => f.batch_id)).toEqual([id.iBatchT1]);
    expect(feesA.map((f) => f.batch_id)).toEqual([id.aBatchT1]);
    const totalsI = (
      await api('GET', `/fees/period/totals?period=${period}`, T1.token)
    ).body;
    const totalsA = (
      await api('GET', `/fees/period/totals?period=${period}`, T1.token, {
        ctx: ctxA,
      })
    ).body;
    expect(totalsI.entries).toBe(1);
    expect(totalsA.entries).toBe(1);

    // Switching changed nothing about ownership.
    const rows = await db
      .selectFrom('batches')
      .select(['id', 'academy_id'])
      .where('id', 'in', [id.iBatchT1, id.aBatchT1])
      .execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.academy_id]))).toEqual({
      [id.iBatchT1]: null,
      [id.aBatchT1]: A.id,
    });
  });

  it("TEST 14 — the teacher's Individual plan and the Academy's plan are separate, each gating only its own context", async () => {
    const T5 = await makeUser('tutor', 't5');
    const C = await makeAcademy('C');
    await join(C.id, T5.id);
    const ctxC = `academy:${C.id}`;
    const batchBody = (t: string) => ({
      title: t,
      subjectId,
      gradeLevelId,
      capacity: 5,
      feeMinor: 0,
    });
    const past = new Date(Date.now() - 24 * 3600 * 1000);

    // Warm both plans (each starts its own trial lazily on first use).
    expect(
      (await api('POST', '/batches', T5.token, { body: batchBody('warm-i') }))
        .status,
    ).toBe(201);
    expect(
      (
        await api('POST', '/batches', T5.token, {
          ctx: ctxC,
          body: batchBody('warm-a'),
        })
      ).status,
    ).toBe(201);

    // The teacher's OWN plan lapses: Individual is blocked, the Academy profile keeps working.
    await db
      .updateTable('subscriptions')
      .set({ trial_ends_at: past })
      .where('tutor_id', '=', T5.id)
      .execute();
    expect(
      (
        await api('POST', '/batches', T5.token, {
          body: batchBody('i-blocked'),
        })
      ).status,
    ).toBe(402);
    expect(
      (
        await api('POST', '/batches', T5.token, {
          ctx: ctxC,
          body: batchBody('a-ok'),
        })
      ).status,
    ).toBe(201);

    // The teacher renews; the ACADEMY's plan lapses: now it is the other way round.
    await db
      .updateTable('subscriptions')
      .set({ trial_ends_at: new Date(Date.now() + 30 * 24 * 3600 * 1000) })
      .where('tutor_id', '=', T5.id)
      .execute();
    await db
      .updateTable('academy_subscriptions')
      .set({ trial_ends_at: past })
      .where('academy_id', '=', C.id)
      .execute();
    expect(
      (await api('POST', '/batches', T5.token, { body: batchBody('i-ok') }))
        .status,
    ).toBe(201);
    expect(
      (
        await api('POST', '/batches', T5.token, {
          ctx: ctxC,
          body: batchBody('a-blocked'),
        })
      ).status,
    ).toBe(402);
    // ...including when the academy owner creates one from its own dashboard.
    expect(
      (
        await api('POST', '/academy/me/batches', C.owner.token, {
          body: { tutorId: T5.id, ...batchBody('owner-blocked') },
        })
      ).status,
    ).toBe(402);

    const individual = await api(
      'GET',
      '/academy/me/subscription',
      C.owner.token,
    );
    expect(individual.status).toBe(200);
    expect(individual.body.active).toBe(false);

    // Individual activity is never billed to / counted for the academy: fees for
    // Academy batches don't feed the teacher's payout, Individual ones do.
    const rows = await db
      .selectFrom('batches')
      .select(['title', 'academy_id'])
      .where('tutor_id', '=', T5.id)
      .execute();
    expect(
      Object.fromEntries(rows.map((r) => [r.title, r.academy_id])),
    ).toEqual({
      'warm-i': null,
      'warm-a': C.id,
      'a-ok': C.id,
      'i-ok': null,
    });
  });

  it('TEST 5 + 6 — after leaving: Academy A keeps its HISTORY, and never sees NEW Individual activity', async () => {
    const before = await scanAcademy(A.owner, [S.a4.id]);
    await leave(A.id, T4.id);

    // The teacher's active academy context is gone...
    const offered = await api('GET', '/teaching-contexts/me', T4.token);
    expect(offered.body.academies).toEqual([]);
    expect(
      (await api('GET', '/batches/me', T4.token, { ctx: `academy:${A.id}` }))
        .status,
    ).toBe(403);
    expect(
      (
        await api('POST', '/batches', T4.token, {
          ctx: `academy:${A.id}`,
          body: {
            title: 'x',
            subjectId,
            gradeLevelId,
            capacity: 1,
            feeMinor: 0,
          },
        })
      ).status,
    ).toBe(403);
    // ...and she can no longer operate the academy's batch directly by id either.
    expect(
      (
        await api('POST', '/sessions', T4.token, {
          body: {
            batchId: id.aBatchT4,
            startLocal: `${D_OTHER}T23:00`,
            durationMin: 30,
          },
        })
      ).status,
    ).toBe(403);
    // No data was converted or deleted by leaving.
    const rows = await db
      .selectFrom('batches')
      .select(['id', 'academy_id'])
      .where('id', 'in', [id.aBatchT4, id.iBatchT4])
      .execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.academy_id]))).toEqual({
      [id.aBatchT4]: A.id,
      [id.iBatchT4]: null,
    });

    // TEST 5: history is retained by the academy.
    const scan = await scanAcademy(A.owner, [S.a4.id]);
    const batches = scan['/academy/me/batches'].body as Array<{
      id: string;
      tutorDisplayName: string | null;
    }>;
    const kept = batches.find((b) => b.id === id.aBatchT4);
    expect(kept).toBeDefined();
    expect(kept?.tutorDisplayName).toContain('t4'); // still attributed to the departed teacher
    expect(
      (
        scan[`/academy/me/sessions?${WINDOW}`].body as Array<{ id: string }>
      ).map((s) => s.id),
    ).toContain(id.aSessT4);
    expect(
      (
        scan['/academy/me/students?status=all'].body as Array<{
          studentId: string;
        }>
      ).map((s) => s.studentId),
    ).toContain(S.a4.id);
    expect(JSON.stringify(before['/academy/me/batches'].body)).toContain(
      id.aBatchT4,
    );
    // The academy can still run its own class of a departed teacher (cancel it).
    // (checked on the control class so later tests keep their data)
    // TEST 6: the teacher's private batch — old and NEW — stays invisible.
    id.iBatchT4After = await teacherCreatesBatch(T4, titles.iT4After);
    await enroll(id.iBatchT4After, S.i4b.id);
    const sess = await teacherSchedules(
      T4,
      id.iBatchT4After,
      `${D_OTHER}T14:00`,
    );
    const after = await scanAcademy(A.owner, [S.i4.id, S.i4b.id]);
    expectNoneOf(serialized(after), [
      id.iBatchT4,
      id.iBatchT4After,
      sess,
      titles.iT4,
      titles.iT4After,
      S.i4.id,
      S.i4b.id,
      id.iSessT4,
    ]);
    expect(
      (
        await api(
          'GET',
          `/academy/me/batches/${id.iBatchT4After}`,
          A.owner.token,
        )
      ).status,
    ).toBe(404);
  });

  it("TEST 15 — rejoining exposes only the Academy's own records, never unrelated Individual activity", async () => {
    await join(A.id, T4.id); // rejoin (a NEW active membership row)
    const scan = await scanAcademy(A.owner, [S.i4.id, S.i4b.id]);
    const text = serialized(scan);
    expectNoneOf(text, [
      id.iBatchT4,
      id.iBatchT4After,
      titles.iT4,
      titles.iT4After,
      S.i4.id,
      S.i4b.id,
      id.iSessT4,
    ]);
    // Her Academy history is (still) there, and she can work in that profile again.
    expect(
      (scan['/academy/me/batches'].body as Array<{ id: string }>).map(
        (b) => b.id,
      ),
    ).toContain(id.aBatchT4);
    const ctxA = `academy:${A.id}`;
    expect(
      (
        (await api('GET', '/batches/me', T4.token, { ctx: ctxA })).body as any[]
      ).map((b) => b.id),
    ).toEqual([id.aBatchT4]);
    expect(
      ((await api('GET', '/batches/me', T4.token)).body as any[])
        .map((b) => b.id)
        .sort(),
    ).toEqual([id.iBatchT4, id.iBatchT4After].sort());
    // the teacher detail page also shows her academy batches only
    const detail = await api(
      'GET',
      `/academy/me/teachers/${T4.id}`,
      A.owner.token,
    );
    expect(
      (detail.body.batches as Array<{ id: string }>).map((b) => b.id),
    ).toEqual([id.aBatchT4]);
  });

  it('TEST 16 — a teacher keeps managing her Individual business independently (also without any academy)', async () => {
    // T2 is a member of nothing: full lifecycle in the Individual profile.
    const extra = await teacherCreatesBatch(T2, `indep-${MARKER}`);
    const sess = await teacherSchedules(T2, extra, `${D_OTHER}T18:30`);
    expect(
      (
        await api('PATCH', `/batches/${extra}`, T2.token, {
          body: { title: `indep2-${MARKER}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `/sessions/${sess}/cancel`, T2.token)).status,
    ).toBe(201);
    const inv = await api('POST', `/invites/batch/${extra}`, T2.token, {
      body: {},
    });
    expect(inv.status).toBe(201);
    expect(
      (await api('POST', `/batches/${extra}/archive`, T2.token)).status,
    ).toBe(201);
    expect(
      ((await api('GET', '/batches/me', T2.token)).body as any[]).map(
        (b) => b.id,
      ),
    ).toEqual(expect.arrayContaining([id.iBatchT2, extra]));
    // T4, who has left and rejoined academies, still runs the private batch normally.
    expect(
      (
        await api('POST', '/sessions', T4.token, {
          body: {
            batchId: id.iBatchT4After,
            startLocal: `${D_OTHER}T16:00`,
            durationMin: 45,
          },
        })
      ).status,
    ).toBe(201);
    // Public marketplace page of a teacher advertises Individual batches only.
    const open = await api('GET', '/batches/me/open', T1.token);
    expect((open.body as any[]).map((b) => b.id)).toEqual([id.iBatchT1]);
  });

  it("DB — assessments can't straddle contexts, and an assessment's context is immutable", async () => {
    const asmt = async (academyId: string | null) => {
      const aid = newId();
      await db
        .insertInto('assessments')
        .values({
          id: aid,
          tutor_id: T1.id,
          academy_id: academyId,
          mode: 'online',
          title: 't',
          subject_id: subjectId,
          week_start_date: isoDay(0),
        })
        .execute();
      return aid;
    };
    const individual = await asmt(null);
    await expect(
      sql`insert into assessment_batches (assessment_id, batch_id) values (${individual}, ${id.aBatchT1})`.execute(
        db,
      ),
    ).rejects.toThrow(/different teaching contexts/);
    await sql`insert into assessment_batches (assessment_id, batch_id) values (${individual}, ${id.iBatchT1})`.execute(
      db,
    );
    await expect(
      sql`update assessments set academy_id = ${A.id} where id = ${individual}`.execute(
        db,
      ),
    ).rejects.toThrow(/immutable/);

    // Compliance/detail in the Academy API only ever includes assessments the academy owns.
    const academyOwned = await asmt(A.id);
    await sql`insert into assessment_batches (assessment_id, batch_id) values (${academyOwned}, ${id.aBatchT1})`.execute(
      db,
    );
    expect(
      (await api('GET', `/academy/me/assessments/${individual}`, A.owner.token))
        .status,
    ).toBe(404);
    expect(
      (
        await api(
          'GET',
          `/academy/me/assessments/${academyOwned}`,
          A.owner.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await api(
          'GET',
          `/academy/me/assessments/${academyOwned}`,
          B.owner.token,
        )
      ).status,
    ).toBe(404);
    const compliance = await api(
      'GET',
      '/academy/me/assessments/weekly-compliance',
      A.owner.token,
    );
    expect(JSON.stringify(compliance.body)).toContain(academyOwned);
    expect(JSON.stringify(compliance.body)).not.toContain(individual);
    // Teachers see their own assessments per profile, too.
    expect(
      (
        (await api('GET', '/assessments/online/me', T1.token)).body as any[]
      ).map((a) => a.id),
    ).toEqual([individual]);
    expect(
      (
        (
          await api('GET', '/assessments/online/me', T1.token, {
            ctx: `academy:${A.id}`,
          })
        ).body as any[]
      ).map((a) => a.id),
    ).toEqual([academyOwned]);
  });

  it("public discovery — an academy is described by ITS OWN batches, never its members' Individual listings", async () => {
    const page = await api(
      'GET',
      `/marketplace/academies/${MARKER}-academy-a`,
      A.owner.token,
    );
    expect(page.status).toBe(200);
    const text = JSON.stringify(page.body);
    expectNoneOf(text, [id.iBatchT1, titles.iT1, S.i1.id]);
    expect(text).toContain(titles.aT1);
    // a teacher's own public page never lists the academy's batches
    // (checked via the Individual open-batches query the page uses)
    const open = await api('GET', '/batches/me/open', T1.token);
    expect(JSON.stringify(open.body)).not.toContain(id.aBatchT1);
  });
});
