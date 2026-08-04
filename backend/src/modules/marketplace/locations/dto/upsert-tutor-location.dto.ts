import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertTutorLocationDto {
  @IsString()
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaLabel?: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
