import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersRepository } from './users/users.repository';
import { OtpService } from './otp/otp.service';
import { OtpRepository } from './otp/otp.repository';
import { OTP_PROVIDER } from './otp/providers/otp-provider.interface';
import { ConsoleOtpProvider } from './otp/providers/console-otp.provider';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TokensService } from './auth/tokens.service';
import { RefreshTokenRepository } from './auth/refresh-token.repository';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

/**
 * Bounded context: users, roles/RBAC, auth (WhatsApp OTP + Google Sign-In),
 * tutor/student profiles. Verification and consent live in TrustModule.
 * Owns tables: users, user_roles, profiles_tutor, profiles_student.
 *
 * Google Sign-In (web) is not wired yet — it needs a Google OAuth client
 * ID/secret this environment doesn't have.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    UsersRepository,
    OtpRepository,
    OtpService,
    { provide: OTP_PROVIDER, useClass: ConsoleOtpProvider },
    RefreshTokenRepository,
    TokensService,
    AuthService,
    JwtAuthGuard,
  ],
  exports: [UsersRepository, TokensService, JwtAuthGuard],
})
export class IdentityModule {}
