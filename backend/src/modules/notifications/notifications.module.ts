import { Module } from '@nestjs/common';

/**
 * Bounded context: in-app notifications, push delivery (FCM/APNs) with
 * preferences + quiet hours, announcement fan-out. Async jobs (reminders,
 * digests) run on BullMQ, queued from here.
 * Owns tables: notifications.
 */
@Module({})
export class NotificationsModule {}
