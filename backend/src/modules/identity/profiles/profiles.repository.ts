import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

export interface UpsertTutorProfileInput {
  displayName: string;
  headline?: string;
  bio?: string;
  yearsExperience?: number;
  qualifications?: string;
  languages?: string[];
  teachingMode?: 'online' | 'offline' | 'both';
  methodology?: string;
  achievements?: string;
  certifications?: string;
  feeNote?: string;
}

export interface UpsertStudentProfileInput {
  displayName: string;
  gradeLevel?: string;
  curriculumId?: string;
  schoolName?: string;
}

export type TutorVerificationStatus = 'pending' | 'verified' | 'rejected';

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findTutorByUserId(userId: string) {
    return this.db
      .selectFrom('profiles_tutor')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
  }

  findTutorBySlug(slug: string) {
    return this.db
      .selectFrom('profiles_tutor')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
  }

  async slugExists(slug: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('profiles_tutor')
      .select('user_id')
      .where('slug', '=', slug)
      .executeTakeFirst();
    return !!row;
  }

  async upsertTutor(
    userId: string,
    slug: string,
    input: UpsertTutorProfileInput,
  ) {
    const languages = input.languages ? JSON.stringify(input.languages) : null;
    return this.db
      .insertInto('profiles_tutor')
      .values({
        user_id: userId,
        display_name: input.displayName,
        headline: input.headline ?? null,
        bio: input.bio ?? null,
        years_experience: input.yearsExperience ?? null,
        qualifications: input.qualifications ?? null,
        languages,
        teaching_mode: input.teachingMode ?? null,
        methodology: input.methodology ?? null,
        achievements: input.achievements ?? null,
        certifications: input.certifications ?? null,
        fee_note: input.feeNote ?? null,
        slug,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          display_name: input.displayName,
          headline: input.headline ?? null,
          bio: input.bio ?? null,
          years_experience: input.yearsExperience ?? null,
          qualifications: input.qualifications ?? null,
          languages,
          teaching_mode: input.teachingMode ?? null,
          methodology: input.methodology ?? null,
          achievements: input.achievements ?? null,
          certifications: input.certifications ?? null,
          fee_note: input.feeNote ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Called from TrustModule once verification review lands on a decision. */
  setTutorVerificationStatus(userId: string, status: TutorVerificationStatus) {
    return this.db
      .updateTable('profiles_tutor')
      .set({ verification_status: status })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Avatar upload writes the object key immediately (before the client's
   *  PUT completes), same eventually-consistent tradeoff MaterialsService
   *  accepts for course materials — kept only here, not duplicated per
   *  caller. Passing null clears it (used by the remove-photo flow). */
  setTutorAvatarObjectKey(userId: string, objectKey: string | null) {
    return this.db
      .updateTable('profiles_tutor')
      .set({ avatar_object_key: objectKey })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findStudentByUserId(userId: string) {
    return this.db
      .selectFrom('profiles_student')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
  }

  async upsertStudent(userId: string, input: UpsertStudentProfileInput) {
    return this.db
      .insertInto('profiles_student')
      .values({
        user_id: userId,
        display_name: input.displayName,
        grade_level: input.gradeLevel ?? null,
        curriculum_id: input.curriculumId ?? null,
        school_name: input.schoolName ?? null,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          display_name: input.displayName,
          grade_level: input.gradeLevel ?? null,
          curriculum_id: input.curriculumId ?? null,
          school_name: input.schoolName ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
