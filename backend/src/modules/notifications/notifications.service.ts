import { Inject, Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { PUSH_PROVIDER } from './push/push-provider.interface';
import type { PushProvider } from './push/push-provider.interface';

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /**
   * Writes the in-app notification rows, then pushes. Push failures are
   * intentionally not awaited into the caller's critical path — a
   * dropped push must never fail the action that triggered it (posting
   * an announcement, say).
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

    await this.push.send(
      input.userIds.map((userId) => ({
        userId,
        title: input.title,
        body: input.body,
      })),
    );
  }

  listForUser(userId: string) {
    return this.repository.listForUser(userId);
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
