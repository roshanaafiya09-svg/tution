import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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
    signupRole: 'tutor' | 'student' | 'parent' | 'academy' | undefined,
    deviceLabel: string | undefined,
    phoneE164?: string,
  ): Promise<AuthTokens> {
    const identifier = normalizeIdentifier(rawIdentifier);
    await this.otpService.checkOtp(identifier, code);

    let user = await this.usersRepository.findByIdentifier(identifier);
    if (!user) {
      if (!signupRole) {
        throw new BadRequestException(
          'No account yet — pass signupRole ("tutor", "student", "parent", or "academy") to create one.',
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

  /**
   * Step 1 of the self-service email change (see confirmEmailUpdate for
   * step 2). A direct, unverified write to users.email would let any
   * signed-in account claim someone else's real email address — a later
   * login attempt with that email would then resolve to the attacker's
   * account and hand over a valid session the moment the victim enters
   * the code that was, in fact, correctly delivered to their own inbox.
   * Proving control of the NEW address first closes that path entirely.
   * Reuses the exact same OTP challenge/consume mechanism as login,
   * keyed to the new email itself — same per-identifier rate limit,
   * same 5-minute expiry, same 5-attempt cap.
   */
  async requestEmailUpdate(userId: string, rawEmail: string): Promise<void> {
    const email = normalizeIdentifier(rawEmail);
    const existing = await this.usersRepository.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        'An account with this email already exists — try signing in instead.',
      );
    }
    await this.otpService.requestOtp(email, { email });
  }

  /**
   * Step 2 — only writes users.email once the code sent to the NEW
   * address has been verified, i.e. once the caller has demonstrated
   * they actually control it.
   */
  async confirmEmailUpdate(
    userId: string,
    rawEmail: string,
    code: string,
  ): Promise<void> {
    const email = normalizeIdentifier(rawEmail);
    await this.otpService.checkOtp(email, code);
    await this.usersRepository.updateEmail(userId, email);
    await this.otpService.consumeOtp(email);
  }
}
