import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { DeviceTokensController } from './device-tokens/device-tokens.controller';
import { DeviceTokensRepository } from './device-tokens/device-tokens.repository';
import { PUSH_PROVIDER } from './push/push-provider.interface';
import { ConsolePushProvider } from './push/console-push.provider';
import { FcmPushProvider } from './push/fcm-push.provider';
import { WHATSAPP_PROVIDER } from './whatsapp/whatsapp-provider.interface';
import { ConsoleWhatsAppProvider } from './whatsapp/console-whatsapp.provider';

const pushLogger = new Logger('NotificationsModule');

/**
 * Bounded context: in-app notifications, push delivery (FCM for Android;
 * APNs is a deliberate later addition behind the same PushProvider seam),
 * announcement fan-out. Async jobs (reminders, digests) run on BullMQ,
 * queued from here.
 * Owns tables: notifications, device_tokens.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController, DeviceTokensController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    DeviceTokensRepository,
    ConsolePushProvider,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, ConsolePushProvider, FcmPushProvider],
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsolePushProvider,
        fcmProvider: FcmPushProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('fcm.serviceAccountJsonBase64'),
        );
        if (configured) {
          pushLogger.log('FCM configured — using it for push delivery');
          return fcmProvider;
        }
        pushLogger.warn(
          'FCM_SERVICE_ACCOUNT_JSON_BASE64 not set — push notifications will be logged, not sent',
        );
        return consoleProvider;
      },
    },
    ConsoleWhatsAppProvider,
    // No real WhatsAppProvider exists yet (see whatsapp-provider.interface.ts)
    // — this factory is still shaped like PUSH_PROVIDER's so a future
    // Meta Cloud API provider drops in the same way FcmPushProvider did,
    // with zero change to NotificationsService or any caller of notify().
    {
      provide: WHATSAPP_PROVIDER,
      useExisting: ConsoleWhatsAppProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
