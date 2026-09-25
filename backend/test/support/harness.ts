import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Kysely } from 'kysely';
import { AppModule } from '../../src/app.module';
import { KYSELY_CONNECTION } from '../../src/database/database.module';
import type { DB, UserRole } from '../../src/database/types';
import { newId } from '../../src/database/id';
import { TokensService } from '../../src/modules/identity/auth/tokens.service';
import {
  configureHttpApp,
  createFastifyAdapter,
} from '../../src/common/http/app-setup';

/**
 * Shared fixture for the H4–H10 remediation e2e suites: boots the REAL app
 * with the exact adapter + global pipeline production uses
 * (createFastifyAdapter/configureHttpApp, the global exception filter from
 * AppModule), talks to it over real HTTP (Fastify inject), against the real
 * dev database, with real signed JWTs. Only the rate limiter is disabled.
 * Everything a suite creates is tagged with its marker and removed in
 * `close()`.
 */
// HTTP response bodies are untyped JSON in an e2e test; asserting on their
// shape IS the test.

export type Res = { status: number; body: any; headers: Record<string, any> };

export interface Actor {
  id: string;
  token: string;
  label: string;
}

export async function createHarness(markerPrefix: string) {
  const MARKER = `${markerPrefix}${Date.now().toString(36)}`;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createFastifyAdapter(),
  );
  configureHttpApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const db = app.get<Kysely<DB>>(KYSELY_CONNECTION);
  const tokens = app.get(TokensService);
  const subjectId = (
    await db.selectFrom('subjects').select('id').executeTakeFirstOrThrow()
  ).id;
  const gradeLevelId = (
    await db.selectFrom('grade_levels').select('id').executeTakeFirstOrThrow()
  ).id;

  const cleanup = { users: [] as string[], academies: [] as string[] };
  let phoneSeq = 0;

  async function api(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token?: string,
    opts: { body?: unknown; ctx?: string } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.ctx) headers['x-teaching-context'] = opts.ctx;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.inject({
      method,
      url,
      headers,
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: unknown = null;
    try {
      body = res.body ? (JSON.parse(res.body) as unknown) : null;
    } catch {
      body = res.body;
    }
    return {
      status: res.statusCode,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: body as Res['body'],
      headers: res.headers,
    };
  }

  async function makeUser(role: UserRole, label: string): Promise<Actor> {
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
          slug: `${MARKER}-${label}`.toLowerCase(),
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
    return { id, slug, owner, ctx: `academy:${id}` };
  }

  async function join(academyId: string, tutorId: string) {
    await db
      .insertInto('academy_memberships')
      .values({ id: newId(), academy_id: academyId, tutor_id: tutorId })
      .execute();
  }

  async function createBatch(
    tutor: Actor,
    opts: {
      ctx?: string;
      feeMinor?: number;
      feePeriod?: 'monthly' | 'quarterly' | 'one_time';
      title?: string;
    } = {},
  ): Promise<string> {
    const res = await api('POST', '/batches', tutor.token, {
      ctx: opts.ctx,
      body: {
        title: opts.title ?? `Batch ${MARKER}-${newId().slice(-6)}`,
        subjectId,
        gradeLevelId,
        capacity: 30,
        feeMinor: opts.feeMinor ?? 100000,
        ...(opts.feePeriod ? { feePeriod: opts.feePeriod } : {}),
      },
    });
    if (res.status !== 201) {
      throw new Error(`createBatch ${res.status} ${JSON.stringify(res.body)}`);
    }
    return (res.body as { id: string }).id;
  }

  async function enroll(batchId: string, studentId: string) {
    await db
      .insertInto('enrollments')
      .values({ id: newId(), batch_id: batchId, student_id: studentId })
      .execute();
  }

  async function linkParent(parentId: string, studentId: string) {
    await db
      .insertInto('parent_child_links')
      .values({
        id: newId(),
        parent_id: parentId,
        student_id: studentId,
        status: 'active',
      })
      .execute();
  }

  /** A session at an exact UTC instant (timezone 'UTC' makes startLocal an
   *  identity conversion). */
  async function scheduleAt(
    tutor: Actor,
    batchId: string,
    at: Date,
    opts: { ctx?: string; durationMin?: number; recurrenceRule?: string } = {},
  ): Promise<string> {
    const res = await api('POST', '/sessions', tutor.token, {
      ctx: opts.ctx,
      body: {
        batchId,
        startLocal: at.toISOString().slice(0, 19),
        durationMin: opts.durationMin ?? 30,
        timezone: 'UTC',
        ...(opts.recurrenceRule ? { recurrenceRule: opts.recurrenceRule } : {}),
      },
    });
    if (res.status !== 201) {
      throw new Error(`scheduleAt ${res.status} ${JSON.stringify(res.body)}`);
    }
    return (res.body as { id: string }).id;
  }

  /** Notifications a user has, optionally of one type (newest first). */
  async function notificationsFor(userId: string, type?: string) {
    let q = db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId);
    if (type) q = q.where('type', '=', type);
    return q.orderBy('created_at', 'desc').execute();
  }

  async function close() {
    try {
      if (cleanup.users.length) {
        // attendance.marked_by has no ON DELETE action.
        await db
          .deleteFrom('attendance')
          .where('marked_by', 'in', cleanup.users)
          .execute();
        await db.deleteFrom('users').where('id', 'in', cleanup.users).execute();
      }
      if (cleanup.academies.length) {
        await db
          .deleteFrom('academies')
          .where('id', 'in', cleanup.academies)
          .execute();
      }
    } finally {
      await app.close();
    }
  }

  return {
    MARKER,
    app,
    db,
    tokens,
    subjectId,
    gradeLevelId,
    api,
    makeUser,
    makeAcademy,
    join,
    createBatch,
    enroll,
    linkParent,
    scheduleAt,
    notificationsFor,
    close,
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
