import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateOnlineAssessmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsUUID()
  subjectId!: string;

  /** Never trusted as authorization — every id is re-checked server-side
   *  against the caller's own batches (§4/§32). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  batchIds!: string[];
}
