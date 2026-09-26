import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { VerificationsRepository } from './verifications.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { ProfilesService } from '../../identity/profiles/profiles.service';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  CreateVerificationUploadDto,
  MAX_VERIFICATION_BYTES,
  VERIFICATION_DOCUMENT_TYPES,
} from './dto/create-verification-upload.dto';
import type { ReviewVerificationDto } from './dto/review-verification.dto';

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

@Injectable()
export class VerificationsService {
  private readonly logger = new Logger(VerificationsService.name);

  constructor(
    private readonly repository: VerificationsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly profilesService: ProfilesService,
    private readonly auditLog: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Step 1 of upload: record the pending verification and hand back a
   * presigned URL, same two-step contract as materials (blueprint §6 —
   * the document never passes through the API).
   */
  async createUploadUrl(tutorId: string, dto: CreateVerificationUploadDto) {
    if (dto.sizeBytes > MAX_VERIFICATION_BYTES) {
      throw new BadRequestException(
        `File is too large (max ${Math.floor(MAX_VERIFICATION_BYTES / 1024 / 1024)}MB)`,
      );
    }

    const objectKey = `verifications/${tutorId}/${dto.type}-${randomBytes(8).toString('hex')}${
      MIME_EXTENSIONS[dto.mime] ?? ''
    }`;

    const verification = await this.repository.create({
      tutorId,
      type: dto.type,
      documentKey: objectKey,
    });

    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { verification, upload };
  }

  listOwn(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  listQueue() {
    return this.repository.listPending();
  }

  /** The owning tutor, or a trust & safety reviewer, may view the document. */
  async getDownloadUrl(userId: string, isReviewer: boolean, id: string) {
    const verification = await this.repository.findById(id);
    if (!verification) throw new NotFoundException('Verification not found');
    if (!isReviewer && verification.tutor_id !== userId) {
      throw new ForbiddenException('Not your verification document');
    }
    return {
      url: await this.storage.createDownloadUrl(verification.document_key),
    };
  }

  async review(
    reviewerId: string,
    reviewerRole: string,
    id: string,
    dto: ReviewVerificationDto,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Verification not found');
    if (existing.status !== 'pending') {
      throw new BadRequestException('Verification was already reviewed');
    }

    const updated = await this.repository.review(id, dto.status, reviewerId);

    await this.auditLog.record({
      actorId: reviewerId,
      actorRole: reviewerRole,
      action: `verification.${dto.status}`,
      entity: 'tutor_verifications',
      entityId: id,
      diff: { status: dto.status, note: dto.note ?? null },
    });

    let nowVerified = false;
    if (dto.status === 'approved') {
      // Blueprint §4: "ID + qualification upload" — both document types
      // need an approved submission before the badge flips on.
      const allApproved = await this.repository.hasApprovedAllTypes(
        existing.tutor_id,
        VERIFICATION_DOCUMENT_TYPES,
      );
      if (allApproved) {
        await this.profilesService.setVerificationStatus(
          existing.tutor_id,
          'verified',
        );
        nowVerified = true;
      }
    } else {
      // A rejected resubmission never revokes an already-verified badge —
      // re-verification-on-expiry (blueprint §9) is a separate Phase 1+
      // flow, not implemented here.
      const profile = await this.profilesService.getTutorProfile(
        existing.tutor_id,
      );
      if (profile && profile.verification_status !== 'verified') {
        await this.profilesService.setVerificationStatus(
          existing.tutor_id,
          'rejected',
        );
      }
    }

    await this.notifyOutcome(existing, dto, nowVerified);

    return updated;
  }

  /** Tells the tutor the reviewer's decision on one of their documents.
   *  Best-effort: the review is already saved, so a delivery failure must
   *  not fail it. The dedupe key makes a repeated call a no-op. */
  private async notifyOutcome(
    existing: { id: string; tutor_id: string; type: string },
    dto: ReviewVerificationDto,
    nowVerified: boolean,
  ): Promise<void> {
    const document =
      existing.type === 'id_proof' ? 'ID proof' : 'qualification document';
    const approved = dto.status === 'approved';
    try {
      await this.notificationsService.notify({
        userIds: [existing.tutor_id],
        type: approved ? 'verification_approved' : 'verification_rejected',
        title: nowVerified
          ? "You're verified"
          : approved
            ? `Your ${document} was approved`
            : `Your ${document} was not approved`,
        body: nowVerified
          ? 'Your documents have been approved and your profile now shows the verified badge.'
          : approved
            ? 'It has been approved. Any remaining documents are still being reviewed.'
            : dto.note
              ? `Reviewer note: ${dto.note}`
              : 'You can upload a new document from your verification page.',
        payload: { verificationId: existing.id, status: dto.status },
        dedupeKey: `verification:${existing.id}:${dto.status}`,
      });
    } catch (err) {
      this.logger.warn(
        `Could not notify tutor of verification outcome ${existing.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
