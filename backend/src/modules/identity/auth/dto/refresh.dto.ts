import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /** Optional because the web client no longer sends this at all — its
   *  refresh token travels in the httpOnly `refresh_token` cookie
   *  instead (see web-session.util.ts). Mobile still sends it here. */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
