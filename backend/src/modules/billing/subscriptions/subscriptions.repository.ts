import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class SubscriptionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByTutorId(tutorId: string) {
    return this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .executeTakeFirst();
  }

  /** Idempotent: a concurrent first-request race just re-fetches the row
   *  the other request created, thanks to the unique(tutor_id) constraint. */
  async createTrial(tutorId: string, trialEndsAt: Date) {
    const inserted = await this.db
      .insertInto('subscriptions')
      .values({ id: newId(), tutor_id: tutorId, trial_ends_at: trialEndsAt })
      .onConflict((oc) => oc.column('tutor_id').doNothing())
      .returningAll()
      .executeTakeFirst();
    return inserted ?? (await this.findByTutorId(tutorId))!;
  }
}
