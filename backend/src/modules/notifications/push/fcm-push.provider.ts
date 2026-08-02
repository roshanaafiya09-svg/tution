import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging, TokenMessage } from 'firebase-admin/messaging';
import { DeviceTokensRepository } from '../device-tokens/device-tokens.repository';
import { PushMessage, PushProvider } from './push-provider.interface';

// FCM's actual error code for a garbage/malformed token is
// 'messaging/invalid-argument', not 'invalid-registration-token' as the
// docs suggest — confirmed against the live API. Without this, a
// malformed token (e.g. from a buggy client build) would log a warning
// on every single push forever instead of ever being cleaned up.
const STALE_TOKEN_ERROR_CODES = new Set([
  'messaging/registered-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

const SEND_CHUNK_SIZE = 500; // FCM's per-batch limit

/**
 * Real Android delivery via Firebase Cloud Messaging. Always instantiated
 * by Nest (see notifications.module.ts's PUSH_PROVIDER factory) even when
 * FCM isn't configured, so credential parsing happens lazily in send()
 * rather than the constructor — mirrors WhatsAppCloudApiOtpProvider.
 */
@Injectable()
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger('Push (FCM)');
  private app: App | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly deviceTokens: DeviceTokensRepository,
  ) {}

  private getApp(): App {
    if (this.app) return this.app;
    const b64 = this.config.getOrThrow<string>('fcm.serviceAccountJsonBase64');
    const serviceAccount = JSON.parse(
      Buffer.from(b64, 'base64').toString('utf8'),
    );
    this.app = initializeApp(
      { credential: cert(serviceAccount) },
      'push-provider',
    );
    return this.app;
  }

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const userIds = [...new Set(messages.map((m) => m.userId))];
    const tokenRows = await this.deviceTokens.findTokensForUsers(userIds);
    if (tokenRows.length === 0) return;

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokenRows) {
      const tokens = tokensByUser.get(row.user_id) ?? [];
      tokens.push(row.token);
      tokensByUser.set(row.user_id, tokens);
    }

    const fcmMessages: TokenMessage[] = [];
    for (const message of messages) {
      for (const token of tokensByUser.get(message.userId) ?? []) {
        fcmMessages.push({
          token,
          notification: { title: message.title, body: message.body },
          data: message.data,
        });
      }
    }
    if (fcmMessages.length === 0) return;

    const messaging = getMessaging(this.getApp());
    const staleTokens: string[] = [];

    for (let i = 0; i < fcmMessages.length; i += SEND_CHUNK_SIZE) {
      const chunk = fcmMessages.slice(i, i + SEND_CHUNK_SIZE);
      const response = await messaging.sendEach(chunk);
      response.responses.forEach((result, index) => {
        if (!result.success && result.error) {
          if (STALE_TOKEN_ERROR_CODES.has(result.error.code)) {
            staleTokens.push(chunk[index].token);
          } else {
            this.logger.warn(`Push send failed: ${result.error.message}`);
          }
        }
      });
    }

    if (staleTokens.length > 0) {
      await this.deviceTokens.deleteTokens(staleTokens);
    }
  }
}
