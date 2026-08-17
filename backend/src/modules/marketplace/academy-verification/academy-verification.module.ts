import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { AcademiesModule } from '../academies/academies.module';
import { TrustModule } from '../../trust/trust.module';
import { AcademyVerificationController } from './academy-verification.controller';
import { AcademyAdminVerificationController } from './academy-admin-verification.controller';
import { AcademyVerificationService } from './academy-verification.service';
import { AcademyVerificationRepository } from './academy-verification.repository';

/**
 * Academy owner identity verification (KYC) — Phase 1: state machine +
 * consent flow, manual review only, no third-party provider wired in
 * yet (see the research/audit report). Owns table:
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
  providers: [AcademyVerificationService, AcademyVerificationRepository],
})
export class AcademyVerificationModule {}
