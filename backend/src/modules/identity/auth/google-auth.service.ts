import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { UsersRepository } from '../users/users.repository';
import { TokensService } from './tokens.service';
import type { AuthTokens } from './auth.service';

/**
 * Blueprint §4/§6: "Google Sign-In on web". Our schema keys accounts on
 * phone_e164 (NOT NULL) — phone/email OTP (delivered via email/Brevo) is how
 * an account is *created*. Google Sign-In here links to an *existing*
 * account by email rather than creating a phone-less one; making
 * phone_e164 nullable to support Google-first signup is a real schema
 * decision, not something to slip in unasked. Not exercised end-to-end in
 * this environment (no Google OAuth client available to test against) —
 * the ID-token verification itself is real, but the account-linking
 * behavior above is a design call worth confirming before this ships.
 */
@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;

  constructor(
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
  ) {
    this.client = new OAuth2Client();
  }

  async signIn(idToken: string, deviceLabel?: string): Promise<AuthTokens> {
    const clientId = this.config.get<string>('googleAuth.clientId');
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Google Sign-In is not configured on this server (GOOGLE_CLIENT_ID missing).',
      );
    }

    let email: string | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      email = ticket.getPayload()?.email;
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!email) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'No account linked to this Google email yet — sign up with a phone number or email first.',
      );
    }

    const roles = await this.usersRepository.getRoles(user.id);
    const accessToken = this.tokensService.signAccessToken(user.id, roles);
    const refreshToken = await this.tokensService.issueRefreshToken(
      user.id,
      deviceLabel,
    );

    return { accessToken, refreshToken };
  }
}
