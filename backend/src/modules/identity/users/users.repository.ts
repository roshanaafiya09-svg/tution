import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB, UserRole } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class UsersRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByPhone(phoneE164: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('phone_e164', '=', phoneE164)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  findByEmail(email: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async createWithRole(phoneE164: string, role: UserRole) {
    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({ id: newId(), phone_e164: phoneE164 })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('user_roles')
        .values({ user_id: user.id, role })
        .execute();

      return user;
    });
  }

  getRoles(userId: string) {
    return this.db
      .selectFrom('user_roles')
      .select('role')
      .where('user_id', '=', userId)
      .execute()
      .then((rows) => rows.map((r) => r.role));
  }
}
