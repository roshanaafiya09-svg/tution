import { BadRequestException, Injectable } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
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

  requestOtp(phoneE164: string): Promise<void> {
    return this.otpService.requestOtp(phoneE164);
  }

  async verifyOtpAndIssueTokens(
    phoneE164: string,
    code: string,
    signupRole: 'tutor' | 'student' | 'parent' | undefined,
    deviceLabel: string | undefined,
  ): Promise<AuthTokens> {
    await this.otpService.checkOtp(phoneE164, code);

    let user = await this.usersRepository.findByPhone(phoneE164);
    if (!user) {
      if (!signupRole) {
        throw new BadRequestException(
          'No account with this number yet — pass signupRole ("tutor", "student", or "parent") to create one.',
        );
      }
      user = await this.usersRepository.createWithRole(phoneE164, signupRole);
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
}
