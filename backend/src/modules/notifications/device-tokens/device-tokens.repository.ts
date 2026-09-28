import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class DeviceTokensRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  upsert(userId: string, token: string, platform: 'android' | 'ios') {
    return this.db
      .insertInto('device_tokens')
      .values({ id: newId(), user_id: userId, token, platform })
      .onConflict((oc) =>
        oc.column('token').doUpdateSet({
          user_id: userId,
          platform,
          last_seen_at: new Date(),
        }),
      )
      .execute()
      .then(() => undefined);
  }

  /** Detach a device from ONE user — scoped by user_id so a caller can never
   *  remove someone else's token, even if they know its value. */
  deleteForUser(userId: string, token: string) {
    return this.db
      .deleteFrom('device_tokens')
      .where('user_id', '=', userId)
      .where('token', '=', token)
      .execute()
      .then(() => undefined);
  }

  findTokensForUsers(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve([]);

    return this.db
      .selectFrom('device_tokens')
      .select(['user_id', 'token'])
      .where('user_id', 'in', userIds)
      .execute();
  }

  deleteTokens(tokens: string[]) {
    if (tokens.length === 0) return Promise.resolve();

    return this.db
      .deleteFrom('device_tokens')
      .where('token', 'in', tokens)
      .execute()
      .then(() => undefined);
  }
}
