import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { newId } from '../../database/id';

export interface NewNotification {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  createMany(notifications: NewNotification[]) {
    if (notifications.length === 0) return Promise.resolve();

    return this.db
      .insertInto('notifications')
      .values(
        notifications.map((n) => ({
          id: newId(),
          user_id: n.userId,
          type: n.type,
          payload: JSON.stringify(n.payload),
        })),
      )
      .execute()
      .then(() => undefined);
  }

  listForUser(userId: string, limit = 50) {
    return this.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  countUnread(userId: string) {
    return this.db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.count));
  }

  markRead(userId: string, notificationId: string) {
    return this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .execute();
  }

  markAllRead(userId: string) {
    return this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .execute();
  }
}
