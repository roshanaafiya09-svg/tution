import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersRepository } from './users/users.repository';
import { OtpService } from './otp/otp.service';
import { OtpRepository } from './otp/otp.repository';
import { OTP_PROVIDER } from './otp/providers/otp-provider.interface';
import { ConsoleOtpProvider } from './otp/providers/console-otp.provider';
import { WhatsAppCloudApiOtpProvider } from './otp/providers/whatsapp-cloud-api-otp.provider';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TokensService } from './auth/tokens.service';
import { RefreshTokenRepository } from './auth/refresh-token.repository';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { GoogleAuthService } from './auth/google-auth.service';

const otpProviderLogger = new Logger('IdentityModule');

/**
 * Bounded context: users, roles/RBAC, auth (WhatsApp OTP + Google Sign-In),
 * tutor/student profiles. Verification and consent live in TrustModule.
 * Owns tables: users, user_roles, profiles_tutor, profiles_student.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    UsersRepository,
    OtpRepository,
    OtpService,
    ConsoleOtpProvider,
    WhatsAppCloudApiOtpProvider,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, ConsoleOtpProvider, WhatsAppCloudApiOtpProvider],
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsoleOtpProvider,
        whatsappProvider: WhatsAppCloudApiOtpProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('whatsapp.accessToken') &&
          config.get<string>('whatsapp.phoneNumberId'),
        );
        if (configured) {
          otpProviderLogger.log(
            'WhatsApp Cloud API configured — using it for OTP delivery',
          );
          return whatsappProvider;
        }
        otpProviderLogger.warn(
          'WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — OTPs will be logged, not sent',
        );
        return consoleProvider;
      },
    },
    RefreshTokenRepository,
    TokensService,
    AuthService,
    GoogleAuthService,
    JwtAuthGuard,
  ],
  exports: [UsersRepository, TokensService, JwtAuthGuard],
})
export class IdentityModule {}
