import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class OtpRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(phoneE164: string, codeHash: string, expiresAt: Date) {
    return this.db
      .insertInto('otp_challenges')
      .values({
        id: newId(),
        phone_e164: phoneE164,
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  countRecentRequests(phoneE164: string, since: Date) {
    return this.db
      .selectFrom('otp_challenges')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('phone_e164', '=', phoneE164)
      .where('created_at', '>=', since)
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.count));
  }

  findLatestActive(phoneE164: string) {
    return this.db
      .selectFrom('otp_challenges')
      .selectAll()
      .where('phone_e164', '=', phoneE164)
      .where('consumed_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  incrementAttempts(id: string) {
    return this.db
      .updateTable('otp_challenges')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', id)
      .execute();
  }

  consume(id: string) {
    return this.db
      .updateTable('otp_challenges')
      .set({ consumed_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}
