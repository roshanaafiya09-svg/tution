import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AcademiesRepository } from './academies.repository';
import { AcademyLocationsRepository } from './academy-locations.repository';
import { AcademyPhotosRepository } from './academy-photos.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AcademyContactRequestsRepository } from './academy-contact-requests.repository';
import { UsersRepository } from '../../identity/users/users.repository';
import { randomSlugSuffix, slugify } from '../../identity/profiles/slug.util';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import type { UpsertAcademyDto } from './dto/upsert-academy.dto';
import {
  AcademyImageUploadUrlDto,
  MAX_ACADEMY_IMAGE_BYTES,
} from './dto/academy-image-upload-url.dto';
import type { AddMembershipDto } from './dto/add-membership.dto';

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Superadmin-only academy management — no self-serve Academy Dashboard/
 * owner role exists yet (see migration 0030's doc comment), so this is
 * the only way to populate real academy data until one does. Mirrors
 * ProfilesService's avatar-upload pattern for logo/cover/photo uploads,
 * and AdminService's list/search shape for the admin listing.
 */
@Injectable()
export class AcademyAdminService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyLocationsRepository: AcademyLocationsRepository,
    private readonly academyPhotosRepository: AcademyPhotosRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academyContactRequestsRepository: AcademyContactRequestsRepository,
    private readonly usersRepository: UsersRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  listAll(q?: string) {
    return this.academiesRepository.listAll(q);
  }

  async create(dto: UpsertAcademyDto) {
    const slug = await this.generateUniqueSlug(dto.name);
    const academy = await this.academiesRepository.create(slug, dto);
    await this.upsertLocationIfProvided(academy.id, dto);
    return academy;
  }

  async update(id: string, dto: UpsertAcademyDto) {
    await this.getOrThrow(id);
    const updated = await this.academiesRepository.update(id, dto);
    await this.upsertLocationIfProvided(id, dto);
    return updated;
  }

  setVerificationStatus(
    id: string,
    status: 'pending' | 'verified' | 'rejected',
  ) {
    return this.academiesRepository.setVerificationStatus(id, status);
  }

  async createLogoUploadUrl(academyId: string, dto: AcademyImageUploadUrlDto) {
    this.assertSize(dto.sizeBytes);
    const academy = await this.getOrThrow(academyId);
    if (academy.logo_object_key) {
      await this.storage.delete(academy.logo_object_key);
    }
    const objectKey = `academies/${academyId}/logo-${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    await this.academiesRepository.setLogoObjectKey(academyId, objectKey);
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload };
  }

  async createCoverUploadUrl(academyId: string, dto: AcademyImageUploadUrlDto) {
    this.assertSize(dto.sizeBytes);
    const academy = await this.getOrThrow(academyId);
    if (academy.cover_object_key) {
      await this.storage.delete(academy.cover_object_key);
    }
    const objectKey = `academies/${academyId}/cover-${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    await this.academiesRepository.setCoverObjectKey(academyId, objectKey);
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload };
  }

  async addPhoto(academyId: string, dto: AcademyImageUploadUrlDto) {
    this.assertSize(dto.sizeBytes);
    await this.getOrThrow(academyId);
    const objectKey = `academies/${academyId}/photos/${randomBytes(8).toString('hex')}${
      IMAGE_MIME_EXTENSIONS[dto.mime] ?? ''
    }`;
    const existing =
      await this.academyPhotosRepository.listForAcademy(academyId);
    const photo = await this.academyPhotosRepository.add(
      academyId,
      objectKey,
      dto.caption ?? null,
      existing.length,
    );
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { upload, photoId: photo.id };
  }

  async removePhoto(photoId: string): Promise<void> {
    const photo = await this.academyPhotosRepository.findById(photoId);
    if (!photo) throw new NotFoundException('Photo not found');
    await this.storage.delete(photo.object_key);
    await this.academyPhotosRepository.remove(photoId);
  }

  async addMembership(academyId: string, dto: AddMembershipDto) {
    await this.getOrThrow(academyId);
    const roles = await this.usersRepository.getRoles(dto.tutorId);
    if (!roles.includes('tutor')) {
      throw new BadRequestException('That account is not a tutor');
    }
    const existing =
      await this.academyMembershipsRepository.findActiveMembership(
        academyId,
        dto.tutorId,
      );
    if (existing) {
      throw new BadRequestException(
        'This tutor is already an active member of this academy',
      );
    }
    return this.academyMembershipsRepository.create(academyId, dto.tutorId);
  }

  async removeMembership(membershipId: string) {
    const membership =
      await this.academyMembershipsRepository.findById(membershipId);
    if (!membership) throw new NotFoundException('Membership not found');
    return this.academyMembershipsRepository.markLeft(membershipId);
  }

  listContactRequests(academyId: string) {
    return this.academyContactRequestsRepository.listForAcademy(academyId);
  }

  async markContactRequestRead(id: string) {
    const request = await this.academyContactRequestsRepository.findById(id);
    if (!request) throw new NotFoundException('Contact request not found');
    return this.academyContactRequestsRepository.markRead(id);
  }

  private assertSize(sizeBytes: number): void {
    if (sizeBytes > MAX_ACADEMY_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image is too large (max ${Math.floor(MAX_ACADEMY_IMAGE_BYTES / 1024 / 1024)}MB)`,
      );
    }
  }

  private async getOrThrow(id: string) {
    const academy = await this.academiesRepository.findById(id);
    if (!academy) throw new NotFoundException('Academy not found');
    return academy;
  }

  private async upsertLocationIfProvided(
    academyId: string,
    dto: UpsertAcademyDto,
  ): Promise<void> {
    if (dto.city && dto.lat != null && dto.lng != null) {
      await this.academyLocationsRepository.upsert(
        academyId,
        dto.city,
        dto.areaLabel ?? null,
        dto.lat,
        dto.lng,
      );
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'academy';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomSlugSuffix()}`;
      if (!(await this.academiesRepository.slugExists(candidate))) {
        return candidate;
      }
    }
    return `${base}-${randomSlugSuffix()}-${Date.now()}`;
  }
}
