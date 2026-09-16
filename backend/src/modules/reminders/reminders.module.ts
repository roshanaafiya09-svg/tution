import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { RemindersService } from './reminders.service';

/** No controller — purely background jobs, see RemindersService's doc
 *  comment for why this rides @nestjs/schedule rather than a queue. */
@Module({
  imports: [SchedulingModule, NotificationsModule, HolidaysModule],
  providers: [RemindersService],
})
export class RemindersModule {}
