import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitAttemptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  attemptText!: string;
}
