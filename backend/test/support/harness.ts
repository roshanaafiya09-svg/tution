import 'dotenv/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { Kysely } from 'kysely';
import { AppModule } from '../../src/app.module';
import { KYSELY_CONNECTION } from '../../src/database/database.module';
import type { DB, UserRole } from '../../src/database/types';
import { newId } from '../../src/database/id';
import { TokensService } from '../../src/modules/identity/auth/tokens.service';
import {
  configureHttpApp,
  createFastifyAdapter,
  registerJsonBodyParserWithRaw,
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

export interface HarnessOptions {
  /** Swap providers (e.g. PAYMENTS_PROVIDER for a controllable fake). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createHarness(
  markerPrefix: string,
  options: HarnessOptions = {},
) {
  const MARKER = `${markerPrefix}${Date.now().toString(36)}`;
  // AppModule registers ThrottlerGuard via `{ provide: APP_GUARD, useClass:
  // ThrottlerGuard }`. Nest's DependenciesScanner gives every APP_GUARD /
  // APP_FILTER / APP_PIPE / APP_INTERCEPTOR provider a freshly randomised
  // internal token (`${APP_GUARD} (UUID: <random>)`) at scan time specifically
  // so several modules can each register one without colliding — which also
  // means NEITHER `.overrideGuard(ThrottlerGuard)` NOR
  // `.overrideProvider(APP_GUARD)` can ever reach it from a testing module:
  // there is no stable token late-bound code can target. (Verified against
  // @nestjs/core 11.1.28's scanner.js — confirmed empirically here too: both
  // were tried and the real ThrottlerGuard instance kept being the one Nest
  // actually applied.) This is exactly why every "the rate limiter is
  // disabled here" e2e suite was silently still throttled — masked, until
  // now, by the default limit being generous enough not to trip.
  //
  // What IS a normal, stably-tokened provider is `ThrottlerStorage` (a
  // plain Symbol export) — the real ThrottlerGuard reads it on every request
  // to decide `isBlocked`. Overriding it with a stub that always reports
  // "not blocked" genuinely disables throttling for the suite while still
  // running the real guard code, which is both the only mechanism that
  // actually works here and closer to reality than trying to swap the guard.
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    });
  if (options.override) builder = options.override(builder);
  const moduleRef = await builder.compile();
  const adapter = createFastifyAdapter();
  registerJsonBodyParserWithRaw(adapter);
  const app = moduleRef.createNestApplication<NestFastifyApplication>(adapter, {
    bodyParser: false,
  });
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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    token?: string,
    opts: {
      body?: unknown;
      ctx?: string;
      headers?: Record<string, string>;
      rawBody?: string;
    } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.ctx) headers['x-teaching-context'] = opts.ctx;
    if (opts.headers) Object.assign(headers, opts.headers);
    if (opts.body !== undefined || opts.rawBody !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const res = await app.inject({
      method,
      url,
      headers,
      payload:
        opts.rawBody !== undefined
          ? opts.rawBody
          : opts.body === undefined
            ? undefined
            : JSON.stringify(opts.body),
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
        // No real length constraint on this column (test data, never
        // validated as real E.164) — the old 20-char cap silently truncated
        // the distinguishing sequence digits off the end for any marker
        // prefix longer than ~14 characters, colliding two different users
        // onto the same phone number (found via a genuine collision in
        // internal-jobs.e2e-spec.ts's 'intjobs' marker). Widened with
        // comfortable headroom instead of removing the cap outright.
        phone_e164: `+91${MARKER}${String(phoneSeq).padStart(3, '0')}`.slice(
          0,
          40,
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
        // Money rows reference users without ON DELETE CASCADE. Refunds and
        // events hang off payments; payouts are paid to a user.
        await db
          .deleteFrom('payments')
          .where('payer_id', 'in', cleanup.users)
          .execute();
        await db
          .deleteFrom('payouts')
          .where('tutor_id', 'in', cleanup.users)
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
