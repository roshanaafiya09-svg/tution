import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProfilesRepository,
  TutorVerificationStatus,
  UpsertStudentProfileInput,
  UpsertTutorProfileInput,
} from './profiles.repository';
import { randomSlugSuffix, slugify } from './slug.util';
import { SubscriptionsService } from '../../billing/subscriptions/subscriptions.service';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import {
  AvatarUploadUrlDto,
  MAX_AVATAR_BYTES,
} from './dto/avatar-upload-url.dto';

const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upsertTutorProfile(userId: string, input: UpsertTutorProfileInput) {
    const existing = await this.profilesRepository.findTutorByUserId(userId);
    const slug =
      existing?.slug ?? (await this.generateUniqueSlug(input.displayName));
    const profile = await this.profilesRepository.upsertTutor(
      userId,
      slug,
      input,
    );
    if (!existing) {
      // First time this tutor has a profile — starts their 90-day trial
      // (blueprint §5). Idempotent via unique(tutor_id), so a retry is safe.
      await this.subscriptionsService.startTrial(userId);
    }
    return this.withAvatarUrl(profile);
  }

  async getTutorProfile(userId: string) {
    const profile = await this.profilesRepository.findTutorByUserId(userId);
    return profile ? this.withAvatarUrl(profile) : profile;
  }

  /** Owned by TrustModule's verification review flow — kept here because
   *  profiles_tutor belongs to IdentityModule (no cross-module DB access). */
  setVerificationStatus(userId: string, status: TutorVerificationStatus) {
    return this.profilesRepository.setTutorVerificationStatus(userId, status);
  }

  async getPublicTutorProfile(slug: string) {
    const profile = await this.profilesRepository.findTutorBySlug(slug);
    if (!profile) {
      throw new NotFoundException('Tutor profile not found');
    }
    return this.withAvatarUrl(profile);
  }

  /**
   * Step 1 of the avatar upload: record the new object key and hand back
   * a presigned URL, mirroring MaterialsService.createUploadUrl exactly
   * — the client PUTs the bytes straight to storage next. Best-effort
   * deletes the previous photo (if any) so replacing a photo doesn't
   * leak orphaned objects.
   */
  async createAvatarUploadUrl(tutorId: string, dto: AvatarUploadUrlDto) {
    if (dto.sizeBytes > MAX_AVATAR_BYTES) {
      throw new BadRequestException(
        `Photo is too large (max ${Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)}MB)`,
      );
    }

    const previous = await this.profilesRepository.findTutorByUserId(tutorId);
    if (previous?.avatar_object_key) {
      await this.storage.delete(previous.avatar_object_key);
    }

    const objectKey = `avatars/${tutorId}/${randomBytes(8).toString('hex')}${
      AVATAR_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    await this.profilesRepository.setTutorAvatarObjectKey(tutorId, objectKey);
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload };
  }

  async removeAvatar(tutorId: string): Promise<void> {
    const profile = await this.profilesRepository.findTutorByUserId(tutorId);
    if (profile?.avatar_object_key) {
      await this.storage.delete(profile.avatar_object_key);
    }
    await this.profilesRepository.setTutorAvatarObjectKey(tutorId, null);
  }

  private async withAvatarUrl<T extends { avatar_object_key: string | null }>(
    profile: T,
  ): Promise<T & { avatarUrl: string | null }> {
    const avatarUrl = profile.avatar_object_key
      ? await this.storage.createDownloadUrl(profile.avatar_object_key)
      : null;
    return { ...profile, avatarUrl };
  }

  upsertStudentProfile(userId: string, input: UpsertStudentProfileInput) {
    return this.profilesRepository.upsertStudent(userId, input);
  }

  getStudentProfile(userId: string) {
    return this.profilesRepository.findStudentByUserId(userId);
  }

  private async generateUniqueSlug(displayName: string): Promise<string> {
    const base = slugify(displayName) || 'tutor';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomSlugSuffix()}`;
      if (!(await this.profilesRepository.slugExists(candidate))) {
        return candidate;
      }
    }
    return `${base}-${randomSlugSuffix()}-${Date.now()}`;
  }
}
