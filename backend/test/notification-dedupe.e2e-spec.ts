/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * Response/row bodies are untyped in a few places here; asserting on shape IS the test. */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { Kysely } from 'kysely';
import { AppModule } from '../src/app.module';
import { KYSELY_CONNECTION } from '../src/database/database.module';
import type { DB, UserRole } from '../src/database/types';
import { newId } from '../src/database/id';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

/**
 * H7 — notification dedupe, against the real DB and the real
 * NotificationsService/Repository (not mocked), proving the migration
 * 0043 partial unique index + ON CONFLICT DO NOTHING actually works as
 * SQL, not just as intended app-level logic. There's no single HTTP
 * endpoint that exercises this in isolation (notify() is called from
 * many different business flows), so this drives the service directly
 * off the real Nest DI container — the same real app, same real DB,
 * just not routed through a controller for this one internal behavior.
 */
const MARKER = `dedupe${Date.now().toString(36)}`;
jest.setTimeout(60_000);

describe('Notification dedupe (H7, e2e)', () => {
  let moduleRef: TestingModule;
  let db: Kysely<DB>;
  let notifications: NotificationsService;
  const cleanup: string[] = [];

  async function makeUser(role: UserRole) {
    const id = newId();
    await db
      .insertInto('users')
      .values({ id, phone_e164: `+91${MARKER}${id.slice(-6)}`.slice(0, 20) })
      .execute();
    await db.insertInto('user_roles').values({ user_id: id, role }).execute();
    cleanup.push(id);
    return id;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    db = moduleRef.get<Kysely<DB>>(KYSELY_CONNECTION);
    notifications = moduleRef.get(NotificationsService);
  });

  afterAll(async () => {
    if (cleanup.length) {
      await db.deleteFrom('users').where('id', 'in', cleanup).execute();
    }
    await moduleRef.close();
  });

  it('a second notify() with the same dedupeKey for the same user+type inserts nothing new', async () => {
    const userId = await makeUser('tutor');

    await notifications.notify({
      userIds: [userId],
      type: 'class_reminder',
      title: 'Class reminder',
      body: 'first',
      dedupeKey: `reminder:${MARKER}-session:upcoming`,
    });
    await notifications.notify({
      userIds: [userId],
      type: 'class_reminder',
      title: 'Class reminder',
      body: 'second attempt (should not insert)',
      dedupeKey: `reminder:${MARKER}-session:upcoming`,
    });

    const rows = await db
      .selectFrom('notifications')
      .select(['id', 'payload'])
      .where('user_id', '=', userId)
      .where('type', '=', 'class_reminder')
      .execute();
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as any).body).toBe('first'); // the second call's body never landed
  });

  it('two concurrent notify() calls with the same dedupeKey resolve to exactly one row, not a race', async () => {
    const userId = await makeUser('tutor');
    const dedupeKey = `reminder:${MARKER}-race:upcoming`;

    await Promise.all([
      notifications.notify({
        userIds: [userId],
        type: 'class_reminder',
        title: 'x',
        body: 'a',
        dedupeKey,
      }),
      notifications.notify({
        userIds: [userId],
        type: 'class_reminder',
        title: 'x',
        body: 'b',
        dedupeKey,
      }),
    ]);

    const rows = await db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', userId)
      .where('type', '=', 'class_reminder')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('a different dedupeKey (different session) is a separate notification, not deduped away', async () => {
    const userId = await makeUser('tutor');

    await notifications.notify({
      userIds: [userId],
      type: 'class_reminder',
      title: 'x',
      body: 'session A',
      dedupeKey: `reminder:${MARKER}-a:upcoming`,
    });
    await notifications.notify({
      userIds: [userId],
      type: 'class_reminder',
      title: 'x',
      body: 'session B',
      dedupeKey: `reminder:${MARKER}-b:upcoming`,
    });

    const rows = await db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', userId)
      .where('type', '=', 'class_reminder')
      .execute();
    expect(rows).toHaveLength(2);
  });

  it('omitting dedupeKey never conflicts — two calls with none both insert, unchanged from before H7', async () => {
    const userId = await makeUser('tutor');

    await notifications.notify({
      userIds: [userId],
      type: 'teacher_contact_request',
      title: 'x',
      body: 'first',
    });
    await notifications.notify({
      userIds: [userId],
      type: 'teacher_contact_request',
      title: 'x',
      body: 'second',
    });

    const rows = await db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', userId)
      .where('type', '=', 'teacher_contact_request')
      .execute();
    expect(rows).toHaveLength(2);
  });
});
