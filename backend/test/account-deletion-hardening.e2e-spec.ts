/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../src/database/redis.module';
import { newId } from '../src/database/id';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * H8 remaining gaps — over real HTTP, real Postgres, real Redis:
 *  - the deleted account's old access token stays rejected after the Redis
 *    cache entry is lost (users.token_version is the source of truth)
 *  - a deleted teacher disappears from public Academy pages but keeps
 *    their historical attribution inside the academy
 *  - a deleted teacher's old invite link can no longer enroll anyone
 */
jest.setTimeout(240_000);

describe('Account deletion hardening (e2e)', () => {
  let h: Harness;
  let redis: Redis;

  beforeAll(async () => {
    h = await createHarness('adh');
    redis = h.app.get<Redis>(REDIS_CONNECTION);
  });
  afterAll(async () => {
    await h?.close();
  });

  async function deleteAccount(user: Actor) {
    const res = await h.api('DELETE', '/account/me', user.token);
    expect(res.status).toBe(200);
  }

  it('an access token issued before deletion is rejected immediately — and STAYS rejected after the Redis cache is lost', async () => {
    const tutor = await h.makeUser('tutor', 'tok');
    expect((await h.api('GET', '/account/export', tutor.token)).status).toBe(
      200,
    );

    await deleteAccount(tutor);
    expect((await h.api('GET', '/account/export', tutor.token)).status).toBe(
      401,
    );

    const version = await h.db
      .selectFrom('users')
      .select(['token_version', 'deleted_at'])
      .where('id', '=', tutor.id)
      .executeTakeFirstOrThrow();
    expect(version.token_version).toBe(1);
    expect(version.deleted_at).not.toBeNull();

    // Simulate losing Redis state entirely for this user (eviction,
    // flush, failover) — the old token must not come back to life.
    await redis.del(`auth:state:${tutor.id}`);
    expect(await redis.exists(`auth:state:${tutor.id}`)).toBe(0);
    const afterLoss = await h.api('GET', '/account/export', tutor.token);
    expect(afterLoss.status).toBe(401);
    expect(afterLoss.body.code).toBe('UNAUTHENTICATED');
    // ...and the durable answer was re-cached.
    expect(JSON.parse((await redis.get(`auth:state:${tutor.id}`))!)).toEqual({
      version: 1,
      deleted: true,
    });
  });

  it('a live account is unaffected, including across a cache loss', async () => {
    const tutor = await h.makeUser('tutor', 'live');
    await redis.del(`auth:state:${tutor.id}`);
    expect((await h.api('GET', '/account/export', tutor.token)).status).toBe(
      200,
    );
    expect((await h.api('GET', '/account/export', tutor.token)).status).toBe(
      200,
    );
  });

  it('a deleted teacher is gone from Find-a-Teacher, the tutor slug page and the public Academy page — but keeps historical attribution inside the academy', async () => {
    const academy = await h.makeAcademy('pub');
    const stays = await h.makeUser('tutor', 'stays');
    const leaves = await h.makeUser('tutor', 'leaves');
    await h.join(academy.id, stays.id);
    await h.join(academy.id, leaves.id);
    const leavesBatch = await h.createBatch(leaves, { ctx: academy.ctx });
    const staysBatch = await h.createBatch(stays, { ctx: academy.ctx });
    const student = await h.makeUser('student', 'pubs');
    await h.enroll(leavesBatch, student.id);
    // A past class the leaving teacher taught — academy history.
    const pastSid = newId();
    await h.db
      .insertInto('class_sessions')
      .values({
        id: pastSid,
        batch_id: leavesBatch,
        tutor_id: leaves.id,
        scheduled_start_utc: new Date(Date.now() - 72 * 3600_000),
        duration_min: 30,
        status: 'completed',
      })
      .execute();

    const before = await h.api('GET', `/marketplace/academies/${academy.slug}`);
    expect(before.status).toBe(200);
    expect(before.body.teachers.map((t: any) => t.tutorId)).toEqual(
      expect.arrayContaining([stays.id, leaves.id]),
    );

    await deleteAccount(leaves);

    const page = await h.api('GET', `/marketplace/academies/${academy.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.teachers.map((t: any) => t.tutorId)).toEqual([stays.id]);
    expect(JSON.stringify(page.body)).not.toContain(`Tutor leaves ${h.MARKER}`);
    expect(page.body.availableBatches.map((b: any) => b.id)).toEqual([
      staysBatch,
    ]);

    expect(
      (await h.api('GET', `/marketplace/discovery/tutors/${h.MARKER}-leaves`))
        .status,
    ).toBe(404);

    // Inside the academy, the past class is still attributed to them.
    const history = await h.api(
      'GET',
      `/academy/me/sessions?from=${new Date(Date.now() - 96 * 3600_000).toISOString()}&to=${new Date().toISOString()}`,
      academy.owner.token,
    );
    expect(history.status).toBe(200);
    const past = (history.body as any[]).find((s) => s.id === pastSid);
    expect(past).toBeDefined();
    expect(past.tutorId ?? past.tutor_id).toBe(leaves.id);
  });

  it("a deleted teacher's old invite link can no longer enroll anyone; the preview says so", async () => {
    const tutor = await h.makeUser('tutor', 'inv');
    const batch = await h.createBatch(tutor);
    const created = await h.api(
      'POST',
      `/invites/batch/${batch}`,
      tutor.token,
      {
        body: {},
      },
    );
    expect(created.status).toBe(201);
    const token = created.body.token as string;

    // Works while the teacher exists (control).
    const early = await h.makeUser('student', 'early');
    expect(
      (await h.api('POST', `/invites/${token}/redeem`, early.token)).status,
    ).toBe(201);

    await deleteAccount(tutor);

    const late = await h.makeUser('student', 'late');
    const redeem = await h.api('POST', `/invites/${token}/redeem`, late.token);
    expect(redeem.status).toBe(400);
    expect(redeem.body.code).toBe('INVITE_REVOKED');
    const enrolled = await h.db
      .selectFrom('enrollments')
      .select('id')
      .where('batch_id', '=', batch)
      .where('student_id', '=', late.id)
      .executeTakeFirst();
    expect(enrolled).toBeUndefined();

    const invite = await h.db
      .selectFrom('invites')
      .select(['revoked_at', 'used_count'])
      .where('token', '=', token)
      .executeTakeFirstOrThrow();
    expect(invite.revoked_at).not.toBeNull();
    expect(invite.used_count).toBe(1); // history kept

    const preview = await h.api('GET', `/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.isRevoked).toBe(true);
  });

  it('an invite is refused even if revocation never ran, as soon as the batch teacher is deleted (defence in depth)', async () => {
    const tutor = await h.makeUser('tutor', 'inv2');
    const batch = await h.createBatch(tutor);
    const created = await h.api(
      'POST',
      `/invites/batch/${batch}`,
      tutor.token,
      {
        body: {},
      },
    );
    // Tombstone the user directly, bypassing AccountService (no revocation).
    await h.db
      .updateTable('users')
      .set({ deleted_at: new Date(), status: 'deleted' })
      .where('id', '=', tutor.id)
      .execute();
    const s = await h.makeUser('student', 'inv2s');
    const redeem = await h.api(
      'POST',
      `/invites/${created.body.token}/redeem`,
      s.token,
    );
    expect(redeem.status).toBe(400);
    expect(redeem.body.code).toBe('INVITE_REVOKED');
  });

  it('expired invites are still refused with the ordinary message', async () => {
    const tutor = await h.makeUser('tutor', 'inv3');
    const batch = await h.createBatch(tutor);
    const created = await h.api(
      'POST',
      `/invites/batch/${batch}`,
      tutor.token,
      {
        body: {},
      },
    );
    await h.db
      .updateTable('invites')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token', '=', created.body.token)
      .execute();
    const s = await h.makeUser('student', 'inv3s');
    const redeem = await h.api(
      'POST',
      `/invites/${created.body.token}/redeem`,
      s.token,
    );
    expect(redeem.status).toBe(400);
    expect(redeem.body.code).not.toBe('INVITE_REVOKED');
    expect(redeem.body.message).toMatch(/expired or is fully used/);
  });

  it("the deleted teacher's Individual data never becomes visible to an academy", async () => {
    const academy = await h.makeAcademy('priv');
    const tutor = await h.makeUser('tutor', 'priv');
    await h.join(academy.id, tutor.id);
    const individual = await h.createBatch(tutor);
    const s = await h.makeUser('student', 'privs');
    await h.enroll(individual, s.id);
    await deleteAccount(tutor);

    const batches = await h.api(
      'GET',
      '/academy/me/batches',
      academy.owner.token,
    );
    expect(JSON.stringify(batches.body)).not.toContain(individual);
    expect(
      (
        await h.api(
          'GET',
          `/academy/me/batches/${individual}`,
          academy.owner.token,
        )
      ).status,
    ).toBe(404);
  });
});
