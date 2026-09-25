import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { PUSH_PROVIDER } from './push/push-provider.interface';
import type { PushProvider } from './push/push-provider.interface';
import { WHATSAPP_PROVIDER } from './whatsapp/whatsapp-provider.interface';
import type { WhatsAppProvider } from './whatsapp/whatsapp-provider.interface';

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  /** H7: see NotificationsRepository.createMany's doc comment. Opt-in —
   *  most callers omit this and keep relying on whatever app-level check
   *  they already do before calling notify(). */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  /**
   * Writes the in-app notification rows, then fans out to every other
   * channel (push, WhatsApp). A dropped delivery on any one channel must
   * never fail the action that triggered it (posting an announcement,
   * approving a leave request, say), so each send() is caught and
   * logged independently rather than propagated — one channel failing
   * never blocks another from trying. Returns the user ids a new
   * notification was actually created for.
   */
  async notify(input: NotifyInput): Promise<string[]> {
    if (input.userIds.length === 0) return [];

    // H7: with a dedupeKey, a user who already has this exact notification
    // gets no new row — and must get no new push/WhatsApp either. Without
    // one every row is always inserted, so this is the full list as before.
    const delivered = await this.repository.createMany(
      input.userIds.map((userId) => ({
        userId,
        type: input.type,
        payload: { title: input.title, body: input.body, ...input.payload },
        dedupeKey: input.dedupeKey,
      })),
    );
    if (delivered.length === 0) return [];

    try {
      await this.push.send(
        delivered.map((userId) => ({
          userId,
          title: input.title,
          body: input.body,
        })),
      );
    } catch (err) {
      this.logger.error(
        'Push delivery failed',
        err instanceof Error ? err.stack : err,
      );
    }

    try {
      await this.whatsapp.send(
        delivered.map((userId) => ({
          userId,
          title: input.title,
          body: input.body,
        })),
      );
    } catch (err) {
      this.logger.error(
        'WhatsApp delivery failed',
        err instanceof Error ? err.stack : err,
      );
    }
    return delivered;
  }

  listForUser(userId: string) {
    return this.repository.listForUser(userId);
  }

  /** See NotificationsRepository.listRecentForUserByType. */
  listRecentForUserByType(userId: string, type: string, since: Date) {
    return this.repository.listRecentForUserByType(userId, type, since);
  }

  countUnread(userId: string) {
    return this.repository.countUnread(userId);
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.repository.markRead(userId, notificationId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repository.markAllRead(userId);
  }
}
