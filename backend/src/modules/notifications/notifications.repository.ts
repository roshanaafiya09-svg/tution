import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { newId } from '../../database/id';

export interface NewNotification {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  /** H7: opt-in DB-backed dedupe (see migration 0043's doc comment).
   *  Omitted by most callers, who rely on the app-level checks they
   *  already use before calling notify(); RemindersService sets it so a
   *  duplicate insert is a safe no-op via ON CONFLICT rather than only
   *  a read-then-write race window. */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** Inserts the rows and returns the user ids a row was actually written
   *  for — a dedupe-key conflict writes nothing for that user, and the
   *  caller must not push/WhatsApp them either (see NotificationsService.
   *  notify), or the "deduped" notification would still reach their phone. */
  async createMany(notifications: NewNotification[]): Promise<string[]> {
    if (notifications.length === 0) return [];

    // Recipient eligibility, enforced at the one choke point every
    // notification goes through: a deleted (or otherwise no-longer-live)
    // account must not receive anything new, whichever module raised the
    // event. Rows already written stay — this only gates NEW ones.
    const eligible = await this.filterEligibleRecipients(
      notifications.map((n) => n.userId),
    );
    notifications = notifications.filter((n) => eligible.has(n.userId));
    if (notifications.length === 0) return [];

    const rows = await this.db
      .insertInto('notifications')
      .values(
        notifications.map((n) => ({
          id: newId(),
          user_id: n.userId,
          type: n.type,
          payload: JSON.stringify(n.payload),
          dedupe_key: n.dedupeKey ?? null,
        })),
      )
      .onConflict((oc) =>
        // Must match the partial unique index's predicate exactly
        // (migration 0043) — an insert with no dedupe_key never
        // conflicts, same as before this change.
        oc
          .columns(['user_id', 'type', 'dedupe_key'])
          .where('dedupe_key', 'is not', null)
          .doNothing(),
      )
      .returning('user_id')
      .execute();
    return rows.map((r) => r.user_id);
  }

  /** The subset of `userIds` whose account is still live — not
   *  soft-deleted (users.deleted_at) and not status 'deleted'. */
  private async filterEligibleRecipients(
    userIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', 'in', [...new Set(userIds)])
      .where('deleted_at', 'is', null)
      .where('status', '<>', 'deleted')
      .execute();
    return new Set(rows.map((r) => r.id));
  }

  /** Bounded lookback used by callers (e.g. the attendance module's
   *  repeated-absence alert) that need to check "have I already notified
   *  this user about this pattern recently" before calling notify()
   *  again — read-only, doesn't affect the normal notify()/list path. */
  listRecentForUserByType(userId: string, type: string, since: Date) {
    return this.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .where('type', '=', type)
      .where('created_at', '>=', since)
      .execute();
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
