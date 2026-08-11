import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersRepository } from './users/users.repository';
import { OtpService } from './otp/otp.service';
import { OtpRepository } from './otp/otp.repository';
import { OTP_PROVIDER } from './otp/providers/otp-provider.interface';
import { ConsoleOtpProvider } from './otp/providers/console-otp.provider';
import { EmailOtpProvider } from './otp/providers/email-otp.provider';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TokensService } from './auth/tokens.service';
import { RefreshTokenRepository } from './auth/refresh-token.repository';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GoogleAuthService } from './auth/google-auth.service';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesService } from './profiles/profiles.service';
import { ProfilesRepository } from './profiles/profiles.repository';
import { SubscriptionsModule } from '../billing/subscriptions/subscriptions.module';

const otpProviderLogger = new Logger('IdentityModule');

/**
 * Bounded context: users, roles/RBAC, auth (phone-or-email OTP delivered
 * via email + Google Sign-In), tutor/student profiles. Verification and
 * consent live in TrustModule. Owns tables: users, user_roles,
 * profiles_tutor, profiles_student.
 *
 * Email, via Brevo's HTTPS API, is the sole OTP delivery channel — see
 * the OTP_PROVIDER factory below. The Telegram-based OTP/linking
 * subsystem this replaced has been removed entirely (2026-08-11).
 */
@Module({
  imports: [JwtModule.register({}), SubscriptionsModule],
  controllers: [AuthController, ProfilesController],
  providers: [
    UsersRepository,
    OtpRepository,
    OtpService,
    ConsoleOtpProvider,
    EmailOtpProvider,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, ConsoleOtpProvider, EmailOtpProvider],
      // Email (via Brevo's HTTPS API) is the ONLY OTP delivery channel —
      // no fallback of any kind in production. BREVO_API_KEY plus
      // SMTP_USER (reused as the sender identity, not for SMTP) are
      // required there; see EmailOtpProvider. ConsoleOtpProvider (logs
      // the code instead of sending it) is a development-only
      // convenience for when those credentials are intentionally absent
      // locally — reachable in production is a startup-time hard error,
      // not a silent downgrade, so a misconfigured deploy fails loudly
      // instead of pretending OTPs were sent.
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsoleOtpProvider,
        emailProvider: EmailOtpProvider,
      ) => {
        const emailConfigured = Boolean(
          config.get<string>('email.brevoApiKey') &&
          config.get<string>('email.smtpUser'),
        );

        if (emailConfigured) {
          otpProviderLogger.log(
            'Brevo configured — using email for OTP delivery',
          );
          return emailProvider;
        }

        if (config.get<string>('app.nodeEnv') === 'production') {
          throw new Error(
            'BREVO_API_KEY and SMTP_USER must both be set in production — ' +
              'email via Brevo is the only OTP delivery channel and there ' +
              'is no fallback. Refusing to start rather than silently ' +
              'using the console-logging development provider.',
          );
        }

        otpProviderLogger.warn(
          'BREVO_API_KEY/SMTP_USER not set — development OTPs will be logged, not sent',
        );
        return consoleProvider;
      },
    },
    RefreshTokenRepository,
    TokensService,
    AuthService,
    GoogleAuthService,
    JwtAuthGuard,
    RolesGuard,
    ProfilesRepository,
    ProfilesService,
  ],
  exports: [
    UsersRepository,
    TokensService,
    JwtAuthGuard,
    RolesGuard,
    ProfilesService,
  ],
})
export class IdentityModule {}
