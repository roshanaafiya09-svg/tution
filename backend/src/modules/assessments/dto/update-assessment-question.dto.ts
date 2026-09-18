import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAssessmentQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  questionText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  choices?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  correctChoiceIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  marks?: number;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;
}
