import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';

/**
 * Read/list queries for the Super Admin dashboard only. Deliberately
 * separate from UsersRepository (which is the shared, app-wide identity
 * repository) — everything here is admin-surface-specific and joins
 * across tables no other module needs to join together.
 */
@Injectable()
export class AdminRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** leftJoin, not innerJoin: a tutor can have signed up (users +
   *  user_roles) before ever filling in their profiles_tutor row, and
   *  the admin list must still show them. */
  listTeachers(q?: string) {
    let query = this.db
      .selectFrom('users')
      .innerJoin('user_roles', 'user_roles.user_id', 'users.id')
      .leftJoin('profiles_tutor', 'profiles_tutor.user_id', 'users.id')
      .where('user_roles.role', '=', 'tutor')
      .where('users.deleted_at', 'is', null)
      .select([
        'users.id as id',
        'profiles_tutor.display_name as displayName',
        'users.email as email',
        'users.phone_e164 as phoneE164',
        'users.status as status',
        'profiles_tutor.verification_status as verificationStatus',
        'users.created_at as createdAt',
      ])
      .orderBy('users.created_at', 'desc');

    if (q) {
      query = query.where((eb) =>
        eb.or([
          eb('profiles_tutor.display_name', 'ilike', `%${q}%`),
          eb('users.email', 'ilike', `%${q}%`),
          eb('users.phone_e164', 'ilike', `%${q}%`),
        ]),
      );
    }

    return query.execute();
  }

  listStudents(q?: string) {
    let query = this.db
      .selectFrom('users')
      .innerJoin('user_roles', 'user_roles.user_id', 'users.id')
      .leftJoin('profiles_student', 'profiles_student.user_id', 'users.id')
      .where('user_roles.role', '=', 'student')
      .where('users.deleted_at', 'is', null)
      .select([
        'users.id as id',
        'profiles_student.display_name as displayName',
        'users.email as email',
        'users.phone_e164 as phoneE164',
        'users.status as status',
        'profiles_student.grade_level as gradeLevel',
        'users.created_at as createdAt',
      ])
      .orderBy('users.created_at', 'desc');

    if (q) {
      query = query.where((eb) =>
        eb.or([
          eb('profiles_student.display_name', 'ilike', `%${q}%`),
          eb('users.email', 'ilike', `%${q}%`),
          eb('users.phone_e164', 'ilike', `%${q}%`),
        ]),
      );
    }

    return query.execute();
  }

  /** No profiles_parent table exists in the schema — a parent's identity
   *  is just the user_roles row, so there's no display name to join in
   *  here (unlike teachers/students). linkedChildren is filled in by a
   *  second query in AdminService since it comes from a different table
   *  (parent_child_links) keyed by parent_id, not a 1:1 profile join. */
  listParents(q?: string) {
    let query = this.db
      .selectFrom('users')
      .innerJoin('user_roles', 'user_roles.user_id', 'users.id')
      .where('user_roles.role', '=', 'parent')
      .where('users.deleted_at', 'is', null)
      .select([
        'users.id as id',
        'users.email as email',
        'users.phone_e164 as phoneE164',
        'users.status as status',
        'users.created_at as createdAt',
      ])
      .orderBy('users.created_at', 'desc');

    if (q) {
      query = query.where((eb) =>
        eb.or([
          eb('users.email', 'ilike', `%${q}%`),
          eb('users.phone_e164', 'ilike', `%${q}%`),
        ]),
      );
    }

    return query.execute();
  }

  async countActiveLinkedChildren(parentIds: string[]) {
    if (parentIds.length === 0) return new Map<string, number>();

    const rows = await this.db
      .selectFrom('parent_child_links')
      .select(['parent_id', (eb) => eb.fn.countAll().as('count')])
      .where('parent_id', 'in', parentIds)
      .where('status', '=', 'active')
      .groupBy('parent_id')
      .execute();

    return new Map(rows.map((r) => [r.parent_id, Number(r.count)]));
  }

  async findDisplayName(
    userId: string,
    role: 'tutor' | 'student' | 'parent',
  ): Promise<string | null> {
    if (role === 'tutor') {
      const row = await this.db
        .selectFrom('profiles_tutor')
        .select('display_name')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return row?.display_name ?? null;
    }
    if (role === 'student') {
      const row = await this.db
        .selectFrom('profiles_student')
        .select('display_name')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return row?.display_name ?? null;
    }
    return null;
  }
}
