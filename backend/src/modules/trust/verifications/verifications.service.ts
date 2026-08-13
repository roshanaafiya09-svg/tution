import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VerificationsRepository } from './verifications.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { ProfilesService } from '../../identity/profiles/profiles.service';
import { AuditLogService } from '../audit/audit-log.service';
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
  constructor(
    private readonly repository: VerificationsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly profilesService: ProfilesService,
    private readonly auditLog: AuditLogService,
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

    return updated;
  }
}
