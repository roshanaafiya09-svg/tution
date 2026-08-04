import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class ParentPremiumRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByParentId(parentId: string) {
    return this.db
      .selectFrom('parent_premium_subscriptions')
      .selectAll()
      .where('parent_id', '=', parentId)
      .executeTakeFirst();
  }

  /** Idempotent: a concurrent first-request race just re-fetches the row
   *  the other request created, thanks to the unique(parent_id) constraint.
   *  No trial — the row starts 'inactive', unlike tutor subscriptions'
   *  createTrial. */
  async createInactive(parentId: string) {
    const inserted = await this.db
      .insertInto('parent_premium_subscriptions')
      .values({ id: newId(), parent_id: parentId })
      .onConflict((oc) => oc.column('parent_id').doNothing())
      .returningAll()
      .executeTakeFirst();
    return inserted ?? (await this.findByParentId(parentId))!;
  }

  findById(id: string) {
    return this.db
      .selectFrom('parent_premium_subscriptions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Called on payment capture — moves a subscription to active for one
   *  more plan period. */
  activate(
    id: string,
    planId: string,
    currentPeriodEnd: Date,
    provider: string,
    providerRef: string,
  ) {
    return this.db
      .updateTable('parent_premium_subscriptions')
      .set({
        status: 'active',
        plan_id: planId,
        current_period_end: currentPeriodEnd,
        provider,
        provider_ref: providerRef,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
