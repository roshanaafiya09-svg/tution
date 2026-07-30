import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(userId: string, jti: string, expiresAt: Date, deviceLabel?: string) {
    return this.db
      .insertInto('refresh_tokens')
      .values({
        id: newId(),
        user_id: userId,
        jti,
        device_label: deviceLabel ?? null,
        expires_at: expiresAt,
      })
      .execute();
  }

  findActiveByJti(jti: string) {
    return this.db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('jti', '=', jti)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
  }

  revoke(jti: string) {
    return this.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('jti', '=', jti)
      .execute();
  }

  revokeAllForUser(userId: string) {
    return this.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
