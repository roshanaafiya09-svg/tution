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
 * H11 — Archived batch cleanup, proven over real HTTP against the real
 * database. Before this fix, `archive()` was a bare status flip: future
 * sessions stayed 'scheduled' forever (still reminded, still bookable),
 * and nothing stopped scheduling a brand-new session on an archived
 * batch. Now archiving atomically cancels every future scheduled
 * session (reason 'batch_archived') and blocks new ones, while leaving
 * historical (completed) sessions, attendance, and ownership untouched.
 */

const MARKER = `arch${Date.now().toString(36)}`;
jest.setTimeout(120_000);

type Res = { status: number; body: any };

describe('Archived batch cleanup (e2e)', () => {
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
    if (role === 'student') {
      await db
        .insertInto('profiles_student')
        .values({ user_id: id, display_name: `Student ${label} ${MARKER}` })
        .execute();
    }
    cleanup.users.push(id);
    return { id, token: tokens.signAccessToken(id, [role]) };
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

  async function scheduleSessionAt(
    tutor: { token: string },
    batchId: string,
    at: Date,
    ctx?: string,
  ) {
    const res = await api('POST', '/sessions', tutor.token, {
      ctx,
      body: {
        batchId,
        startLocal: at.toISOString().slice(0, 19),
        durationMin: 30,
        timezone: 'UTC',
      },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const FUTURE = () => new Date(Date.now() + 3600_000);
  const PAST = () => new Date(Date.now() - 3600_000);

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
          // attendance.marked_by has no ON DELETE cascade — clear it first.
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

  it('archiving cancels every future scheduled session with reason batch_archived, but leaves a completed session alone', async () => {
    const T = await makeUser('tutor', 'cascade1');
    const batch = await teacherCreatesBatch(T, `CASCADE-${MARKER}`);
    const future1 = await scheduleSessionAt(T, batch, FUTURE());
    const future2 = await scheduleSessionAt(
      T,
      batch,
      new Date(Date.now() + 7200_000),
    );
    const past = await scheduleSessionAt(T, batch, PAST());
    const completeRes = await api(
      'POST',
      `/sessions/${past}/complete`,
      T.token,
    );
    expect(completeRes.status).toBe(201);

    const archiveRes = await api('POST', `/batches/${batch}/archive`, T.token);
    expect(archiveRes.status).toBe(201);

    const rows = await db
      .selectFrom('class_sessions')
      .select(['id', 'status', 'cancellation_reason'])
      .where('id', 'in', [future1, future2, past])
      .execute();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[future1]).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'batch_archived',
    });
    expect(byId[future2]).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'batch_archived',
    });
    // Historical/completed session is untouched by the cascade.
    expect(byId[past]).toMatchObject({
      status: 'completed',
      cancellation_reason: null,
    });
  });

  it('scheduling a new session on an archived batch is rejected with BATCH_ARCHIVED, not silently accepted', async () => {
    const T = await makeUser('tutor', 'noNewSessions');
    const batch = await teacherCreatesBatch(T, `NONEW-${MARKER}`);
    await api('POST', `/batches/${batch}/archive`, T.token);

    const res = await api('POST', `/sessions`, T.token, {
      body: {
        batchId: batch,
        startLocal: FUTURE().toISOString().slice(0, 19),
        durationMin: 30,
        timezone: 'UTC',
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BATCH_ARCHIVED');
  });

  it('archiving an Academy batch cancels its future sessions but never touches academy_id ownership', async () => {
    const A = await makeAcademy('archown');
    const T = await makeUser('tutor', 'archown1');
    await join(A.id, T.id);
    const ctxA = `academy:${A.id}`;
    const batch = await teacherCreatesBatch(T, `ACADARCH-${MARKER}`, ctxA);
    const future = await scheduleSessionAt(T, batch, FUTURE(), ctxA);

    const res = await api(
      'POST',
      `/academy/me/batches/${batch}/archive`,
      A.owner.token,
    );
    expect(res.status).toBe(201);

    const batchRow = await db
      .selectFrom('batches')
      .select(['status', 'academy_id'])
      .where('id', '=', batch)
      .executeTakeFirstOrThrow();
    expect(batchRow.status).toBe('archived');
    expect(batchRow.academy_id).toBe(A.id); // unchanged

    const sessionRow = await db
      .selectFrom('class_sessions')
      .select(['status', 'cancellation_reason'])
      .where('id', '=', future)
      .executeTakeFirstOrThrow();
    expect(sessionRow.status).toBe('cancelled');
    expect(sessionRow.cancellation_reason).toBe('batch_archived');
  });

  it('archiving an Individual batch never sets an academy_id', async () => {
    const T = await makeUser('tutor', 'indivarch');
    const batch = await teacherCreatesBatch(T, `INDIVARCH-${MARKER}`);

    await api('POST', `/batches/${batch}/archive`, T.token);

    const batchRow = await db
      .selectFrom('batches')
      .select(['status', 'academy_id'])
      .where('id', '=', batch)
      .executeTakeFirstOrThrow();
    expect(batchRow.status).toBe('archived');
    expect(batchRow.academy_id).toBeNull();
  });

  it('re-archiving an already-archived batch is a safe no-op, not a repeated cancellation sweep', async () => {
    const T = await makeUser('tutor', 'reArchive');
    const batch = await teacherCreatesBatch(T, `REARCH-${MARKER}`);
    const first = await api('POST', `/batches/${batch}/archive`, T.token);
    expect(first.status).toBe(201);

    const second = await api('POST', `/batches/${batch}/archive`, T.token);
    expect(second.status).toBe(201); // tolerant, not an error — matches archive's pre-existing idempotent shape

    const batchRow = await db
      .selectFrom('batches')
      .select('status')
      .where('id', '=', batch)
      .executeTakeFirstOrThrow();
    expect(batchRow.status).toBe('archived');
  });

  it('historical attendance survives archiving — marking attendance on a completed pre-archive session still works and its row is untouched', async () => {
    const T = await makeUser('tutor', 'attendHist');
    const S = await makeUser('student', 'attendHist-s');
    const batch = await teacherCreatesBatch(T, `ATTHIST-${MARKER}`);
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batch, student_id: S.id })
      .execute();
    const past = await scheduleSessionAt(T, batch, PAST());
    await api('POST', `/sessions/${past}/complete`, T.token);
    const mark = await api(
      'POST',
      `/attendance/session/${past}/mark`,
      T.token,
      { body: { studentId: S.id, status: 'present' } },
    );
    expect(mark.status).toBe(201);

    await api('POST', `/batches/${batch}/archive`, T.token);

    const attendanceRow = await db
      .selectFrom('attendance')
      .select('status')
      .where('session_id', '=', past)
      .where('student_id', '=', S.id)
      .executeTakeFirstOrThrow();
    expect(attendanceRow.status).toBe('present');
  });
});
