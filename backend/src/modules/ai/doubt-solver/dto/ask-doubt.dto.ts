import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AskDoubtDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  question!: string;
}
