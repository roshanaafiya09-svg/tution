import { Module } from '@nestjs/common';
import { HolidaysRepository } from './holidays.repository';
import { AcademyHolidayCalendar } from './holiday-calendar';
import { TeacherLeaveCalendar } from './teacher-leave-calendar';

/**
 * The read-only holiday and approved-leave lookups, split out of HolidaysModule so
 * SchedulingModule can check holidays when a class is created.
 * HolidaysModule imports SchedulingModule (it cancels class_sessions), so
 * SchedulingModule importing HolidaysModule would be circular; this module
 * depends only on the (global) database connection, so both can import it.
 */
@Module({
  providers: [HolidaysRepository, AcademyHolidayCalendar, TeacherLeaveCalendar],
  exports: [HolidaysRepository, AcademyHolidayCalendar, TeacherLeaveCalendar],
})
export class HolidayCalendarModule {}
