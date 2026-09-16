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
   * never blocks another from trying.
   */
  async notify(input: NotifyInput): Promise<void> {
    if (input.userIds.length === 0) return;

    await this.repository.createMany(
      input.userIds.map((userId) => ({
        userId,
        type: input.type,
        payload: { title: input.title, body: input.body, ...input.payload },
      })),
    );

    try {
      await this.push.send(
        input.userIds.map((userId) => ({
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
        input.userIds.map((userId) => ({
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
