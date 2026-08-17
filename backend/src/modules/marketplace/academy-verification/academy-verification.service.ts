import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademyVerificationRepository } from './academy-verification.repository';
import { AcademiesRepository } from '../academies/academies.repository';
import { ConsentService } from '../../trust/consent/consent.service';
import { AuditLogService } from '../../trust/audit/audit-log.service';
import type { StartAcademyVerificationDto } from './dto/start-academy-verification.dto';
import type { ReviewAcademyVerificationDto } from './dto/review-academy-verification.dto';

const KYC_CONSENT_TYPE = 'academy_kyc';

/**
 * Phase 1: the state machine and consent flow only — no KYC provider is
 * wired in yet (see the research/audit report). `start()` is the whole
 * automated path available today; every other transition is a
 * superadmin/trust_safety review action. Nothing here ever lets a
 * caller set 'verified' on their own submission — that only ever comes
 * from `review()`, gated to the reviewer roles at the controller.
 */
@Injectable()
export class AcademyVerificationService {
  constructor(
    private readonly repository: AcademyVerificationRepository,
    private readonly academiesRepository: AcademiesRepository,
    private readonly consentService: ConsentService,
    private readonly auditLog: AuditLogService,
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

    // Consent is recorded before anything else happens — see
    // ConsentService for the DPDP-oriented shape (versioned, IP +
    // user-agent captured). Nothing is "sent" to a third party in
    // Phase 1 (no provider is wired in yet), but the record still
    // establishes, up front, that the owner agreed before any future
    // provider integration is allowed to act on this submission.
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

    return submission;
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
