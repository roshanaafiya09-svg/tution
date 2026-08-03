import { IsIn, IsOptional, Matches } from 'class-validator';

export class GenerateDigestDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodStart must be YYYY-MM-DD' })
  periodStart!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodEnd must be YYYY-MM-DD' })
  periodEnd!: string;

  @IsOptional()
  @IsIn(['en', 'ta'])
  locale?: 'en' | 'ta';
}
