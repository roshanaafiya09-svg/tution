import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

export interface UpsertTutorProfileInput {
  displayName: string;
  headline?: string;
  bio?: string;
  yearsExperience?: number;
}

export interface UpsertStudentProfileInput {
  displayName: string;
  gradeLevel?: string;
  curriculumId?: string;
  schoolName?: string;
}

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
    return this.db
      .insertInto('profiles_tutor')
      .values({
        user_id: userId,
        display_name: input.displayName,
        headline: input.headline ?? null,
        bio: input.bio ?? null,
        years_experience: input.yearsExperience ?? null,
        slug,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          display_name: input.displayName,
          headline: input.headline ?? null,
          bio: input.bio ?? null,
          years_experience: input.yearsExperience ?? null,
        }),
      )
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
