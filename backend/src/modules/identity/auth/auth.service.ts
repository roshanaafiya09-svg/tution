import { BadRequestException, Injectable } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { UsersRepository } from '../users/users.repository';
import { identifierType, normalizeIdentifier } from '../identifier.util';
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
   * Codes go out over email only. If the identifier itself is an
   * email, that's where the code goes — new-signup or existing
   * account, doesn't matter. If it's a phone, only an existing
   * account's email on file can receive it; a fresh phone number has
   * nowhere to send a code (email is required to sign up — see
   * email-otp-migration-plan.md).
   */
  async requestOtp(rawIdentifier: string): Promise<void> {
    const identifier = normalizeIdentifier(rawIdentifier);
    const user = await this.usersRepository.findByIdentifier(identifier);

    const email =
      identifierType(identifier) === 'email' ? identifier : user?.email;

    if (!email) {
      throw new BadRequestException(
        'An email address is required to receive a login code — sign up with your email, or add one to your account.',
      );
    }

    await this.otpService.requestOtp(identifier, { email });
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
