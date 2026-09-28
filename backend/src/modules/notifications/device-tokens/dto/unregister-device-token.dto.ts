import { IsString, MinLength } from 'class-validator';

export class UnregisterDeviceTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
