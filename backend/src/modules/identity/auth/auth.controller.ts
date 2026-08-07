import {
  BadRequestException,
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
import { UpdateContactDto } from './dto/update-contact.dto';
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
    await this.authService.requestOtp(dto.phoneE164, {
      email: dto.email,
      telegramChatId: dto.telegramChatId,
    });
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
      { email: dto.email, telegramChatId: dto.telegramChatId },
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

  /** Lets an already-signed-in user set/update the address OTPs should
   *  go to when Email/Telegram is the active channel — the phone-OTP
   *  signup path can only capture whichever one channel actually
   *  delivered the code (see AuthService.verifyOtpAndIssueTokens). */
  @Post('contact')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async updateContact(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateContactDto,
  ) {
    if (!dto.email && !dto.telegramChatId) {
      throw new BadRequestException(
        'Provide at least one of "email" or "telegramChatId".',
      );
    }
    await this.usersRepository.updateContact(user.sub, {
      email: dto.email,
      telegramChatId: dto.telegramChatId,
    });
    return { updated: true };
  }
}
