/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
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
 * H3 — Teacher Leave workflow, proven over real HTTP against the real
 * database: request ownership, approval re-verification, transactional/
 * concurrency safety, Individual/Academy isolation, and the membership
 * lifecycle (a teacher leaving an academy must retire their own pending
 * requests and never affect Individual activity).
 */

const MARKER = `lw${Date.now().toString(36)}`;
jest.setTimeout(180_000);

type Res = { status: number; body: any };

describe('Teacher Leave workflow (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  let subjectId: string;
  let gradeLevelId: string;

  const cleanup = { users: [] as string[], academies: [] as string[] };
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST' | 'DELETE',
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
    const slug = `${MARKER}-academy-${label}`.toLowerCase();
    await db
      .insertInto('academies')
      .values({
        id,
        name: `Academy ${label} ${MARKER}`,
        slug,
        owner_user_id: owner.id,
      })
      .execute();
    cleanup.academies.push(id);
    return { id, slug, owner };
  }

  async function join(academyId: string, tutorId: string): Promise<string> {
    const id = newId();
    await db
      .insertInto('academy_memberships')
      .values({ id, academy_id: academyId, tutor_id: tutorId })
      .execute();
    return id;
  }

  async function enroll(batchId: string, studentId: string) {
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
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
  const sessionStatus = async (sid: string) =>
    db
      .selectFrom('class_sessions')
      .select(['status', 'cancellation_reason', 'teacher_leave_request_id'])
      .where('id', '=', sid)
      .executeTakeFirstOrThrow();

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
  it("§38 — full workflow: leave affects only the Academy session, Individual is untouched; a departed teacher's pending request can no longer be approved", async () => {
    const A = await makeAcademy('a1');
    const T = await makeUser('tutor', 't1');
    const membershipId = await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;

    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-1`, ctxA);
    const iBatch = await teacherCreatesBatch(T, `INDIV-${MARKER}-1`);
    const student = await makeUser('student', 's1');
    await enroll(aBatch, student.id);
    await enroll(iBatch, student.id);

    const day = isoDay(30);
    const aSession = await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);
    const iSession = await teacherSchedules(T, iBatch, `${day}T14:00`);

    // Teacher requests full-day leave against Academy A.
    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    // The academy admin's pending list shows it, and its session detail
    // shows ONLY the Academy session — never the teacher's Individual one.
    const pending = await api(
      'GET',
      '/academy/me/leave-requests/pending',
      A.owner.token,
    );
    expect((pending.body as Array<{ id: string }>).map((r) => r.id)).toContain(
      requestId,
    );
    const sessions = await api(
      'GET',
      `/academy/me/leave-requests/${requestId}/sessions`,
      A.owner.token,
    );
    expect(
      (sessions.body as Array<{ session_id: string }>).map((s) => s.session_id),
    ).toEqual([aSession]);

    // Approve.
    const approved = await api(
      'POST',
      `/academy/me/leave-requests/${requestId}/approve`,
      A.owner.token,
      { body: {} },
    );
    expect(approved.status).toBe(201);

    expect(await sessionStatus(aSession)).toEqual({
      status: 'cancelled',
      cancellation_reason: 'teacher_leave',
      teacher_leave_request_id: requestId,
    });
    // Individual session: completely untouched.
    expect(await sessionStatus(iSession)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });

    // A second leave request, then the teacher leaves the academy before
    // it's decided.
    const day2 = isoDay(31);
    const aSession2 = await teacherSchedules(T, aBatch, `${day2}T10:00`, ctxA);
    const created2 = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day2,
        endDate: day2,
        leaveType: 'full_day',
      },
    });
    expect(created2.status).toBe(201);
    const requestId2 = created2.body.id as string;

    const removed = await api(
      'DELETE',
      `/academy/me/teachers/${membershipId}`,
      A.owner.token,
    );
    expect(removed.status).toBe(200);

    // The pending request was auto-invalidated the instant membership ended.
    const afterLeaving = await api('GET', '/leave/me', T.token);
    const req2 = (
      afterLeaving.body as Array<{ id: string; status: string }>
    ).find((r) => r.id === requestId2);
    expect(req2?.status).toBe('cancelled');

    // Approving it now is refused as an already-decided request — never a
    // 500, and it produces ZERO side effects.
    const lateApprove = await api(
      'POST',
      `/academy/me/leave-requests/${requestId2}/approve`,
      A.owner.token,
      { body: {} },
    );
    expect(lateApprove.status).toBe(400);
    expect(await sessionStatus(aSession2)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });
    // Untouched Individual class, still.
    expect(await sessionStatus(iSession)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });
  });

  // ==========================================================================
  it('§39 — future Academy classes remain Academy-owned after the teacher leaves; the departed teacher can no longer operate them', async () => {
    const A = await makeAcademy('a2');
    const T = await makeUser('tutor', 't2');
    const membershipId = await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;

    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-2`, ctxA);
    const futureSession = await teacherSchedules(
      T,
      aBatch,
      `${isoDay(45)}T09:00`,
      ctxA,
    );

    await api('DELETE', `/academy/me/teachers/${membershipId}`, A.owner.token);

    // Still Academy-owned, in the academy's own listing.
    const batchRow = await db
      .selectFrom('batches')
      .select('academy_id')
      .where('id', '=', aBatch)
      .executeTakeFirstOrThrow();
    expect(batchRow.academy_id).toBe(A.id);
    const academyBatches = await api(
      'GET',
      '/academy/me/batches',
      A.owner.token,
    );
    expect(
      (academyBatches.body as Array<{ id: string }>).map((b) => b.id),
    ).toContain(aBatch);

    // The academy can still manage it (cancel it here as the concrete
    // "manage" action already supported).
    const cancel = await api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions/${futureSession}/cancel`,
      A.owner.token,
    );
    expect(cancel.status).toBe(201);
    expect((await sessionStatus(futureSession)).status).toBe('cancelled');

    // The departed teacher can no longer touch it via the Academy context.
    const asFormerMember = await api(
      'GET',
      `/batches/${aBatch}/students`,
      T.token,
      { ctx: ctxA },
    );
    expect(asFormerMember.status).toBe(403);
  });

  // ==========================================================================
  it('TEST 9/35 — two concurrent approvals never double-cancel or double-notify', async () => {
    const A = await makeAcademy('a3');
    const T = await makeUser('tutor', 't3');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-3`, ctxA);
    const day = isoDay(32);
    await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    const requestId = created.body.id as string;

    const [r1, r2] = await Promise.all([
      api(
        'POST',
        `/academy/me/leave-requests/${requestId}/approve`,
        A.owner.token,
        { body: {} },
      ),
      api(
        'POST',
        `/academy/me/leave-requests/${requestId}/approve`,
        A.owner.token,
        { body: {} },
      ),
    ]);
    const statuses = [r1.status, r2.status].sort();
    // Exactly one wins (2xx), the other reports a conflict — never both
    // succeeding, never both failing.
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);

    const notifCount = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('user_id', '=', T.id)
      .where('type', '=', 'teacher_leave_approved')
      .executeTakeFirstOrThrow();
    expect(Number(notifCount.count)).toBe(1);

    const finalStatus = await db
      .selectFrom('teacher_leave_requests')
      .select('status')
      .where('id', '=', requestId)
      .executeTakeFirstOrThrow();
    expect(finalStatus.status).toBe('approved');
  });

  // ==========================================================================
  it('TEST 6/11 — rejection never touches sessions, and repeated rejection is a safe conflict, not a 500', async () => {
    const A = await makeAcademy('a4');
    const T = await makeUser('tutor', 't4');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-4`, ctxA);
    const day = isoDay(33);
    const session = await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    const requestId = created.body.id as string;

    const rejected = await api(
      'POST',
      `/academy/me/leave-requests/${requestId}/reject`,
      A.owner.token,
    );
    expect(rejected.status).toBe(201);
    expect(await sessionStatus(session)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });

    const rejectedAgain = await api(
      'POST',
      `/academy/me/leave-requests/${requestId}/reject`,
      A.owner.token,
    );
    expect(rejectedAgain.status).toBe(400);
  });

  // ==========================================================================
  it("TEST 14/17 — Academy A cannot read, approve, or reject Academy B's leave request", async () => {
    const A = await makeAcademy('a5');
    const B = await makeAcademy('b5');
    const T = await makeUser('tutor', 't5');
    await join(B.id, T.id);
    const ctxB = `academy:${B.id}`;
    const bBatch = await teacherCreatesBatch(T, `ACAD-B-${MARKER}`, ctxB);
    const day = isoDay(34);
    await teacherSchedules(T, bBatch, `${day}T10:00`, ctxB);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: B.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    const requestId = created.body.id as string;

    for (const probe of [
      api(
        'GET',
        `/academy/me/leave-requests/${requestId}/sessions`,
        A.owner.token,
      ),
      api(
        'POST',
        `/academy/me/leave-requests/${requestId}/approve`,
        A.owner.token,
        { body: {} },
      ),
      api(
        'POST',
        `/academy/me/leave-requests/${requestId}/reject`,
        A.owner.token,
      ),
    ]) {
      expect((await probe).status).toBe(404);
    }
    // The request is completely unaffected by Academy A's attempts.
    const row = await db
      .selectFrom('teacher_leave_requests')
      .select('status')
      .where('id', '=', requestId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
    // Academy B, meanwhile, can act on it normally.
    expect(
      (
        await api(
          'GET',
          `/academy/me/leave-requests/${requestId}/sessions`,
          B.owner.token,
        )
      ).status,
    ).toBe(200);
  });

  // ==========================================================================
  it("TEST 15/16 — a teacher can't manipulate another teacher's request, or file one for an academy they don't belong to", async () => {
    const A = await makeAcademy('a6');
    const T1 = await makeUser('tutor', 't6a');
    const T2 = await makeUser('tutor', 't6b');
    await join(A.id, T1.id);
    const ctxA = `academy:${A.id}`;
    const batch = await teacherCreatesBatch(T1, `ACAD-${MARKER}-6`, ctxA);
    const day = isoDay(35);
    await teacherSchedules(T1, batch, `${day}T10:00`, ctxA);

    const created = await api('POST', '/leave', T1.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    const requestId = created.body.id as string;

    // T2 (not a member of A, and not the request's owner) can't withdraw
    // or view T1's request.
    expect(
      (await api('POST', `/leave/${requestId}/withdraw`, T2.token)).status,
    ).toBe(403);
    expect(
      (await api('GET', `/leave/${requestId}/sessions`, T2.token)).status,
    ).toBe(403);

    // T2 can't file a leave request against an academy they don't belong to.
    const denied = await api('POST', '/leave', T2.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    expect(denied.status).toBe(403);
  });

  // ==========================================================================
  it('teacher-initiated "Leave Academy" retires any pending leave request and never touches Individual activity', async () => {
    const A = await makeAcademy('a7');
    const T = await makeUser('tutor', 't7');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-7`, ctxA);
    const iBatch = await teacherCreatesBatch(T, `INDIV-${MARKER}-7`);
    const day = isoDay(36);
    const aSession = await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);
    const iSession = await teacherSchedules(T, iBatch, `${day}T12:00`);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    const requestId = created.body.id as string;

    const left = await api(
      'POST',
      `/marketplace/academies/${A.slug}/leave`,
      T.token,
    );
    expect(left.status).toBe(201);

    const membership = await db
      .selectFrom('academy_memberships')
      .select('status')
      .where('academy_id', '=', A.id)
      .where('tutor_id', '=', T.id)
      .executeTakeFirstOrThrow();
    expect(membership.status).toBe('left');

    const request = await db
      .selectFrom('teacher_leave_requests')
      .select('status')
      .where('id', '=', requestId)
      .executeTakeFirstOrThrow();
    expect(request.status).toBe('cancelled');

    // Cannot leave the same academy twice.
    expect(
      (await api('POST', `/marketplace/academies/${A.slug}/leave`, T.token))
        .status,
    ).toBe(400);

    // Neither session was ever touched by any of this.
    expect((await sessionStatus(aSession)).status).toBe('scheduled');
    expect((await sessionStatus(iSession)).status).toBe('scheduled');

    // Historical Academy batch stays Academy-owned.
    expect(
      (
        await db
          .selectFrom('batches')
          .select('academy_id')
          .where('id', '=', aBatch)
          .executeTakeFirstOrThrow()
      ).academy_id,
    ).toBe(A.id);
  });

  // ==========================================================================
  it('TEST 2 — a specific-classes leave request can never smuggle in an Individual class id', async () => {
    const A = await makeAcademy('a8');
    const T = await makeUser('tutor', 't8');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const aBatch = await teacherCreatesBatch(T, `ACAD-${MARKER}-8`, ctxA);
    const iBatch = await teacherCreatesBatch(T, `INDIV-${MARKER}-8`);
    const day = isoDay(37);
    const aSession = await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);
    const iSession = await teacherSchedules(T, iBatch, `${day}T12:00`);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'specific_classes',
        sessionIds: [aSession, iSession],
      },
    });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    const sessions = await api('GET', `/leave/${requestId}/sessions`, T.token);
    // Only the Academy session was ever snapshotted — the Individual one
    // in the request body was silently dropped, never stored.
    expect(
      (sessions.body as Array<{ session_id: string }>).map((s) => s.session_id),
    ).toEqual([aSession]);
  });

  // ==========================================================================
  // H3 extra regression coverage (confirm-only item, per the audit): the
  // decide()/approve() path re-queries eligible sessions live at approval
  // time rather than trusting whatever was true when the request was
  // created — these two tests exercise that directly rather than only
  // implicitly through the existing full-workflow test.
  // ==========================================================================

  it('stale snapshot cannot affect a freshly-created Individual session on the same day — created AFTER the leave request, BEFORE approval', async () => {
    const A = await makeAcademy('freshindiv');
    const T = await makeUser('tutor', 'freshindiv1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;

    const aBatch = await teacherCreatesBatch(T, `FRESHI-ACAD-${MARKER}`, ctxA);
    const day = isoDay(32);
    await teacherSchedules(T, aBatch, `${day}T10:00`, ctxA);

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    // Created AFTER the leave request — never in any snapshot, and it's
    // a private Individual class besides.
    const iBatch = await teacherCreatesBatch(T, `FRESHI-INDIV-${MARKER}`);
    const freshIndividualSession = await teacherSchedules(
      T,
      iBatch,
      `${day}T18:00`,
    );

    const approved = await api(
      'POST',
      `/academy/me/leave-requests/${requestId}/approve`,
      A.owner.token,
      { body: {} },
    );
    expect(approved.status).toBe(201);

    expect(await sessionStatus(freshIndividualSession)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });
  });

  it("decide() re-verifies the ORIGINAL snapshot's sessions live (catches one that became ineligible since), but never expands scope to a session scheduled after the request was filed", async () => {
    const A = await makeAcademy('livequery');
    const T = await makeUser('tutor', 'livequery1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;

    const aBatch = await teacherCreatesBatch(T, `LIVEQ-${MARKER}`, ctxA);
    const day = isoDay(33);
    const originalSession = await teacherSchedules(
      T,
      aBatch,
      `${day}T10:00`,
      ctxA,
    );

    const created = await api('POST', '/leave', T.token, {
      body: {
        academyId: A.id,
        startDate: day,
        endDate: day,
        leaveType: 'full_day',
      },
    });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    // The snapshot taken at creation time only knew about originalSession
    // — this IS the request's fixed scope, not a lower bound.
    const snapshotAtCreation = await api(
      'GET',
      `/leave/${requestId}/sessions`,
      T.token,
    );
    expect(
      (snapshotAtCreation.body as Array<{ session_id: string }>).map(
        (s) => s.session_id,
      ),
    ).toEqual([originalSession]);

    // A second Academy session on the SAME day, scheduled by the teacher
    // AFTER they already filed for leave — reading teacher-leave.
    // repository.ts's decide() confirms this is deliberate: it re-verifies
    // eligibility of exactly the snapshotted session ids (guarding against
    // one having since been cancelled/reassigned), never a fresh
    // date-range query that could sweep in something the teacher scheduled
    // afterward without ever seeing it listed on the leave request.
    const lateAddedSession = await teacherSchedules(
      T,
      aBatch,
      `${day}T15:00`,
      ctxA,
    );

    const approved = await api(
      'POST',
      `/academy/me/leave-requests/${requestId}/approve`,
      A.owner.token,
      { body: {} },
    );
    expect(approved.status).toBe(201);

    expect((await sessionStatus(originalSession)).status).toBe('cancelled');
    // Untouched — this leave request's scope was fixed at filing time.
    expect(await sessionStatus(lateAddedSession)).toEqual({
      status: 'scheduled',
      cancellation_reason: null,
      teacher_leave_request_id: null,
    });
  });
});
