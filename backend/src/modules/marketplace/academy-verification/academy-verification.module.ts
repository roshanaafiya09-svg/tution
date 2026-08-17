import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityModule } from '../../identity/identity.module';
import { AcademiesModule } from '../academies/academies.module';
import { TrustModule } from '../../trust/trust.module';
import { AcademyVerificationController } from './academy-verification.controller';
import { AcademyAdminVerificationController } from './academy-admin-verification.controller';
import { AcademyVerificationService } from './academy-verification.service';
import { AcademyVerificationRepository } from './academy-verification.repository';
import { KYC_PROVIDER } from './providers/kyc-provider.interface';
import { MockKycProvider } from './providers/mock-kyc.provider';
import { SetuKycProvider } from './providers/setu-kyc.provider';

const kycLogger = new Logger('KYC provider');

/**
 * Academy owner identity verification (KYC): the state machine +
 * consent flow, plus automated PAN + GSTIN checks via Setu (see the
 * research/audit report — DigiLocker/Aadhaar is deferred, async and
 * webhook-driven, a later phase). Owns table:
 * academy_kyc_verifications.
 *
 * Imports AcademiesModule for its exported AcademiesRepository (same
 * "resolve my academy from owner_user_id" pattern AcademyOwnerModule
 * already uses) and TrustModule for ConsentService/AuditLogService —
 * this is the one direction of import (marketplace -> trust); trust
 * never imports back, so there's no cycle.
 */
@Module({
  imports: [IdentityModule, AcademiesModule, TrustModule],
  controllers: [
    AcademyVerificationController,
    AcademyAdminVerificationController,
  ],
  providers: [
    AcademyVerificationService,
    AcademyVerificationRepository,
    MockKycProvider,
    SetuKycProvider,
    {
      provide: KYC_PROVIDER,
      inject: [ConfigService, MockKycProvider, SetuKycProvider],
      useFactory: (
        config: ConfigService,
        mock: MockKycProvider,
        setu: SetuKycProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('setu.clientId') &&
          config.get<string>('setu.clientSecret'),
        );
        if (configured) {
          kycLogger.log(
            'Setu configured — real PAN/GSTIN verification enabled',
          );
          return setu;
        }
        kycLogger.warn(
          'SETU_CLIENT_ID/SECRET not set — academy verification uses a mock KYC provider',
        );
        return mock;
      },
    },
  ],
})
export class AcademyVerificationModule {}
