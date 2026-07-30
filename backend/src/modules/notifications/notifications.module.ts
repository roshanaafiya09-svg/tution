import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { PUSH_PROVIDER } from './push/push-provider.interface';
import { ConsolePushProvider } from './push/console-push.provider';

/**
 * Bounded context: in-app notifications, push delivery (FCM/APNs) with
 * preferences + quiet hours, announcement fan-out. Async jobs (reminders,
 * digests) run on BullMQ, queued from here.
 * Owns tables: notifications.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    { provide: PUSH_PROVIDER, useClass: ConsolePushProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
