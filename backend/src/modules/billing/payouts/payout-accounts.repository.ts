import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

@Injectable()
export class PayoutAccountsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByTutorId(tutorId: string) {
    return this.db
      .selectFrom('tutor_payout_accounts')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .executeTakeFirst();
  }
}
