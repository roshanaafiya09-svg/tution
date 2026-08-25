import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { VerifyContactUpdateDto } from './dto/verify-contact-update.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './tokens.service';
import { UsersRepository } from '../users/users.repository';
import { GoogleAuthService } from './google-auth.service';
import {
  applyWebSession,
  clearWebSession,
  isWebClient,
  readRefreshToken,
} from './web-session.util';

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
    private readonly config: ConfigService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() dto: RequestOtpDto) {
    await this.authService.requestOtp(resolveIdentifier(dto));
    return { sent: true };
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const tokens = await this.authService.verifyOtpAndIssueTokens(
      resolveIdentifier(dto),
      dto.code,
      dto.signupRole,
      dto.deviceLabel,
      dto.phoneForSignup,
    );
    return applyWebSession(
      reply,
      tokens,
      isWebClient(req),
      this.config.get<string>('app.nodeEnv'),
    );
  }

  /**
   * Deliberately NOT behind CsrfGuard, unlike /auth/logout — a page
   * reload loses the in-memory CSRF token (by design: it's never
   * persisted), but the refresh cookie survives, so requiring the
   * header here would lock a legitimate user out of their own session
   * on every reload. This is an acceptable gap: a cross-site-forged
   * refresh call only rotates the victim's own cookie in their own
   * browser — the attacker's page can't read the response (blocked by
   * CORS), gains nothing, and the victim's session keeps working
   * normally with the new cookie. Real consequence lives on
   * /auth/logout instead (a forged call there actually ends the
   * victim's session), which is why the guard stays there.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = readRefreshToken(req, dto.refreshToken);
    if (!refreshToken) {
      // No cookie and no body token both mean the same thing here: there
      // is no session to refresh. This is the routine "not logged in
      // yet" case web's ensureSession() hits on every first visit, not
      // a malformed request — 401, not 400.
      throw new UnauthorizedException('No refresh token provided');
    }
    const tokens = await this.authService.refresh(refreshToken, undefined);
    return applyWebSession(
      reply,
      tokens,
      isWebClient(req),
      this.config.get<string>('app.nodeEnv'),
    );
  }

  /** Revokes this device's refresh token server-side. Unauthenticated
   *  by design — the refresh token itself is the credential being
   *  surrendered, same as /auth/refresh. */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = readRefreshToken(req, dto.refreshToken);
    const isWeb = isWebClient(req);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearWebSession(reply, isWeb, this.config.get<string>('app.nodeEnv'));
    return { loggedOut: true };
  }

  @Post('google')
  @HttpCode(200)
  async googleSignIn(
    @Body() dto: GoogleSignInDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const tokens = await this.googleAuthService.signIn(
      dto.idToken,
      dto.deviceLabel,
    );
    return applyWebSession(
      reply,
      tokens,
      isWebClient(req),
      this.config.get<string>('app.nodeEnv'),
    );
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
