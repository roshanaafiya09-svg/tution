import { IsIn, IsInt, Min } from 'class-validator';

export const SCORECARD_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const MAX_SCORECARD_BYTES = 5 * 1024 * 1024;

export class ScorecardUploadUrlDto {
  @IsIn([SCORECARD_MIME], {
    message: 'mime must be a .xlsx spreadsheet',
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
