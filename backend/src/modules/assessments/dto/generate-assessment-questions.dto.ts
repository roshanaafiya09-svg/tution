import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class GenerateAssessmentQuestionsDto {
  @IsUUID()
  materialId!: string;

  /** Same default/range as the legacy AI quiz generator (blueprint §8). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}
