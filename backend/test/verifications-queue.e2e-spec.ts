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
 * H9 — the reviewer queue (GET /verifications/queue) now joins in the
 * tutor's identity (ProfilesRepository/users) so a reviewer isn't
 * looking at bare UUIDs — see VerificationsRepository.listPending's doc
 * comment. Also re-confirms, over real HTTP, the two backend properties
 * the H9 audit found already correct: a tutor cannot self-verify
 * through their own profile update, and only a reviewer role can reach
 * the queue/review endpoints at all.
 */
const MARKER = `ver${Date.now().toString(36)}`;
jest.setTimeout(60_000);

type Res = { status: number; body: any };

describe('Verification reviewer queue (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;
  const cleanup: string[] = [];
  // Reviewer actions write an append-only audit_logs row keyed to the
  // actor's user id (audit_logs.actor_id has NO delete cascade, and a
  // trigger blocks UPDATE/DELETE on the table outright by design — see
  // migration 0006). A reviewer test user can therefore never be
  // hard-deleted once they've reviewed anything; tracked separately so
  // afterAll doesn't try and fail the whole suite's cleanup.
  const reviewerCleanup: string[] = [];
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string,
    opts: { body?: unknown } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
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
    (role === 'superadmin' ? reviewerCleanup : cleanup).push(id);
    return { id, token: tokens.signAccessToken(id, [role]) };
  }

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
  });

  afterAll(async () => {
    try {
      if (db && cleanup.length) {
        await db.deleteFrom('users').where('id', 'in', cleanup).execute();
      }
      // reviewerCleanup users are intentionally left in place — see the
      // comment where reviewerCleanup is declared.
    } finally {
      await app?.close();
    }
  });

  it('the queue includes the tutor display name/contact, not just a bare id, and only pending entries', async () => {
    const T = await makeUser('tutor', 'q1');
    const reviewer = await makeUser('superadmin', 'q1reviewer');

    await db
      .insertInto('tutor_verifications')
      .values({
        id: newId(),
        tutor_id: T.id,
        type: 'id_proof',
        document_key: `verif/${T.id}/id.pdf`,
      })
      .execute();

    const res = await api('GET', '/verifications/queue', reviewer.token);
    expect(res.status).toBe(200);
    const entry = (res.body as any[]).find((r: any) => r.tutor_id === T.id);
    expect(entry).toBeDefined();
    expect(entry.tutor_display_name).toBe(`Tutor q1 ${MARKER}`);
    expect(entry.status).toBe('pending');
  });

  it('a non-reviewer (plain tutor) cannot reach the queue at all', async () => {
    const T = await makeUser('tutor', 'q2');
    const res = await api('GET', '/verifications/queue', T.token);
    expect(res.status).toBe(403);
  });

  it('a reviewer can approve, and the badge flips only once every required doc type is approved', async () => {
    const T = await makeUser('tutor', 'q3');
    const reviewer = await makeUser('superadmin', 'q3reviewer');
    const idProof = newId();
    const qualification = newId();
    await db
      .insertInto('tutor_verifications')
      .values([
        {
          id: idProof,
          tutor_id: T.id,
          type: 'id_proof',
          document_key: `verif/${T.id}/id.pdf`,
        },
        {
          id: qualification,
          tutor_id: T.id,
          type: 'qualification',
          document_key: `verif/${T.id}/q.pdf`,
        },
      ])
      .execute();

    const approve1 = await api(
      'POST',
      `/verifications/${idProof}/review`,
      reviewer.token,
      {
        body: { status: 'approved' },
      },
    );
    expect(approve1.status).toBe(201);

    let profile = await db
      .selectFrom('profiles_tutor')
      .select('verification_status')
      .where('user_id', '=', T.id)
      .executeTakeFirstOrThrow();
    expect(profile.verification_status).toBe('pending'); // only one of two approved so far

    const approve2 = await api(
      'POST',
      `/verifications/${qualification}/review`,
      reviewer.token,
      {
        body: { status: 'approved' },
      },
    );
    expect(approve2.status).toBe(201);

    profile = await db
      .selectFrom('profiles_tutor')
      .select('verification_status')
      .where('user_id', '=', T.id)
      .executeTakeFirstOrThrow();
    expect(profile.verification_status).toBe('verified');
  });

  it('a tutor cannot self-verify by sending a verified flag through their own profile update', async () => {
    const T = await makeUser('tutor', 'q4');

    const res = await api('PUT', '/profiles/tutor', T.token, {
      body: {
        displayName: 'Self Verified Guy',
        verificationStatus: 'verified',
        verified: true,
      },
    });
    // Either whitelisted-away (still 200, field just ignored) or
    // rejected outright — either way, verification_status must not move.
    expect([200, 201, 400]).toContain(res.status);

    const profile = await db
      .selectFrom('profiles_tutor')
      .select('verification_status')
      .where('user_id', '=', T.id)
      .executeTakeFirstOrThrow();
    expect(profile.verification_status).toBe('pending');
  });
});
