import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersRepository } from './users/users.repository';
import { OtpService } from './otp/otp.service';
import { OtpRepository } from './otp/otp.repository';
import { OTP_PROVIDER } from './otp/providers/otp-provider.interface';
import { ConsoleOtpProvider } from './otp/providers/console-otp.provider';
import { WhatsAppCloudApiOtpProvider } from './otp/providers/whatsapp-cloud-api-otp.provider';
import { EmailOtpProvider } from './otp/providers/email-otp.provider';
import { TelegramOtpProvider } from './otp/providers/telegram-otp.provider';
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
 * Bounded context: users, roles/RBAC, auth (phone OTP via WhatsApp/Email/
 * Telegram + Google Sign-In), tutor/student profiles. Verification and
 * consent live in TrustModule.
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
    WhatsAppCloudApiOtpProvider,
    EmailOtpProvider,
    TelegramOtpProvider,
    {
      provide: OTP_PROVIDER,
      inject: [
        ConfigService,
        ConsoleOtpProvider,
        WhatsAppCloudApiOtpProvider,
        EmailOtpProvider,
        TelegramOtpProvider,
      ],
      // Priority: WhatsApp (blueprint §4 primary) > Email > Telegram >
      // console. Email/Telegram were added later as cheaper channels
      // that don't need a Meta Business account, so they rank below the
      // already-established WhatsApp path rather than displacing it —
      // whichever is configured highest wins, first one found stops the
      // fallback chain.
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsoleOtpProvider,
        whatsappProvider: WhatsAppCloudApiOtpProvider,
        emailProvider: EmailOtpProvider,
        telegramProvider: TelegramOtpProvider,
      ) => {
        const whatsappConfigured = Boolean(
          config.get<string>('whatsapp.accessToken') &&
          config.get<string>('whatsapp.phoneNumberId'),
        );
        if (whatsappConfigured) {
          otpProviderLogger.log(
            'WhatsApp Cloud API configured — using it for OTP delivery',
          );
          return whatsappProvider;
        }

        const emailConfigured = Boolean(
          config.get<string>('email.smtpHost') &&
          config.get<number>('email.smtpPort') &&
          config.get<string>('email.smtpUser') &&
          config.get<string>('email.smtpPass'),
        );
        if (emailConfigured) {
          otpProviderLogger.log(
            'SMTP configured — using Email for OTP delivery',
          );
          return emailProvider;
        }

        const telegramConfigured = Boolean(
          config.get<string>('telegram.botToken'),
        );
        if (telegramConfigured) {
          otpProviderLogger.log(
            'Telegram bot token configured — using Telegram for OTP delivery',
          );
          return telegramProvider;
        }

        otpProviderLogger.warn(
          'No WhatsApp/SMTP/Telegram credentials set — OTPs will be logged, not sent',
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
