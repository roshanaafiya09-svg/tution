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
 * H8 — Account deletion regression suite.
 *
 * Covers the gaps found in the H8 audit: deletion used to tombstone only
 * the `users` row and revoke refresh sessions, leaving (a) the deleted
 * tutor's public Find-a-Teacher listing fully live and (b) their
 * already-issued access token valid for up to its remaining 15-minute
 * lifetime. Both are now fixed; this proves it end-to-end over real HTTP
 * against the real DB, not just at the repository layer.
 */

const MARKER = `del${Date.now().toString(36)}`;
jest.setTimeout(60_000);

type Res = { status: number; body: any };

describe('Account deletion (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Kysely<DB>;
  let tokens: TokensService;

  const cleanup = { users: [] as string[] };
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    token?: string,
  ): Promise<Res> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await app.inject({ method, url, headers });
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
          verification_status: 'verified',
          avatar_object_key: `avatars/${id}/photo.png`,
        })
        .execute();
    }
    cleanup.users.push(id);
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
      if (db && cleanup.users.length) {
        await db.deleteFrom('users').where('id', 'in', cleanup.users).execute();
      }
    } finally {
      await app?.close();
    }
  });

  it("TEST 1 — a deleted tutor's public listing disappears immediately, but their Academy/historical data does not", async () => {
    const tutor = await makeUser('tutor', 't1');

    const before = await api(
      'GET',
      `/marketplace/discovery/tutors/${MARKER}-t1`,
    );
    expect(before.status).toBe(200);
    expect(before.body.profile.slug).toBe(`${MARKER}-t1`);

    const del = await api('DELETE', '/account/me', tutor.token);
    expect(del.status).toBe(200);

    const after = await api(
      'GET',
      `/marketplace/discovery/tutors/${MARKER}-t1`,
    );
    expect(after.status).toBe(404);

    // The underlying profile row itself is preserved, not deleted — only
    // the PUBLIC lookup excludes it. Internal/Academy-facing lookups are
    // untouched by this fix (findTutorByUserId is deliberately not
    // filtered the same way — see ProfilesRepository's doc comment).
    const row = await db
      .selectFrom('profiles_tutor')
      .select(['slug', 'avatar_object_key'])
      .where('user_id', '=', tutor.id)
      .executeTakeFirstOrThrow();
    expect(row.slug).toBe(`${MARKER}-t1`);
    // Best-effort avatar cleanup ran.
    expect(row.avatar_object_key).toBeNull();
  });

  it("TEST 2 — a deleted account's already-issued access token is rejected immediately, not just after 15 minutes", async () => {
    const tutor = await makeUser('tutor', 't2');

    const before = await api('GET', '/account/export', tutor.token);
    expect(before.status).toBe(200);

    const del = await api('DELETE', '/account/me', tutor.token);
    expect(del.status).toBe(200);

    // Same still-unexpired JWT, now instantly rejected.
    const after = await api('GET', '/account/export', tutor.token);
    expect(after.status).toBe(401);
  });

  it('TEST 3 — a still-active account is entirely unaffected by another account being deleted', async () => {
    const tutorA = await makeUser('tutor', 't3a');
    const tutorB = await makeUser('tutor', 't3b');

    await api('DELETE', '/account/me', tutorA.token);

    const stillWorks = await api('GET', '/account/export', tutorB.token);
    expect(stillWorks.status).toBe(200);

    const stillListed = await api(
      'GET',
      `/marketplace/discovery/tutors/${MARKER}-t3b`,
    );
    expect(stillListed.status).toBe(200);
  });
});
