import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class SubmitAssignmentDto {
  /** Object keys from prior /submissions/upload-url calls. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  objectKeys!: string[];
}
