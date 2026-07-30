import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
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
 */
@Module({
  imports: [IdentityModule],
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
    SessionsRepository,
    AttendanceRepository,
  ],
})
export class SchedulingModule {}
