import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { AcademyAnnouncementAudience } from '../../../../database/types';

export const ANNOUNCEMENT_AUDIENCES: AcademyAnnouncementAudience[] = [
  'academy',
  'teachers',
  'students',
  'parents',
  'batch',
  'teacher',
  'student',
];

/** Which of the three target ids the service requires/nulls-out is
 *  business logic (depends on audienceType), not shape — same split as
 *  CreateAcademyHolidayDto (scope/batchIds shape here, ownership checks
 *  in the service). All three are accepted as optional UUIDs; the
 *  service throws BadRequestException if the wrong one (or none/more
 *  than one) is supplied for the chosen audienceType, then verifies
 *  academy ownership before ever using it. */
export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audienceType!: AcademyAnnouncementAudience;

  @IsOptional()
  @IsUUID()
  audienceBatchId?: string;

  @IsOptional()
  @IsUUID()
  audienceTeacherId?: string;

  @IsOptional()
  @IsUUID()
  audienceStudentId?: string;

  /** If true, publishes immediately after creating the draft (one
   *  service-level code path, see AcademyOwnerAnnouncementsService.create). */
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
