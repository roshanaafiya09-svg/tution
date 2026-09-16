import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AcademyAnnouncementAudience } from '../../../../database/types';
import { ANNOUNCEMENT_AUDIENCES } from './create-announcement.dto';

/** Draft-only — the service (and the repository's own WHERE clause)
 *  reject this once the announcement is published. */
export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audienceType?: AcademyAnnouncementAudience;

  @IsOptional()
  @IsUUID()
  audienceBatchId?: string;

  @IsOptional()
  @IsUUID()
  audienceTeacherId?: string;

  @IsOptional()
  @IsUUID()
  audienceStudentId?: string;
}
