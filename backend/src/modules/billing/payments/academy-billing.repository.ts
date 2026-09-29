import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

/**
 * The one lookup billing needs about academies: which academy does this user
 * own? Read-only and local to billing on purpose — importing the marketplace
 * modules here would create a module cycle. The academy id is ALWAYS derived
 * from the authenticated user; a client-supplied academy id is never trusted.
 */
@Injectable()
export class AcademyBillingRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByOwner(ownerUserId: string) {
    return this.db
      .selectFrom('academies')
      .select(['id', 'name', 'owner_user_id'])
      .where('owner_user_id', '=', ownerUserId)
      .executeTakeFirst();
  }
}
