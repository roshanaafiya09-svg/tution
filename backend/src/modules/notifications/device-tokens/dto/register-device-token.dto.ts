import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: 'android' | 'ios';
}
