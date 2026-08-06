import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './tokens.service';
import { UsersRepository } from '../users/users.repository';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() dto: RequestOtpDto) {
    await this.authService.requestOtp(dto.phoneE164);
    return { sent: true };
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndIssueTokens(
      dto.phoneE164,
      dto.code,
      dto.signupRole,
      dto.deviceLabel,
    );
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken, undefined);
  }

  /** Revokes this device's refresh token server-side. Unauthenticated
   *  by design — the refresh token itself is the credential being
   *  surrendered, same as /auth/refresh. */
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { loggedOut: true };
  }

  @Post('google')
  @HttpCode(200)
  googleSignIn(@Body() dto: GoogleSignInDto) {
    return this.googleAuthService.signIn(dto.idToken, dto.deviceLabel);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AccessTokenPayload) {
    const record = await this.usersRepository.findById(user.sub);
    return {
      id: user.sub,
      roles: user.roles,
      phoneE164: record?.phone_e164,
      locale: record?.locale,
    };
  }
}
