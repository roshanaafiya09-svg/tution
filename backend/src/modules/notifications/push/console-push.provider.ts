import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushProvider } from './push-provider.interface';

/**
 * Logs instead of sending. Real FCM/APNs delivery needs device tokens,
 * which arrive with the mobile app — see PushProvider.
 */
@Injectable()
export class ConsolePushProvider implements PushProvider {
  private readonly logger = new Logger('Push (dev)');

  send(messages: PushMessage[]): Promise<void> {
    for (const message of messages) {
      this.logger.log(
        `-> ${message.userId}: ${message.title} — ${message.body}`,
      );
    }
    return Promise.resolve();
  }
}
