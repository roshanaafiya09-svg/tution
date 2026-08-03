import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class SubmitQuizAttemptDto {
  /** Chosen choice index (0-3) per question, in the quiz's order_index order. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(3, { each: true })
  answers!: number[];
}
