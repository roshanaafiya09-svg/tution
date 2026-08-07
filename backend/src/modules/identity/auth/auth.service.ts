import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { UsersRepository } from '../users/users.repository';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { identifierType, normalizeIdentifier } from '../identifier.util';
import { TokensService } from './tokens.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Signals that the caller must complete Telegram linking before a code
 *  can be delivered. Carries `telegramLinkRequired` so clients can
 *  branch on it rather than string-matching the message. */
export class TelegramLinkRequiredException extends ForbiddenException {
  constructor(message: string) {
    super({
      statusCode: 403,
      error: 'Forbidden',
      message,
      telegramLinkRequired: true,
    });
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
    private readonly telegramLinkService: TelegramLinkService,
  ) {}

  /**
   * Codes go out over Telegram only, and a bot can't message a chat that
   * hasn't messaged it — so delivery is gated on a linked chat id.
   * Existing accounts read theirs from `users`; a brand-new identifier
   * reads it from the pending link record it just completed.
   */
  async requestOtp(rawIdentifier: string): Promise<void> {
    const identifier = normalizeIdentifier(rawIdentifier);
    const user = await this.usersRepository.findByIdentifier(identifier);

    const telegramChatId = user
      ? user.telegram_chat_id
      : await this.telegramLinkService.linkedChatIdFor(identifier);

    if (!telegramChatId) {
      throw new TelegramLinkRequiredException(
        user
          ? 'This account needs Telegram connected before you can sign in.'
          : 'Connect Telegram to receive your sign-in code.',
      );
    }

    await this.otpService.requestOtp(identifier, { telegramChatId });
  }

  async verifyOtpAndIssueTokens(
    rawIdentifier: string,
    code: string,
    signupRole: 'tutor' | 'student' | 'parent' | undefined,
    deviceLabel: string | undefined,
    phoneE164?: string,
  ): Promise<AuthTokens> {
    const identifier = normalizeIdentifier(rawIdentifier);
    await this.otpService.checkOtp(identifier, code);

    let user = await this.usersRepository.findByIdentifier(identifier);
    if (!user) {
      if (!signupRole) {
        throw new BadRequestException(
          'No account yet — pass signupRole ("tutor", "student", or "parent") to create one.',
        );
      }

      // The chat id comes from the link record Telegram itself
      // completed, never from the request body — a client can't claim
      // someone else's chat. Its presence is already implied by
      // requestOtp having succeeded; re-reading it here keeps signup
      // honest rather than trusting that ordering.
      const telegramChatId =
        await this.telegramLinkService.linkedChatIdFor(identifier);
      if (!telegramChatId) {
        throw new TelegramLinkRequiredException(
          'Connect Telegram to finish creating your account.',
        );
      }

      if (identifierType(identifier) === 'email' && !phoneE164) {
        // phone_e164 is NOT NULL — an email-identified signup still has
        // to supply one. Surfaced as a 400 rather than a DB constraint
        // error so the client can ask for it.
        throw new BadRequestException(
          'Signing up with an email also requires a phone number.',
        );
      }

      user = await this.usersRepository.createWithRole(
        identifier,
        signupRole,
        telegramChatId,
        phoneE164,
      );
    }

    await this.otpService.consumeOtp(identifier);

    const roles = await this.usersRepository.getRoles(user.id);
    const accessToken = this.tokensService.signAccessToken(user.id, roles);
    const refreshToken = await this.tokensService.issueRefreshToken(
      user.id,
      deviceLabel,
    );

    return { accessToken, refreshToken };
  }

  async refresh(
    refreshToken: string,
    deviceLabel: string | undefined,
  ): Promise<AuthTokens> {
    const { userId, jti } =
      await this.tokensService.verifyRefreshToken(refreshToken);
    const roles = await this.usersRepository.getRoles(userId);

    const accessToken = this.tokensService.signAccessToken(userId, roles);
    const newRefreshToken = await this.tokensService.rotateRefreshToken(
      jti,
      userId,
      deviceLabel,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokensService.revokeSession(refreshToken);
  }
}
