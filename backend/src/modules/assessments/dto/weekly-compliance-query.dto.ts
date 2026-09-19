import { IsOptional } from 'class-validator';
import { IsCalendarDate } from './is-calendar-date.decorator';

export class WeeklyComplianceQueryDto {
  /** Any date inside the wanted Asia/Kolkata week — normalised to that
   *  week's Monday server-side. Defaults to the current week. */
  @IsOptional()
  @IsCalendarDate()
  weekStartDate?: string;
}
