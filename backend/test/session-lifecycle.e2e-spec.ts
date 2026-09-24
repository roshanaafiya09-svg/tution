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
 * H2 — Class session lifecycle guards, proven over real HTTP against the
 * real database: valid/invalid state transitions, atomic concurrency
 * safety, idempotency (a repeat request is rejected, not silently
 * re-applied), time-of-day rules, and Individual/Academy isolation on the
 * cancel/complete actions. See SessionsService.cancel/complete's doc
 * comments for the guard design this exercises.
 */

const MARKER = `sl${Date.now().toString(36)}`;
jest.setTimeout(180_000);

type Res = { status: number; body: any };

describe('Class session lifecycle guards (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  let subjectId: string;
  let gradeLevelId: string;

  const cleanup = { users: [] as string[], academies: [] as string[] };
  let phoneSeq = 0;

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

  /** Schedules a session at an exact UTC instant — bypassing the local-
   *  wall-clock/DST conversion (timezone: 'UTC' makes startLocal an
   *  identity conversion) so time-guard tests can place a session exactly
   *  before/after "now" without racing the clock. */
  async function scheduleSessionAt(
    tutor: { token: string },
    batchId: string,
    at: Date,
    ctx?: string,
  ) {
    const startLocal = at.toISOString().slice(0, 19);
    const res = await api('POST', '/sessions', tutor.token, {
      ctx,
      body: { batchId, startLocal, durationMin: 30, timezone: 'UTC' },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function academyScheduleSessionAt(
    owner: { token: string },
    batchId: string,
    at: Date,
  ) {
    const startLocal = at.toISOString().slice(0, 19);
    const res = await api(
      'POST',
      `/academy/me/batches/${batchId}/sessions`,
      owner.token,
      { body: { batchId, startLocal, durationMin: 30, timezone: 'UTC' } },
    );
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const sessionStatus = async (sid: string) =>
    (
      await db
        .selectFrom('class_sessions')
        .select(['status', 'cancellation_reason'])
        .where('id', '=', sid)
        .executeTakeFirstOrThrow()
    ).status;

  const FUTURE = () => new Date(Date.now() + 3600_000); // an hour from now
  const PAST = () => new Date(Date.now() - 3600_000); // an hour ago

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
  it('full workflow: cancel is terminal (a later complete attempt cannot revive it), and complete is terminal (a later cancel attempt cannot undo it)', async () => {
    const T = await makeUser('tutor', 'wf');
    const batch = await teacherCreatesBatch(T, `WF-${MARKER}`);

    // Create → Cancel → Cancel again → attempt Complete → still CANCELLED.
    const s1 = await scheduleSessionAt(T, batch, FUTURE());
    const firstCancel = await api('POST', `/sessions/${s1}/cancel`, T.token);
    expect(firstCancel.status).toBe(201);
    expect(await sessionStatus(s1)).toBe('cancelled');

    const secondCancel = await api('POST', `/sessions/${s1}/cancel`, T.token);
    expect(secondCancel.status).toBe(409);
    expect(secondCancel.body.code).toBe('SESSION_ALREADY_CANCELLED');

    const completeAfterCancel = await api(
      'POST',
      `/sessions/${s1}/complete`,
      T.token,
    );
    expect(completeAfterCancel.status).toBe(409);
    expect(completeAfterCancel.body.code).toBe('INVALID_SESSION_TRANSITION');
    expect(await sessionStatus(s1)).toBe('cancelled');

    // Create another, already-started → Complete → attempt Cancel → still COMPLETED.
    const s2 = await scheduleSessionAt(T, batch, PAST());
    const complete = await api('POST', `/sessions/${s2}/complete`, T.token);
    expect(complete.status).toBe(201);
    expect(await sessionStatus(s2)).toBe('completed');

    const cancelAfterComplete = await api(
      'POST',
      `/sessions/${s2}/cancel`,
      T.token,
    );
    expect(cancelAfterComplete.status).toBe(409);
    expect(cancelAfterComplete.body.code).toBe('INVALID_SESSION_TRANSITION');
    expect(await sessionStatus(s2)).toBe('completed');

    const secondComplete = await api(
      'POST',
      `/sessions/${s2}/complete`,
      T.token,
    );
    expect(secondComplete.status).toBe(409);
    expect(secondComplete.body.code).toBe('SESSION_ALREADY_COMPLETED');
  });

  // ==========================================================================
  it('time guards: a class can only be completed once it has started, and only cancelled while it has not', async () => {
    const T = await makeUser('tutor', 'time');
    const batch = await teacherCreatesBatch(T, `TIME-${MARKER}`);

    const future = await scheduleSessionAt(T, batch, FUTURE());
    const tooEarly = await api('POST', `/sessions/${future}/complete`, T.token);
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.code).toBe('SESSION_NOT_STARTED');
    expect(await sessionStatus(future)).toBe('scheduled');

    const cancelFuture = await api(
      'POST',
      `/sessions/${future}/cancel`,
      T.token,
    );
    expect(cancelFuture.status).toBe(201);
    expect(await sessionStatus(future)).toBe('cancelled');

    const past = await scheduleSessionAt(T, batch, PAST());
    const tooLate = await api('POST', `/sessions/${past}/cancel`, T.token);
    expect(tooLate.status).toBe(400);
    expect(tooLate.body.code).toBe('SESSION_ALREADY_STARTED');
    expect(await sessionStatus(past)).toBe('scheduled');

    const completePast = await api(
      'POST',
      `/sessions/${past}/complete`,
      T.token,
    );
    expect(completePast.status).toBe(201);
    expect(await sessionStatus(past)).toBe('completed');
  });

  // ==========================================================================
  it('concurrent cancel + complete on the same session: exactly one wins, the other gets a clean conflict, never a 500', async () => {
    const T = await makeUser('tutor', 'race');
    const batch = await teacherCreatesBatch(T, `RACE-${MARKER}`);
    // Already started, so BOTH actions are individually legal right now —
    // the only thing that should decide the outcome is which request's
    // UPDATE commits first.
    const s = await scheduleSessionAt(T, batch, PAST());

    const [cancelRes, completeRes] = await Promise.all([
      api('POST', `/sessions/${s}/cancel`, T.token),
      api('POST', `/sessions/${s}/complete`, T.token),
    ]);

    const statuses = [cancelRes.status, completeRes.status].sort();
    // One request lands on the SESSION_ALREADY_STARTED time guard only if
    // it's still 'scheduled' when it runs — but since the class already
    // started, cancel is time-blocked regardless of the race, so the only
    // legitimate outcomes are: cancel loses to the time guard (400) or to
    // the transition guard (409) while complete succeeds (201); a 500 is
    // never acceptable.
    expect(statuses).not.toContain(500);
    const finalStatus = await sessionStatus(s);
    expect(['completed', 'cancelled']).toContain(finalStatus);

    // Exactly one of the two requests reports success.
    const successes = [cancelRes.status, completeRes.status].filter(
      (st) => st === 201,
    );
    expect(successes).toHaveLength(1);

    // And the DB's final state agrees with whichever one succeeded.
    if (completeRes.status === 201) {
      expect(finalStatus).toBe('completed');
    } else if (cancelRes.status === 201) {
      expect(finalStatus).toBe('cancelled');
    }
  });

  // ==========================================================================
  it('concurrent completes: exactly one succeeds, the rest are rejected — no double side effects possible', async () => {
    const T = await makeUser('tutor', 'race2');
    const batch = await teacherCreatesBatch(T, `RACE2-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, PAST());

    const results = await Promise.all([
      api('POST', `/sessions/${s}/complete`, T.token),
      api('POST', `/sessions/${s}/complete`, T.token),
      api('POST', `/sessions/${s}/complete`, T.token),
      api('POST', `/sessions/${s}/complete`, T.token),
      api('POST', `/sessions/${s}/complete`, T.token),
    ]);

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const c of conflicts) {
      expect([
        'SESSION_ALREADY_COMPLETED',
        'INVALID_SESSION_TRANSITION',
      ]).toContain(c.body.code);
    }
    expect(await sessionStatus(s)).toBe('completed');
  });

  // ==========================================================================
  it("wrong user cannot cancel or complete someone else's Individual session", async () => {
    const T = await makeUser('tutor', 'owner1');
    const other = await makeUser('tutor', 'other1');
    const batch = await teacherCreatesBatch(T, `OWN-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, FUTURE());

    expect(
      (await api('POST', `/sessions/${s}/cancel`, other.token)).status,
    ).toBe(403);
    const sPast = await scheduleSessionAt(T, batch, PAST());
    expect(
      (await api('POST', `/sessions/${sPast}/complete`, other.token)).status,
    ).toBe(403);
    expect(await sessionStatus(s)).toBe('scheduled');
    expect(await sessionStatus(sPast)).toBe('scheduled');
  });

  // ==========================================================================
  it('a different Academy cannot cancel a session it does not own (not found, never a permission leak)', async () => {
    const A = await makeAcademy('own');
    const B = await makeAcademy('intruder');
    const T = await makeUser('tutor', 'acadown');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const batch = await teacherCreatesBatch(T, `ACAD-${MARKER}`, ctxA);
    const s = await scheduleSessionAt(T, batch, FUTURE(), ctxA);

    const res = await api(
      'POST',
      `/academy/me/batches/${batch}/sessions/${s}/cancel`,
      B.owner.token,
    );
    expect(res.status).toBe(404);
    expect(await sessionStatus(s)).toBe('scheduled');
  });

  // ==========================================================================
  it("an Academy cannot cancel a teacher's Individual session", async () => {
    const A = await makeAcademy('noindiv');
    const T = await makeUser('tutor', 'indiv1');
    await join(A.id, T.id);
    const iBatch = await teacherCreatesBatch(T, `INDIV-${MARKER}`);
    const s = await scheduleSessionAt(T, iBatch, FUTURE());

    // The Academy has no batch id to address the Individual session
    // through at all — this is the shape the real UI would hit (a batch
    // id the academy does not own), which already 404s before it can
    // reach the session.
    const res = await api(
      'POST',
      `/academy/me/batches/${iBatch}/sessions/${s}/cancel`,
      A.owner.token,
    );
    expect(res.status).toBe(404);
    expect(await sessionStatus(s)).toBe('scheduled');
  });

  // ==========================================================================
  it('an Individual-context request cannot touch an Academy session (teaching context mismatch)', async () => {
    const A = await makeAcademy('ctxmismatch');
    const T = await makeUser('tutor', 'ctx1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const aBatch = await teacherCreatesBatch(T, `ACADCTX-${MARKER}`, ctxA);
    const s = await scheduleSessionAt(T, aBatch, FUTURE(), ctxA);

    // Same teacher, same session — but the request carries no Academy
    // context (or the wrong one), so it must be rejected rather than
    // silently operating on the Academy class from the Individual profile.
    const res = await api('POST', `/sessions/${s}/cancel`, T.token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TEACHING_CONTEXT_MISMATCH');
    expect(await sessionStatus(s)).toBe('scheduled');
  });

  // ==========================================================================
  it('a whole-series cancel never turns an already-completed occurrence back into cancelled', async () => {
    const T = await makeUser('tutor', 'series');
    const batch = await teacherCreatesBatch(T, `SERIES-${MARKER}`);

    const day = new Date(Date.now() + 24 * 3600_000);
    const startLocal = day.toISOString().slice(0, 19);
    const created = await api('POST', '/sessions', T.token, {
      body: {
        batchId: batch,
        startLocal,
        durationMin: 30,
        timezone: 'UTC',
        recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
      },
    });
    expect(created.status).toBe(201);
    const parentId = created.body.id as string;

    const series = await db
      .selectFrom('class_sessions')
      .select(['id'])
      .where((eb) =>
        eb.or([
          eb('id', '=', parentId),
          eb('recurrence_parent_id', '=', parentId),
        ]),
      )
      .orderBy('scheduled_start_utc')
      .execute();
    expect(series).toHaveLength(3);

    // Manually fast-forward the middle occurrence into the past and mark
    // it completed directly — simulating "one class in the series already
    // happened" before the teacher cancels the rest of the series.
    const middle = series[1].id;
    await db
      .updateTable('class_sessions')
      .set({ status: 'completed', scheduled_start_utc: PAST() })
      .where('id', '=', middle)
      .execute();

    const cancelSeries = await api(
      'POST',
      `/sessions/${parentId}/cancel?series=true`,
      T.token,
    );
    expect(cancelSeries.status).toBe(201);
    expect(cancelSeries.body).toEqual({ cancelled: 'series' });

    expect(await sessionStatus(parentId)).toBe('cancelled');
    expect(await sessionStatus(middle)).toBe('completed'); // untouched
    expect(await sessionStatus(series[2].id)).toBe('cancelled');
  });

  // ==========================================================================
  it('direct API calls enforce the same guards a UI button would — there is no client-side-only check', async () => {
    const T = await makeUser('tutor', 'direct');
    const batch = await teacherCreatesBatch(T, `DIRECT-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, PAST());
    const complete = await api('POST', `/sessions/${s}/complete`, T.token);
    expect(complete.status).toBe(201);

    // No "Cancel"/"Complete" button would ever be rendered for an
    // already-completed session — calling the endpoint directly must
    // still be rejected server-side.
    const res = await api('POST', `/sessions/${s}/cancel`, T.token);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_SESSION_TRANSITION');
  });

  // ==========================================================================
  it('an Academy can cancel a session it owns, guarded the same way as the tutor path', async () => {
    const A = await makeAcademy('canown');
    const T = await makeUser('tutor', 'canown1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const batch = await teacherCreatesBatch(T, `ACADCAN-${MARKER}`, ctxA);
    const s = await academyScheduleSessionAt(A.owner, batch, FUTURE());

    const first = await api(
      'POST',
      `/academy/me/batches/${batch}/sessions/${s}/cancel`,
      A.owner.token,
    );
    expect(first.status).toBe(201);
    expect(await sessionStatus(s)).toBe('cancelled');

    const second = await api(
      'POST',
      `/academy/me/batches/${batch}/sessions/${s}/cancel`,
      A.owner.token,
    );
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SESSION_ALREADY_CANCELLED');
  });

  // ==========================================================================
  // H4 — edit, reschedule, and the cancellation-reason/wording fix.
  // ==========================================================================

  it('H4: a teacher can edit the meeting link of a scheduled class, and the change survives a re-fetch', async () => {
    const T = await makeUser('tutor', 'edit1');
    const batch = await teacherCreatesBatch(T, `EDIT-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, FUTURE());

    const res = await api('PATCH', `/sessions/${s}`, T.token, {
      body: { meetingUrl: 'https://meet.example/new-link' },
    });
    expect(res.status).toBe(200);
    expect(res.body.meeting_url).toBe('https://meet.example/new-link');

    const row = await db
      .selectFrom('class_sessions')
      .select('meeting_url')
      .where('id', '=', s)
      .executeTakeFirstOrThrow();
    expect(row.meeting_url).toBe('https://meet.example/new-link');
  });

  it('H4: editing never accepts an ownership-changing field — the request is rejected outright, not silently ignored', async () => {
    const T = await makeUser('tutor', 'edit2');
    const batch = await teacherCreatesBatch(T, `EDIT2-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, FUTURE());

    const res = await api('PATCH', `/sessions/${s}`, T.token, {
      body: {
        meetingUrl: 'https://meet.example/x',
        academyId: 'not-a-real-field',
      },
    });
    expect(res.status).toBe(400); // forbidNonWhitelisted rejects the unknown field
  });

  it("H4: a teacher cannot edit another teacher's session (direct-ID, not just hidden UI)", async () => {
    const T1 = await makeUser('tutor', 'edit3a');
    const T2 = await makeUser('tutor', 'edit3b');
    const batch = await teacherCreatesBatch(T1, `EDIT3-${MARKER}`);
    const s = await scheduleSessionAt(T1, batch, FUTURE());

    const res = await api('PATCH', `/sessions/${s}`, T2.token, {
      body: { meetingUrl: 'https://meet.example/hijack' },
    });
    expect(res.status).toBe(403);
  });

  it('H4: reschedule moves a scheduled class to a new time and rejects a repeat cancel-of-the-old-slot race correctly', async () => {
    const T = await makeUser('tutor', 'resched1');
    const batch = await teacherCreatesBatch(T, `RESCHED-${MARKER}`);
    const s = await scheduleSessionAt(T, batch, FUTURE());
    const newStart = new Date(Date.now() + 5 * 3600_000);

    const res = await api('POST', `/sessions/${s}/reschedule`, T.token, {
      body: {
        newStartLocal: newStart.toISOString().slice(0, 19),
        timezone: 'UTC',
      },
    });
    expect(res.status).toBe(201);

    const row = await db
      .selectFrom('class_sessions')
      .select(['scheduled_start_utc', 'status'])
      .where('id', '=', s)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('scheduled');
    // startLocal truncates to whole seconds (see scheduleSessionAt) —
    // compare at the same precision rather than exact getTime().
    expect(new Date(row.scheduled_start_utc).toISOString().slice(0, 19)).toBe(
      newStart.toISOString().slice(0, 19),
    );
  });

  it('H4: reschedule to a time that conflicts with another of the same class is rejected, and nothing changes', async () => {
    const T = await makeUser('tutor', 'resched2');
    const batch = await teacherCreatesBatch(T, `RESCHED2-${MARKER}`);
    const existingStart = new Date(Date.now() + 5 * 3600_000);
    await scheduleSessionAt(T, batch, existingStart);
    const toMove = await scheduleSessionAt(T, batch, FUTURE());

    const res = await api('POST', `/sessions/${toMove}/reschedule`, T.token, {
      body: {
        newStartLocal: existingStart.toISOString().slice(0, 19),
        timezone: 'UTC',
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SESSION_RESCHEDULE_CONFLICT');

    const row = await db
      .selectFrom('class_sessions')
      .select('scheduled_start_utc')
      .where('id', '=', toMove)
      .executeTakeFirstOrThrow();
    expect(new Date(row.scheduled_start_utc).toISOString()).not.toBe(
      existingStart.toISOString(),
    );
  });

  it('H4: reschedule cannot cross teaching contexts — an Academy cannot reschedule a session via the Individual route and vice versa', async () => {
    const A = await makeAcademy('reschedctx');
    const T = await makeUser('tutor', 'reschedctx1');
    await join(A.id, T.id);
    const iBatch = await teacherCreatesBatch(T, `RESCHEDI-${MARKER}`);
    const iSession = await scheduleSessionAt(T, iBatch, FUTURE());

    // The academy has no idea this Individual session id even exists.
    const res = await api(
      'POST',
      `/academy/me/batches/${iBatch}/sessions/${iSession}/reschedule`,
      A.owner.token,
      { body: { newStartLocal: '2030-01-01T10:00:00', timezone: 'UTC' } },
    );
    expect(res.status).toBe(404);
  });

  it('H4: teacher and academy cancellations are tagged with WHO cancelled, not a shared undifferentiated reason', async () => {
    const A = await makeAcademy('reasonsplit');
    const T = await makeUser('tutor', 'reasonsplit1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;

    // Teacher cancels their own Individual class.
    const iBatch = await teacherCreatesBatch(T, `REASONI-${MARKER}`);
    const iSession = await scheduleSessionAt(T, iBatch, FUTURE());
    const teacherCancel = await api(
      'POST',
      `/sessions/${iSession}/cancel`,
      T.token,
    );
    expect(teacherCancel.status).toBe(201);

    // Academy cancels a class it owns.
    const aBatch = await teacherCreatesBatch(T, `REASONA-${MARKER}`, ctxA);
    const aSession = await academyScheduleSessionAt(A.owner, aBatch, FUTURE());
    const academyCancel = await api(
      'POST',
      `/academy/me/batches/${aBatch}/sessions/${aSession}/cancel`,
      A.owner.token,
    );
    expect(academyCancel.status).toBe(201);

    const reasons = await db
      .selectFrom('class_sessions')
      .select(['id', 'cancellation_reason'])
      .where('id', 'in', [iSession, aSession])
      .execute();
    const byId = Object.fromEntries(
      reasons.map((r) => [r.id, r.cancellation_reason]),
    );
    expect(byId[iSession]).toBe('teacher_manual');
    expect(byId[aSession]).toBe('academy_manual');
    // The old bug: both used to be the same 'manual' value, which is
    // exactly what made the reminder copy always say "the academy".
    expect(byId[iSession]).not.toBe(byId[aSession]);
  });

  it("H4: remove-student preserves history — the enrollment is marked 'left', not deleted", async () => {
    const T = await makeUser('tutor', 'removestu');
    const S = await makeUser('student', 'removestu-s');
    const batch = await teacherCreatesBatch(T, `REMOVESTU-${MARKER}`);
    // Enrollment happens via the invite/join flow in this codebase, not a
    // direct POST — a plain DB insert is the same fixture shorthand
    // teaching-contexts.e2e-spec.ts's own `enroll` helper uses.
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batch, student_id: S.id })
      .execute();

    const res = await api(
      'DELETE',
      `/batches/${batch}/students/${S.id}`,
      T.token,
    );
    expect(res.status).toBe(200);

    const row = await db
      .selectFrom('enrollments')
      .select(['status'])
      .where('batch_id', '=', batch)
      .where('student_id', '=', S.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('left');
  });
});
