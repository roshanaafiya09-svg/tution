import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ProfilesRepository,
  TutorVerificationStatus,
  UpsertStudentProfileInput,
  UpsertTutorProfileInput,
} from './profiles.repository';
import { randomSlugSuffix, slugify } from './slug.util';

@Injectable()
export class ProfilesService {
  constructor(private readonly profilesRepository: ProfilesRepository) {}

  async upsertTutorProfile(userId: string, input: UpsertTutorProfileInput) {
    const existing = await this.profilesRepository.findTutorByUserId(userId);
    const slug =
      existing?.slug ?? (await this.generateUniqueSlug(input.displayName));
    return this.profilesRepository.upsertTutor(userId, slug, input);
  }

  getTutorProfile(userId: string) {
    return this.profilesRepository.findTutorByUserId(userId);
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
    return profile;
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
