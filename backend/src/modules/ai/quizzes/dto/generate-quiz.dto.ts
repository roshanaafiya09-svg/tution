import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateQuizDto {
  /** Blueprint §8 default is 10; left adjustable since a short handout
   *  shouldn't be forced into exactly 10 questions. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}
