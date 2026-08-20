import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SubscriptionsModule } from '../billing/subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BatchesController } from './batches/batches.controller';
import { BatchesService } from './batches/batches.service';
import { BatchesRepository } from './batches/batches.repository';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
import { InvitesRepository } from './invites/invites.repository';
import { SessionsController } from './sessions/sessions.controller';
import { SessionsService } from './sessions/sessions.service';
import { SessionsRepository } from './sessions/sessions.repository';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { AttendanceRepository } from './attendance/attendance.repository';

/**
 * Bounded context: batches, enrollments, invite links, class sessions
 * (RRULE recurrence, UTC + IANA timezone), attendance.
 * Owns tables: batches, enrollments, invites, class_sessions, attendance.
 * NotificationsModule is imported for the attendance module's repeated-
 * absence alert (NotificationsService.notify()). ParentsModule is
 * deliberately NOT imported here — ParentsModule -> TrustModule ->
 * DeliveryModule -> SchedulingModule would close a circular import, so
 * the parent-facing attendance routes live in their own small sink
 * module (AttendanceParentModule) instead, the same shape ProgressModule
 * already uses to safely compose SchedulingModule + ParentsModule as
 * siblings.
 */
@Module({
  imports: [IdentityModule, SubscriptionsModule, NotificationsModule],
  controllers: [
    BatchesController,
    InvitesController,
    SessionsController,
    AttendanceController,
  ],
  providers: [
    BatchesService,
    BatchesRepository,
    InvitesService,
    InvitesRepository,
    SessionsService,
    SessionsRepository,
    AttendanceService,
    AttendanceRepository,
  ],
  exports: [
    BatchesService,
    BatchesRepository,
    InvitesService,
    SessionsService,
    SessionsRepository,
    AttendanceRepository,
  ],
})
export class SchedulingModule {}
