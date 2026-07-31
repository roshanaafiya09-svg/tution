import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewConsentRecord {
  userId: string;
  consentType: string;
  policyVersion: string;
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class ConsentRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewConsentRecord) {
    return this.db
      .insertInto('consent_records')
      .values({
        id: newId(),
        user_id: input.userId,
        consent_type: input.consentType,
        policy_version: input.policyVersion,
        ip: input.ip,
        user_agent: input.userAgent,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForUser(userId: string) {
    return this.db
      .selectFrom('consent_records')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('granted_at', 'desc')
      .execute();
  }
}
