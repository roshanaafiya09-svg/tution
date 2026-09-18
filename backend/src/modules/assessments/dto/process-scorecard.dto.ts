import { IsString, MaxLength } from 'class-validator';

export class ProcessScorecardDto {
  @IsString()
  @MaxLength(500)
  objectKey!: string;
}
