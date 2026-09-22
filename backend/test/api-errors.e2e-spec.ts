/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Kysely } from 'kysely';
import { AppModule } from '../src/app.module';
import { KYSELY_CONNECTION } from '../src/database/database.module';
import type { DB, UserRole } from '../src/database/types';
import { newId } from '../src/database/id';
import { TokensService } from '../src/modules/identity/auth/tokens.service';
import {
  configureHttpApp,
  createFastifyAdapter,
} from '../src/common/http/app-setup';

/**
 * The standard error envelope, proven over real HTTP.
 *
 * Boots the real application (real guards, filter, ValidationPipe, request-id
 * hook, throttler) against the dev database and asserts on what a browser
 * would actually receive: `{ statusCode, code, message, requestId }` plus an
 * `X-Request-Id` header that matches the body — for 401, 403, 404, 400, 429
 * and the Individual/Academy context errors the web client must be able to
 * tell apart.
 */
const MARKER = `err${Date.now().toString(36)}`;
jest.setTimeout(120_000);

type Res = { status: number; body: any; headers: Record<string, any> };

describe('API error envelope (e2e over HTTP)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  const cleanup = { users: [] as string[], academies: [] as string[] };
  let seq = 0;

  async function call(
    method: 'GET' | 'POST',
    url: string,
    opts: {
      token?: string;
      ctx?: string;
      body?: unknown;
      rawBody?: string;
      requestId?: string;
    } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.ctx) headers['x-teaching-context'] = opts.ctx;
    if (opts.requestId) headers['x-request-id'] = opts.requestId;
    let payload: string | undefined;
    if (opts.rawBody !== undefined) {
      headers['content-type'] = 'application/json';
      payload = opts.rawBody;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(opts.body);
    }
    const res = await app.inject({ method, url, headers, payload });
    let body: any = null;
    try {
      body = res.body ? JSON.parse(res.body) : null;
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body, headers: res.headers };
  }

  async function makeUser(role: UserRole, label: string) {
    const id = newId();
    seq += 1;
    await db
      .insertInto('users')
      .values({
        id,
        phone_e164: `+91${MARKER}${String(seq).padStart(3, '0')}`.slice(0, 20),
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
    return { id, token: tokens.signAccessToken(id, [role]) };
  }

  let tutor: { id: string; token: string };
  let student: { id: string; token: string };
  let academyId: string;
  let subjectId: string;
  let gradeLevelId: string;
  let individualBatchId: string;

  beforeAll(async () => {
    // NOTE: the throttler is deliberately NOT overridden — the 429 case below
    // exercises the real guard. Every other case stays far under the limit.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
    );
    configureHttpApp(app);
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

    tutor = await makeUser('tutor', 'tutor');
    student = await makeUser('student', 'student');

    // An academy this tutor IS an active member of (for the mismatch case).
    const owner = await makeUser('academy', 'owner');
    academyId = newId();
    await db
      .insertInto('academies')
      .values({
        id: academyId,
        name: `Academy ${MARKER}`,
        slug: `${MARKER}-academy`,
        owner_user_id: owner.id,
      })
      .execute();
    cleanup.academies.push(academyId);
    await db
      .insertInto('academy_memberships')
      .values({ id: newId(), academy_id: academyId, tutor_id: tutor.id })
      .execute();

    const created = await call('POST', '/batches', {
      token: tutor.token,
      body: {
        title: `Individual ${MARKER}`,
        subjectId,
        gradeLevelId,
        capacity: 10,
        feeMinor: 1000,
      },
    });
    expect(created.status).toBe(201);
    individualBatchId = created.body.id;
  });

  afterAll(async () => {
    try {
      for (const id of cleanup.users) {
        await db.deleteFrom('users').where('id', '=', id).execute();
      }
      for (const id of cleanup.academies) {
        await db.deleteFrom('academies').where('id', '=', id).execute();
      }
    } finally {
      await app.close();
    }
  });

  /** Every failure, whatever its status, must be a well-formed envelope
   *  whose requestId equals the X-Request-Id response header. */
  function expectEnvelope(res: Res, status: number, code: string) {
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({
      statusCode: status,
      code,
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  }

  it('401 — no token: UNAUTHENTICATED with safe copy', async () => {
    const res = await call('GET', '/batches/me');
    expectEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(res.body.message).toBe('Your session has expired. Please sign in again.');
  });

  it('401 — garbage bearer token', async () => {
    const res = await call('GET', '/batches/me', { token: 'not.a.jwt' });
    expectEnvelope(res, 401, 'UNAUTHENTICATED');
  });

  it('403 — a student calling a tutor endpoint: FORBIDDEN, not an empty list', async () => {
    const res = await call('GET', '/batches/me', { token: student.token });
    expectEnvelope(res, 403, 'FORBIDDEN');
  });

  it('404 — unknown route', async () => {
    const res = await call('GET', '/definitely/not/a/route', { token: tutor.token });
    expectEnvelope(res, 404, 'NOT_FOUND');
  });

  it('404 — a real route, a batch that does not exist (specific message kept)', async () => {
    const res = await call('GET', `/batches/${newId()}`, { token: tutor.token });
    expectEnvelope(res, 404, 'NOT_FOUND');
    expect(res.body.message).toBe('Batch not found');
  });

  it('400 — validation failure is VALIDATION_FAILED with per-field details', async () => {
    const res = await call('POST', '/batches', {
      token: tutor.token,
      body: { title: '', capacity: -3, unexpected: true },
    });
    expectEnvelope(res, 400, 'VALIDATION_FAILED');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(typeof res.body.message).toBe('string');
  });

  it('400 — malformed JSON body still produces the envelope', async () => {
    const res = await call('POST', '/batches', {
      token: tutor.token,
      rawBody: '{"title": ',
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: expect.any(String) });
    expect(res.body.message).not.toMatch(/JSON at position|Unexpected token/i);
  });

  describe('request ids', () => {
    it('echoes a client-supplied id so a browser failure can be traced in the logs', async () => {
      const id = `web-${newId()}`;
      const res = await call('GET', '/batches/me', { requestId: id });
      expect(res.status).toBe(401);
      expect(res.body.requestId).toBe(id);
      expect(res.headers['x-request-id']).toBe(id);
    });

    it('sets X-Request-Id on successful responses too', async () => {
      const res = await call('GET', '/batches/me', { token: tutor.token });
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('replaces an unsafe client-supplied id with a generated one', async () => {
      const res = await call('GET', '/batches/me', { requestId: 'bad id with spaces!!' });
      expect(res.body.requestId).not.toBe('bad id with spaces!!');
      expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Individual / Academy isolation errors stay visible and machine-readable', () => {
    it('a malformed context header → 400 TEACHING_CONTEXT_INVALID', async () => {
      const res = await call('GET', '/batches/me', { token: tutor.token, ctx: 'academy:nope' });
      expectEnvelope(res, 400, 'TEACHING_CONTEXT_INVALID');
    });

    it('an academy context the teacher is NOT a member of → 403 TEACHING_CONTEXT_FORBIDDEN', async () => {
      const res = await call('GET', '/batches/me', { token: tutor.token, ctx: `academy:${newId()}` });
      expectEnvelope(res, 403, 'TEACHING_CONTEXT_FORBIDDEN');
      expect(res.body.message).toMatch(/active member/);
    });

    it('an Individual batch requested under the Academy context → 403 TEACHING_CONTEXT_MISMATCH', async () => {
      const res = await call('GET', `/batches/${individualBatchId}/students`, {
        token: tutor.token,
        ctx: `academy:${academyId}`,
      });
      expectEnvelope(res, 403, 'TEACHING_CONTEXT_MISMATCH');
      expect(res.body.message).toMatch(/Individual profile/);
    });

    it('the same request in the right context succeeds — the error is about context, not access', async () => {
      const res = await call('GET', `/batches/${individualBatchId}/students`, {
        token: tutor.token,
        ctx: 'individual',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // Keep last: exhausts the real global throttle for this test process's IP.
  it('429 — the real throttler answers with RATE_LIMITED and safe copy', async () => {
    let limited: Res | null = null;
    for (let i = 0; i < 320 && !limited; i++) {
      const res = await call('GET', '/batches/me'); // global guard runs before auth (and /health is throttle-exempt)
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expectEnvelope(limited as Res, 429, 'RATE_LIMITED');
    expect((limited as Res).body.message).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });
});
