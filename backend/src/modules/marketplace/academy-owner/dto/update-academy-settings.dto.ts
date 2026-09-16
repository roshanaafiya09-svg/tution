import { IsBoolean } from 'class-validator';

export class UpdateAcademySettingsDto {
  @IsBoolean()
  autoObserveGovtHolidays!: boolean;
}
