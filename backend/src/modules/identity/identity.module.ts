import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersRepository } from './users/users.repository';
import { OtpService } from './otp/otp.service';
import { OtpRepository } from './otp/otp.repository';
import { OTP_PROVIDER } from './otp/providers/otp-provider.interface';
import { ConsoleOtpProvider } from './otp/providers/console-otp.provider';
import { TelegramOtpProvider } from './otp/providers/telegram-otp.provider';
import { TelegramLinkRepository } from './telegram/telegram-link.repository';
import { TelegramLinkService } from './telegram/telegram-link.service';
import { TelegramUpdatesPoller } from './telegram/telegram-updates.poller';
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
 * via Telegram + Google Sign-In), Telegram account linking, tutor/student
 * profiles. Verification and consent live in TrustModule.
 * Owns tables: users, user_roles, profiles_tutor, profiles_student.
 */
@Module({
  imports: [JwtModule.register({}), SubscriptionsModule],
  controllers: [AuthController, ProfilesController],
  providers: [
    UsersRepository,
    OtpRepository,
    OtpService,
    ConsoleOtpProvider,
    TelegramOtpProvider,
    TelegramLinkRepository,
    TelegramLinkService,
    TelegramUpdatesPoller,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, ConsoleOtpProvider, TelegramOtpProvider],
      // Telegram is the only real delivery channel; console is the
      // zero-credential dev fallback that logs the code instead of
      // sending it. Both vars are required together — the token sends,
      // the username builds the linking deep link, and delivery is
      // useless without a way for users to link in the first place.
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsoleOtpProvider,
        telegramProvider: TelegramOtpProvider,
      ) => {
        const telegramConfigured = Boolean(
          config.get<string>('telegram.botToken') &&
          config.get<string>('telegram.botUsername'),
        );
        if (telegramConfigured) {
          otpProviderLogger.log(
            'Telegram bot configured — using Telegram for OTP delivery',
          );
          return telegramProvider;
        }

        otpProviderLogger.warn(
          'TELEGRAM_BOT_TOKEN/TELEGRAM_BOT_USERNAME not set — OTPs will be logged, not sent',
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
