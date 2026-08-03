import { IsString, Length } from 'class-validator';

export class RedeemInviteDto {
  @IsString()
  @Length(1, 40)
  token!: string;
}
