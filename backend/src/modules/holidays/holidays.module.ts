import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AcademiesModule } from '../marketplace/academies/academies.module';
import { AcademyMembershipsModule } from '../marketplace/academy-memberships/academy-memberships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidayCalendarModule } from './holiday-calendar.module';
import { HolidayService } from './holiday.service';
import { HolidaysController } from './holidays.controller';
import { TeacherLeaveRepository } from './teacher-leave.repository';
import { TeacherLeaveService } from './teacher-leave.service';
import { TeacherLeaveController } from './teacher-leave.controller';

/**
 * Holiday & Teacher Leave Management. Owns `holidays`/`holiday_batches`/
 * `teacher_leave_requests`/`teacher_leave_request_sessions` (migration
 * 0035). Sits alongside SchedulingModule/AcademiesModule rather than
 * inside either — it needs both (class_sessions/attendance from
 * scheduling, academies/memberships from marketplace) and neither of
 * those needs it, so importing both here creates no cycle (same
 * reasoning as AcademyOwnerModule importing SchedulingModule +
 * AcademiesModule side by side).
 *
 * Registers the teacher-facing controllers (`/leave`, `/holidays/me`)
 * directly; the academy-admin-facing controllers
 * (AcademyOwnerLeaveController/AcademyOwnerHolidaysController) live in
 * marketplace/academy-owner, which imports this module and wraps
 * TeacherLeaveService/HolidayService with the same
 * resolveOwnAcademy/assertActiveMember ownership guard
 * AcademyOwnerBatchesService already uses — never calling these
 * services with a client-supplied academyId directly.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    AcademiesModule,
    AcademyMembershipsModule,
    NotificationsModule,
    HolidayCalendarModule,
  ],
  controllers: [TeacherLeaveController, HolidaysController],
  providers: [HolidayService, TeacherLeaveRepository, TeacherLeaveService],
  exports: [
    HolidayCalendarModule,
    HolidayService,
    TeacherLeaveRepository,
    TeacherLeaveService,
  ],
})
export class HolidaysModule {}
