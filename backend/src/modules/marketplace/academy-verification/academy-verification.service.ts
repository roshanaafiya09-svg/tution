import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademyVerificationRepository } from './academy-verification.repository';
import { AcademiesRepository } from '../academies/academies.repository';
import { ConsentService } from '../../trust/consent/consent.service';
import { AuditLogService } from '../../trust/audit/audit-log.service';
import {
  KYC_PROVIDER,
  type KycProvider,
} from './providers/kyc-provider.interface';
import { KycProviderUnavailableError } from './providers/setu-kyc.provider';
import type { StartAcademyVerificationDto } from './dto/start-academy-verification.dto';
import type { ReviewAcademyVerificationDto } from './dto/review-academy-verification.dto';

const KYC_CONSENT_TYPE = 'academy_kyc';
const PAN_CHECK_REASON =
  'Academy owner identity verification for Scholar academy onboarding';

/**
 * `start()` runs the automated PAN (owner identity) + optional GSTIN
 * (academy/business — see the research report's "Important Distinction")
 * checks synchronously against Setu and settles the submission
 * immediately: verified only on an unambiguous pass, needs_manual_review
 * for anything else, including a failed/unreachable provider call —
 * never automatically rejected, since a provider hiccup isn't evidence
 * of anything. Every other transition (approving a manual-review
 * submission, rejecting, etc.) is a superadmin/trust_safety `review()`
 * action. Nothing here ever lets a caller set 'verified' on their own
 * submission directly — that only ever comes out of the automated
 * check's own result or a reviewer's decision.
 */
@Injectable()
export class AcademyVerificationService {
  constructor(
    private readonly repository: AcademyVerificationRepository,
    private readonly academiesRepository: AcademiesRepository,
    private readonly consentService: ConsentService,
    private readonly auditLog: AuditLogService,
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /** NOT_STARTED (no submission exists) plus the five states a real
   *  submission can be in — one flat status string, exactly the state
   *  machine from the audit report. */
  async getMyStatus(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const latest = await this.repository.findLatestForAcademy(academy.id);
    return {
      status: latest?.status ?? ('not_started' as const),
      reason: latest?.reason ?? null,
      submittedAt: latest?.created_at ?? null,
      reviewedAt: latest?.reviewed_at ?? null,
    };
  }

  async start(
    ownerUserId: string,
    dto: StartAcademyVerificationDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);

    if (await this.repository.hasOpenSubmission(academy.id)) {
      throw new BadRequestException(
        'A verification submission is already in progress for this academy.',
      );
    }

    // Consent is recorded before anything is sent to Setu — see
    // ConsentService for the DPDP-oriented shape (versioned, IP +
    // user-agent captured). The PAN/GSTIN values themselves are never
    // persisted on our side (see AutomatedResult / the migration 0032
    // schema) — they're used for this one provider call and discarded,
    // not stored, matching the data-minimization guidance in the
    // research report.
    const consent = await this.consentService.record(
      ownerUserId,
      { consentType: KYC_CONSENT_TYPE, policyVersion: dto.policyVersion },
      ip,
      userAgent,
    );

    const submission = await this.repository.create({
      academyId: academy.id,
      consentRecordId: consent.id,
    });

    await this.auditLog.record({
      actorId: ownerUserId,
      actorRole: 'academy',
      action: 'academy_kyc.start',
      entity: 'academy_kyc_verifications',
      entityId: submission.id,
      diff: { academyId: academy.id, policyVersion: dto.policyVersion },
      ip,
    });

    const outcome = await this.runAutomatedCheck(dto.pan, dto.gstin);
    const resolved = await this.repository.recordAutomatedResult(
      submission.id,
      {
        status: outcome.status,
        provider: this.kycProvider.name,
        providerVerificationId: null,
        resultCode: outcome.resultCode,
        reason: outcome.reason,
      },
    );

    await this.auditLog.record({
      actorId: null,
      actorRole: 'system',
      action: `academy_kyc.auto_${outcome.status}`,
      entity: 'academy_kyc_verifications',
      entityId: submission.id,
      diff: { provider: this.kycProvider.name, resultCode: outcome.resultCode },
    });

    if (outcome.status === 'verified') {
      await this.academiesRepository.setVerificationStatus(
        academy.id,
        'verified',
      );
    }

    return resolved;
  }

  /** PAN must clear on its own; GSTIN (when supplied) must independently
   *  clear too — either one falling short means a human needs to look
   *  at it, never an automatic rejection. A provider that couldn't be
   *  reached at all lands here too, not as a false negative. */
  private async runAutomatedCheck(
    pan: string,
    gstin: string | undefined,
  ): Promise<{
    status: 'verified' | 'needs_manual_review';
    resultCode: string;
    reason: string | null;
  }> {
    try {
      const panResult = await this.kycProvider.verifyPan(pan, PAN_CHECK_REASON);
      if (!panResult.verified) {
        return {
          status: 'needs_manual_review',
          resultCode: panResult.resultCode,
          reason: `Owner PAN could not be automatically verified (${panResult.resultCode}).`,
        };
      }

      if (gstin) {
        const gstinResult = await this.kycProvider.verifyGstin(gstin);
        if (!gstinResult.verified || !gstinResult.active) {
          return {
            status: 'needs_manual_review',
            resultCode: gstinResult.resultCode,
            reason: `Academy GSTIN could not be automatically verified (${gstinResult.resultCode}).`,
          };
        }
      }

      return { status: 'verified', resultCode: 'auto_verified', reason: null };
    } catch (err) {
      if (err instanceof KycProviderUnavailableError) {
        return {
          status: 'needs_manual_review',
          resultCode: 'provider_unavailable',
          reason:
            'Automated verification was temporarily unavailable — flagged for manual review.',
        };
      }
      throw err;
    }
  }

  listQueue() {
    return this.repository.listQueue();
  }

  async review(
    reviewerId: string,
    reviewerRole: string,
    id: string,
    dto: ReviewAcademyVerificationDto,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Verification submission not found');
    }
    if (existing.status !== 'pending' && existing.status !== 'under_review') {
      throw new BadRequestException(
        `This submission was already resolved (${existing.status}).`,
      );
    }
    if (
      (dto.status === 'rejected' || dto.status === 'needs_manual_review') &&
      !dto.reason
    ) {
      throw new BadRequestException(
        'A reason is required when rejecting or flagging a submission for manual review.',
      );
    }

    const updated = await this.repository.review(
      id,
      dto.status,
      reviewerId,
      dto.reason ?? null,
    );

    await this.auditLog.record({
      actorId: reviewerId,
      actorRole: reviewerRole,
      action: `academy_kyc.${dto.status}`,
      entity: 'academy_kyc_verifications',
      entityId: id,
      diff: { status: dto.status, reason: dto.reason ?? null },
    });

    // The existing 3-state academies.verification_status is untouched
    // by under_review/needs_manual_review — it already defaults to
    // 'pending', which is still accurate while KYC is unresolved. Only
    // a terminal outcome here is worth syncing, so discovery gating and
    // the existing profile-page badge (both read this column, not the
    // new table) reflect the real result without any change to their
    // own code.
    if (dto.status === 'verified' || dto.status === 'rejected') {
      await this.academiesRepository.setVerificationStatus(
        existing.academy_id,
        dto.status,
      );
    }

    return updated;
  }
}
