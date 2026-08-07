import { BadRequestException, Injectable } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import type { OtpContact } from '../otp/providers/otp-provider.interface';
import { UsersRepository } from '../users/users.repository';
import { TokensService } from './tokens.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
  ) {}

  /**
   * `contact` is only needed when the active OTP channel is Email or
   * Telegram (WhatsApp/console ignore it) and isn't already on file —
   * falls back to whatever's stored for this phone number so a returning
   * user who set their contact via POST /auth/contact doesn't have to
   * resupply it every login.
   */
  async requestOtp(phoneE164: string, contact?: OtpContact): Promise<void> {
    let effectiveContact = contact;
    if (!effectiveContact?.email && !effectiveContact?.telegramChatId) {
      const user = await this.usersRepository.findByPhone(phoneE164);
      if (user) {
        effectiveContact = {
          email: user.email ?? undefined,
          telegramChatId: user.telegram_chat_id ?? undefined,
        };
      }
    }
    return this.otpService.requestOtp(phoneE164, effectiveContact);
  }

  async verifyOtpAndIssueTokens(
    phoneE164: string,
    code: string,
    signupRole: 'tutor' | 'student' | 'parent' | undefined,
    deviceLabel: string | undefined,
    contact?: OtpContact,
  ): Promise<AuthTokens> {
    await this.otpService.checkOtp(phoneE164, code);

    let user = await this.usersRepository.findByPhone(phoneE164);
    if (!user) {
      if (!signupRole) {
        throw new BadRequestException(
          'No account with this number yet — pass signupRole ("tutor", "student", or "parent") to create one.',
        );
      }
      // Only persist the contact field matching the channel that just
      // delivered (and proved) this code — e.g. if Telegram is active
      // but the request also included an unrelated `email`, that email
      // was never actually verified and must not be trusted onto the
      // new account (would let anyone claim someone else's address and
      // hijack their future Google Sign-In, which matches by email).
      const channel = this.otpService.activeChannel;
      const verifiedContact: OtpContact = {
        email: channel === 'email' ? contact?.email : undefined,
        telegramChatId:
          channel === 'telegram' ? contact?.telegramChatId : undefined,
      };
      user = await this.usersRepository.createWithRole(
        phoneE164,
        signupRole,
        verifiedContact,
      );
    }

    await this.otpService.consumeOtp(phoneE164);

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
