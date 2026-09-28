/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { PUSH_PROVIDER } from '../src/modules/notifications/push/push-provider.interface';
import type {
  PushMessage,
  PushProvider,
} from '../src/modules/notifications/push/push-provider.interface';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Push recipients + device-token API — real HTTP, real Postgres, real JWTs,
 * real NotificationsService/Repository. Only the outbound `PushProvider.send`
 * is spied on (no Firebase call), so the assertion is precisely:
 *
 *   the users handed to FCM  ==  the users a notification row was written for
 *
 * and never anyone else (other student, removed student, deleted account,
 * departed teacher, the other Academy).
 *
 * This proves recipient selection. It does NOT prove device delivery — that
 * needs a real FCM token from a real Android device.
 */
jest.setTimeout(300_000);

const CANCELLED = 'class_cancelled';
const CANCELLED_TEACHER = 'class_cancelled_by_academy';
const HOLIDAY = 'academy_holiday';

describe('FCM push recipients + device-token API (e2e)', () => {
  let h: Harness;
  let send: jest.SpyInstance<Promise<void>, [PushMessage[]]>;
  let T: Actor; // individual tutor
  let sA: Actor;
  let sB: Actor;
  let batchA: string;
  let batchB: string;

  const token = (label: string) => `e2e-${h.MARKER}-${label}-`.padEnd(48, 'x');
  const register = (u: Actor, t: string, body: object = {}) =>
    h.api('POST', '/notifications/device-tokens', u.token, {
      body: { token: t, platform: 'android', ...body },
    });
  const unregister = (u: Actor, t: string) =>
    h.api('POST', '/notifications/device-tokens/unregister', u.token, {
      body: { token: t },
    });
  const owners = async (t: string) =>
    (
      await h.db
        .selectFrom('device_tokens')
        .select('user_id')
        .where('token', '=', t)
        .execute()
    ).map((r) => r.user_id);

  const pushedTo = () =>
    send.mock.calls.flatMap((c) => c[0].map((m) => m.userId));
  const rowsFor = async (u: Actor, type: string) =>
    (await h.notificationsFor(u.id, type)).length;
  const settle = () => new Promise((r) => setTimeout(r, 1500));

  const future = (days: number) => new Date(Date.now() + days * 86400_000);
  const cancelAsTutor = async (batchId: string, days: number) => {
    const sid = await h.scheduleAt(T, batchId, future(days));
    await settle(); // let the "new class scheduled" notice go out first…
    send.mockClear(); // …so what follows is ONLY the cancellation's push
    const res = await h.api('POST', `/sessions/${sid}/cancel`, T.token);
    await settle();
    return { sid, res };
  };

  beforeAll(async () => {
    h = await createHarness('fp');
    const provider = h.app.get<PushProvider>(PUSH_PROVIDER, { strict: false });
    send = jest.spyOn(provider, 'send').mockResolvedValue(undefined);
    T = await h.makeUser('tutor', 'tutor');
    sA = await h.makeUser('student', 'a');
    sB = await h.makeUser('student', 'b');
    batchA = await h.createBatch(T);
    batchB = await h.createBatch(T);
    await h.enroll(batchA, sA.id);
    await h.enroll(batchB, sB.id);
  });
  afterAll(async () => {
    send?.mockRestore();
    await h?.close();
  });
  beforeEach(() => send.mockClear());

  describe('token registration API', () => {
    it('requires authentication', async () => {
      const res = await h.api(
        'POST',
        '/notifications/device-tokens',
        undefined,
        {
          body: { token: token('anon') },
        },
      );
      expect(res.status).toBe(401);
      expect((await owners(token('anon'))).length).toBe(0);
    });

    it('stores the token under the JWT user, once (upsert), and refreshes last_seen_at', async () => {
      const t = token('upsert');
      expect((await register(sA, t)).status).toBe(201);
      const first = await h.db
        .selectFrom('device_tokens')
        .select('last_seen_at')
        .where('token', '=', t)
        .executeTakeFirstOrThrow();
      await new Promise((r) => setTimeout(r, 30));
      expect((await register(sA, t)).status).toBe(201);
      const rows = await h.db
        .selectFrom('device_tokens')
        .selectAll()
        .where('token', '=', t)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(sA.id);
      expect(rows[0].last_seen_at.getTime()).toBeGreaterThan(
        first.last_seen_at.getTime(),
      );
    });

    it('a client-supplied userId is rejected — the owner is only ever the JWT user', async () => {
      const t = token('spoof');
      const res = await register(sB, t, { userId: sA.id, user_id: sA.id });
      expect(res.status).toBe(400);
      expect(await owners(t)).toEqual([]);
    });

    it('validates the token format', async () => {
      expect((await register(sA, 'short')).status).toBe(400);
      expect((await register(sA, token('p'), { platform: 'web' })).status).toBe(
        400,
      );
    });

    it('token refresh: the NEW token is registered and both tokens are kept until Firebase invalidates the old one', async () => {
      const oldT = token('old');
      const newT = token('new');
      await register(sA, oldT);
      await register(sA, newT); // what onTokenRefresh does
      expect(await owners(newT)).toEqual([sA.id]);
      expect(await owners(oldT)).toEqual([sA.id]);
      // ...the old one is then removed by stale-token cleanup (see the
      // provider spec: registration-token-not-registered => deleted).
    });

    it('multiple devices per student are supported', async () => {
      const d1 = token('dev1');
      const d2 = token('dev2');
      await register(sB, d1);
      await register(sB, d2);
      expect(await owners(d1)).toEqual([sB.id]);
      expect(await owners(d2)).toEqual([sB.id]);
    });

    it('sign-out detaches only the caller’s OWN row — another user cannot remove it', async () => {
      const t = token('signout');
      await register(sA, t);
      expect((await unregister(sB, t)).status).toBe(200); // not an error…
      expect(await owners(t)).toEqual([sA.id]); // …but removes nothing
      expect((await unregister(sA, t)).status).toBe(200);
      expect(await owners(t)).toEqual([]);
      const anon = await h.api(
        'POST',
        '/notifications/device-tokens/unregister',
        undefined,
        { body: { token: t } },
      );
      expect(anon.status).toBe(401);
    });

    it('a device handed to a different user is reassigned to them (shared phone)', async () => {
      const t = token('shared');
      await register(sA, t);
      await register(sB, t);
      expect(await owners(t)).toEqual([sB.id]);
    });
  });

  describe('individual class cancellation', () => {
    it('pushes to Student A only — and exactly the user the notification row was written for', async () => {
      const { sid, res } = await cancelAsTutor(batchA, 3);
      expect(res.status).toBe(201);
      expect(await rowsFor(sA, CANCELLED)).toBe(1);
      expect(await rowsFor(sB, CANCELLED)).toBe(0);
      expect(pushedTo()).toContain(sA.id);
      expect(pushedTo()).not.toContain(sB.id);
      expect(pushedTo()).not.toContain(T.id);
      // one push per recipient — no duplicate send for the same event
      expect(pushedTo().filter((id) => id === sA.id)).toHaveLength(
        await rowsFor(sA, CANCELLED),
      );
      // repeating the cancel is rejected and sends nothing
      send.mockClear();
      const again = await h.api('POST', `/sessions/${sid}/cancel`, T.token);
      await settle();
      expect(again.status).toBe(409);
      expect(pushedTo()).toEqual([]);
      expect(await rowsFor(sA, CANCELLED)).toBe(1);
    });

    it('a removed student gets no row and no push for later events; others still do', async () => {
      const removed = await h.makeUser('student', 'removed');
      await h.enroll(batchA, removed.id);
      const res = await h.api(
        'DELETE',
        `/batches/${batchA}/students/${removed.id}`,
        T.token,
      );
      expect(res.status).toBe(200);
      send.mockClear();
      await cancelAsTutor(batchA, 4);
      expect(await rowsFor(removed, CANCELLED)).toBe(0);
      expect(pushedTo()).not.toContain(removed.id);
      expect(pushedTo()).toContain(sA.id);
    });

    it('a deleted account gets no row and no push; the remaining student still does', async () => {
      const doomed = await h.makeUser('student', 'doomed');
      await h.enroll(batchB, doomed.id);
      expect((await h.api('DELETE', '/account/me', doomed.token)).status).toBe(
        200,
      );
      send.mockClear();
      await cancelAsTutor(batchB, 5);
      expect(await rowsFor(doomed, CANCELLED)).toBe(0);
      expect(pushedTo()).not.toContain(doomed.id);
      expect(pushedTo()).toContain(sB.id);
    });
  });

  describe('Academy events', () => {
    it('departed teacher gets no Academy push; the Academy-B user is untouched', async () => {
      const A = await h.makeAcademy('a');
      const B = await h.makeAcademy('b');
      const active = await h.makeUser('tutor', 'active');
      const leaver = await h.makeUser('tutor', 'leaver');
      const bTutor = await h.makeUser('tutor', 'btutor');
      await h.join(A.id, active.id);
      await h.join(A.id, leaver.id);
      await h.join(B.id, bTutor.id);
      const activeBatch = await h.createBatch(active, { ctx: A.ctx });
      const leaverBatch = await h.createBatch(leaver, { ctx: A.ctx });
      const bBatch = await h.createBatch(bTutor, { ctx: B.ctx });
      const stuA = await h.makeUser('student', 'stua');
      const stuB = await h.makeUser('student', 'stub');
      await h.enroll(activeBatch, stuA.id);
      await h.enroll(bBatch, stuB.id);

      const academySession = async (
        acad: typeof A,
        batchId: string,
        days: number,
      ) => {
        const res = await h.api(
          'POST',
          `/academy/me/batches/${batchId}/sessions`,
          acad.owner.token,
          {
            body: {
              batchId,
              startLocal: future(days).toISOString().slice(0, 19),
              durationMin: 30,
              timezone: 'UTC',
            },
          },
        );
        expect(res.status).toBe(201);
        return res.body.id as string;
      };

      // Academy A cancels a class of the ACTIVE teacher, with student stuA in it.
      const sid = await academySession(A, activeBatch, 3);
      send.mockClear();
      const cancel = await h.api(
        'POST',
        `/academy/me/batches/${activeBatch}/sessions/${sid}/cancel`,
        A.owner.token,
      );
      expect(cancel.status).toBe(201);
      await settle();
      expect(await rowsFor(stuA, CANCELLED)).toBe(1);
      expect(await rowsFor(active, CANCELLED_TEACHER)).toBe(1);
      expect(pushedTo()).toEqual(expect.arrayContaining([stuA.id, active.id]));
      // Academy B people and the other Academy A teacher are NOT in the push list.
      expect(pushedTo()).not.toContain(stuB.id);
      expect(pushedTo()).not.toContain(bTutor.id);
      expect(pushedTo()).not.toContain(leaver.id);

      // The leaver leaves through the real endpoint, then Academy A raises a
      // new event that touches both teachers' batches.
      expect(
        (
          await h.api(
            'POST',
            `/marketplace/academies/${A.slug}/leave`,
            leaver.token,
          )
        ).status,
      ).toBe(201);
      send.mockClear();
      const holiday = await h.api(
        'POST',
        '/academy/me/holidays',
        A.owner.token,
        {
          body: {
            name: `Holiday ${h.MARKER}`,
            startDate: future(6).toISOString().slice(0, 10),
            scope: 'batches',
            batchIds: [activeBatch, leaverBatch],
          },
        },
      );
      expect(holiday.status).toBe(201);
      await settle();
      expect(await rowsFor(active, HOLIDAY)).toBe(1); // control: still-active teacher
      expect(await rowsFor(leaver, HOLIDAY)).toBe(0);
      expect(pushedTo()).toContain(active.id);
      expect(pushedTo()).not.toContain(leaver.id);
      expect(pushedTo()).not.toContain(stuB.id);
      expect(pushedTo()).not.toContain(bTutor.id);

      // Academy B's own event reaches B's people and nobody from Academy A.
      send.mockClear();
      const sidB = await academySession(B, bBatch, 3);
      await h.api(
        'POST',
        `/academy/me/batches/${bBatch}/sessions/${sidB}/cancel`,
        B.owner.token,
      );
      await settle();
      expect(pushedTo()).toContain(stuB.id);
      expect(pushedTo()).not.toContain(stuA.id);
      expect(pushedTo()).not.toContain(active.id);
    });
  });
});
