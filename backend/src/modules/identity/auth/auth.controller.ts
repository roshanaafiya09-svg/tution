import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { StartTelegramLinkDto } from './dto/start-telegram-link.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AccessTokenPayload } from './tokens.service';
import { UsersRepository } from '../users/users.repository';
import { GoogleAuthService } from './google-auth.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';

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
    private readonly telegramLinkService: TelegramLinkService,
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

  /** Starts Telegram linking for an identifier that has no account yet.
   *  Public by design — it runs before any account exists, so there's no
   *  session to authenticate. See TelegramLinkService.startLink for why
   *  an *existing* account can't be linked this way. */
  @Post('telegram/link/start')
  @HttpCode(200)
  startTelegramLink(@Body() dto: StartTelegramLinkDto) {
    return this.telegramLinkService.startLink(dto.identifier);
  }

  /** Polled by the client while the user is off pressing Start in
   *  Telegram. Returns only a boolean — never the chat id. */
  @Get('telegram/link/:token/status')
  telegramLinkStatus(@Param('token') token: string) {
    return this.telegramLinkService.linkStatus(token);
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

  /** Sets the email a signed-in user can then also sign in with. */
  @Post('contact')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async updateContact(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateContactDto,
  ) {
    await this.usersRepository.updateEmail(user.sub, dto.email.toLowerCase());
    return { updated: true };
  }
}
