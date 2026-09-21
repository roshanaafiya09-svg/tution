import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

/** Mirror of SubscriptionsRepository for the ACADEMY's plan
 *  (academy_subscriptions). Kept separate from the teacher's Individual
 *  plan on purpose — see migration 0041. */
@Injectable()
export class AcademySubscriptionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByAcademyId(academyId: string) {
    return this.db
      .selectFrom('academy_subscriptions')
      .selectAll()
      .where('academy_id', '=', academyId)
      .executeTakeFirst();
  }

  /** Idempotent: a concurrent first-request race just re-fetches the row
   *  the other request created, thanks to unique(academy_id). */
  async createTrial(academyId: string, trialEndsAt: Date) {
    const inserted = await this.db
      .insertInto('academy_subscriptions')
      .values({
        id: newId(),
        academy_id: academyId,
        trial_ends_at: trialEndsAt,
      })
      .onConflict((oc) => oc.column('academy_id').doNothing())
      .returningAll()
      .executeTakeFirst();
    return inserted ?? (await this.findByAcademyId(academyId))!;
  }
}
