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
import { VerifyContactUpdateDto } from './dto/verify-contact-update.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './tokens.service';
import { UsersRepository } from '../users/users.repository';
import { GoogleAuthService } from './google-auth.service';

/** `identifier` is the current field; `phoneE164` is the deprecated
 *  alias the shipped mobile app still sends. Exactly one is required. */
function resolveIdentifier(dto: {
  identifier?: string;
  phoneE164?: string;
}): string {
  const identifier = dto.identifier ?? dto.phoneE164;
  if (!identifier) {
    throw new BadRequestException(
      'identifier is required (a phone number or email address).',
    );
  }
  return identifier;
}

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
    await this.authService.requestOtp(resolveIdentifier(dto));
    return { sent: true };
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndIssueTokens(
      resolveIdentifier(dto),
      dto.code,
      dto.signupRole,
      dto.deviceLabel,
      dto.phoneForSignup,
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
      email: record?.email,
      locale: record?.locale,
    };
  }

  /** Step 1 of setting the email a signed-in user can then also sign in
   *  with — sends an OTP to the new address. Nothing is written to the
   *  account until POST /auth/contact/verify (step 2) proves the caller
   *  actually controls it; see AuthService.requestEmailUpdate for why a
   *  direct write would be an account-hijack vector. */
  @Post('contact')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async requestContactUpdate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateContactDto,
  ) {
    await this.authService.requestEmailUpdate(user.sub, dto.email);
    return { sent: true };
  }

  /** Step 2 — verifies the code sent to the new address, then applies
   *  the change. */
  @Post('contact/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async verifyContactUpdate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: VerifyContactUpdateDto,
  ) {
    await this.authService.confirmEmailUpdate(user.sub, dto.email, dto.code);
    return { updated: true };
  }
}
