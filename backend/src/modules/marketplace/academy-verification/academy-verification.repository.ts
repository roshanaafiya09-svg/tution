import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { AcademyKycStatus, DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { AcademyVerificationReviewStatus } from './dto/review-academy-verification.dto';

export interface NewAcademyKycVerification {
  academyId: string;
  consentRecordId: string | null;
}

const OPEN_STATUSES: AcademyKycStatus[] = ['pending', 'under_review'];

@Injectable()
export class AcademyVerificationRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewAcademyKycVerification) {
    return this.db
      .insertInto('academy_kyc_verifications')
      .values({
        id: newId(),
        academy_id: input.academyId,
        consent_record_id: input.consentRecordId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** The latest submission for this academy — its status is "the"
   *  current KYC state; no rows at all means NOT_STARTED. */
  findLatestForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_kyc_verifications')
      .selectAll()
      .where('academy_id', '=', academyId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  /** True if this academy already has a submission that isn't resolved
   *  yet — a second `start` while one is pending/under_review would
   *  otherwise create a confusing parallel row instead of a real
   *  resubmission. */
  async hasOpenSubmission(academyId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('academy_kyc_verifications')
      .select('id')
      .where('academy_id', '=', academyId)
      .where('status', 'in', OPEN_STATUSES)
      .executeTakeFirst();
    return !!row;
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_kyc_verifications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** The manual-review queue — everything not yet at a terminal state,
   *  oldest first (same SLA-ordering convention as tutor_verifications'
   *  listPending). */
  listQueue() {
    return this.db
      .selectFrom('academy_kyc_verifications')
      .innerJoin(
        'academies',
        'academies.id',
        'academy_kyc_verifications.academy_id',
      )
      .select([
        'academy_kyc_verifications.id',
        'academy_kyc_verifications.academy_id',
        'academy_kyc_verifications.status',
        'academy_kyc_verifications.reason',
        'academy_kyc_verifications.created_at',
        'academies.name as academy_name',
        'academies.owner_user_id',
      ])
      .where('academy_kyc_verifications.status', 'in', OPEN_STATUSES)
      .orderBy('academy_kyc_verifications.created_at', 'asc')
      .execute();
  }

  review(
    id: string,
    status: AcademyVerificationReviewStatus,
    reviewerId: string,
    reason: string | null,
  ) {
    return this.db
      .updateTable('academy_kyc_verifications')
      .set({
        status,
        reason,
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
