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

    // Defense-in-depth companion to the read-side visibility filter below
    // (see isVisible's doc comment): every caller already stops sending a
    // departed teacher new Academy notices (they compute recipients from
    // the CURRENT active roster), but this is the one choke point every
    // notify() passes through, so a caller that forgot — or a future one —
    // can never slip a new Academy notification past a teacher who has
    // left that Academy.
    notifications = await this.filterAcademyEligibleRecipients(notifications);
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

  /** The subset of `notifications` a teacher who has since left the
   *  academy named in `payload.academyId` is still eligible for — see
   *  isVisible's doc comment for the exact rule. A notification with no
   *  `academyId` (Individual, or addressed to a non-teacher recipient)
   *  always passes through unfiltered. */
  private async filterAcademyEligibleRecipients(
    notifications: NewNotification[],
  ): Promise<NewNotification[]> {
    const scoped = notifications.filter(
      (n) => typeof n.payload.academyId === 'string',
    );
    if (scoped.length === 0) return notifications;
    const membership = await this.loadMembership(scoped.map((n) => n.userId));
    return notifications.filter((n) =>
      isVisible(n.payload.academyId, membership.get(n.userId)),
    );
  }

  /** Every academy this user has ever been a member of (across both
   *  'active' and 'left' rows — a rejoin inserts a second row rather than
   *  reviving the first, see AcademyMembershipsRepository.markLeft/create),
   *  grouped per user for the visibility filters below. */
  private async loadMembership(
    userIds: string[],
  ): Promise<Map<string, MembershipSets>> {
    const rows = await this.db
      .selectFrom('academy_memberships')
      .select(['tutor_id', 'academy_id', 'status'])
      .where('tutor_id', 'in', [...new Set(userIds)])
      .execute();
    const byUser = new Map<string, MembershipSets>();
    for (const row of rows) {
      let sets = byUser.get(row.tutor_id);
      if (!sets) {
        sets = { active: new Set(), known: new Set() };
        byUser.set(row.tutor_id, sets);
      }
      sets.known.add(row.academy_id);
      if (row.status === 'active') sets.active.add(row.academy_id);
    }
    return byUser;
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

  /** Fetches a buffer wider than `limit` and trims after the visibility
   *  filter (see isVisible's doc comment) rather than filtering in SQL —
   *  this table has no JSON-path index and the app's notification volume
   *  per user is small, so this stays simple and avoids a raw `sql` value
   *  import here (NotificationsRepository is pulled in, via
   *  NotificationsService, by many *.service.spec.ts unit tests that
   *  don't mock kysely — see teacher-leave.service.spec.ts's comment on
   *  the same gotcha). A departed teacher with an unusually deep backlog
   *  of hidden Academy notices could in theory see fewer than `limit`
   *  rows; there's no product requirement for exact-count pagination
   *  here, so that's an acceptable trade rather than a real regression. */
  async listForUser(userId: string, limit = 50) {
    const rows = await this.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit * 4)
      .execute();
    const membership = (await this.loadMembership([userId])).get(userId);
    return rows
      .filter((r) =>
        isVisible((r.payload as { academyId?: unknown }).academyId, membership),
      )
      .slice(0, limit);
  }

  async countUnread(userId: string): Promise<number> {
    const rows = await this.db
      .selectFrom('notifications')
      .select('payload')
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .execute();
    const membership = (await this.loadMembership([userId])).get(userId);
    return rows.filter((r) =>
      isVisible((r.payload as { academyId?: unknown }).academyId, membership),
    ).length;
  }

  /** A no-op (0 rows affected) if `notificationId` doesn't belong to
   *  `userId` OR is a hidden departed-Academy notice — see isVisible's
   *  doc comment. Mirrors the "denied/inaccessible" convention the rest
   *  of the app uses for an id the caller isn't authorized to touch,
   *  rather than exposing whether the row exists at all. */
  async markRead(userId: string, notificationId: string): Promise<void> {
    const row = await this.db
      .selectFrom('notifications')
      .select(['id', 'payload'])
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row) return;
    const membership = (await this.loadMembership([userId])).get(userId);
    if (
      !isVisible((row.payload as { academyId?: unknown }).academyId, membership)
    ) {
      return;
    }
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .execute();
  }

  /** Only marks the rows this user can currently SEE — a hidden departed-
   *  Academy notice must stay exactly as it was, not be silently touched
   *  by a bulk action the user never knew applied to it. */
  async markAllRead(userId: string): Promise<void> {
    const unread = await this.db
      .selectFrom('notifications')
      .select(['id', 'payload'])
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .execute();
    if (unread.length === 0) return;
    const membership = (await this.loadMembership([userId])).get(userId);
    const visibleIds = unread
      .filter((r) =>
        isVisible((r.payload as { academyId?: unknown }).academyId, membership),
      )
      .map((r) => r.id);
    if (visibleIds.length === 0) return;
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('id', 'in', visibleIds)
      .where('user_id', '=', userId)
      .execute();
  }
}

export interface MembershipSets {
  /** Academies this user currently holds an ACTIVE membership in. */
  active: Set<string>;
  /** Every academy this user has EVER held a membership row for (active
   *  or left) — used only to tell "was once a teacher member here, now
   *  departed" apart from "never a teacher member of this academy at
   *  all" (a student/parent recipient, or an Individual notification). */
  known: Set<string>;
}

/**
 * The notification-visibility rule (see the module's own file header for
 * the wider design): an Academy-scoped notification (payload.academyId
 * set) stays visible to a recipient who currently holds ACTIVE membership
 * in that academy, or who was never a teacher member of it at all (a
 * student/parent recipient — their own eligibility is governed
 * elsewhere, never by academy_memberships). It is hidden only for a
 * recipient who WAS a member and has since left — this is the "old
 * Academy notifications disappear when a teacher departs" behavior,
 * without deleting the row or touching any other recipient's copy of it.
 *
 * Uses the CURRENT membership status only (no historical join/left
 * window), matching every other membership check in the codebase
 * (getOwnedBatch, assertActiveMember, etc.) — see section 12/H12's "use
 * the current membership lifecycle model, don't invent a second state
 * system". One deliberate consequence: rejoining an academy (a NEW
 * 'active' row — markLeft/create never reactivate the old one) restores
 * visibility of ALL of that academy's past notifications, the same way
 * rejoining restores full academy access everywhere else in this
 * codebase. No separate "permanently hidden" state is introduced.
 *
 * A notification with no academyId (Individual, or a type that never
 * carries one) is always visible — this rule only ever narrows Academy-
 * scoped rows.
 */
export function isVisible(
  academyId: unknown,
  membership?: MembershipSets,
): boolean {
  if (typeof academyId !== 'string') return true;
  if (!membership) return true;
  if (membership.active.has(academyId)) return true;
  return !membership.known.has(academyId);
}
