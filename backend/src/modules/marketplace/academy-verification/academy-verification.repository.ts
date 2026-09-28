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

export interface AutomatedResult {
  status: 'verified' | 'needs_manual_review';
  provider: string;
  providerVerificationId: string | null;
  resultCode: string;
  reason: string | null;
}

/** Blocks a NEW owner submission while one is still being decided. Note
 *  needs_manual_review is deliberately NOT here: the owner UI lets them
 *  resubmit from that state (a corrected PAN/GSTIN re-runs the automated
 *  check), keeping the earlier row as history. */
const OPEN_STATUSES: AcademyKycStatus[] = ['pending', 'under_review'];

/** What a reviewer can act on. An automated check that couldn't settle a
 *  submission leaves it needs_manual_review — that is precisely the case a
 *  human has to pick up, so it must be listed and reviewable. */
export const REVIEWABLE_STATUSES: AcademyKycStatus[] = [
  'pending',
  'under_review',
  'needs_manual_review',
];

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

  /** The manual-review queue — every academy whose CURRENT submission is
   *  still awaiting a reviewer (REVIEWABLE_STATUSES), oldest first (same
   *  SLA-ordering convention as tutor_verifications' listPending). Only the
   *  latest submission per academy is listed: once an owner resubmits, the
   *  earlier row is history, not a second thing to review. */
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
      .where('academy_kyc_verifications.status', 'in', REVIEWABLE_STATUSES)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('academy_kyc_verifications as newer')
              .select('newer.id')
              .whereRef(
                'newer.academy_id',
                '=',
                'academy_kyc_verifications.academy_id',
              )
              .whereRef(
                'newer.created_at',
                '>',
                'academy_kyc_verifications.created_at',
              ),
          ),
        ),
      )
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

  /** Records the outcome of the automated PAN/GSTIN check — deliberately
   *  a separate method from review(): reviewed_by/reviewed_at stay null
   *  here, since no human made this decision, and the queue (listQueue,
   *  filtered to OPEN_STATUSES) already excludes 'verified' so an
   *  auto-approved submission doesn't show up asking for a review that
   *  already happened. */
  recordAutomatedResult(id: string, result: AutomatedResult) {
    return this.db
      .updateTable('academy_kyc_verifications')
      .set({
        status: result.status,
        provider: result.provider,
        provider_verification_id: result.providerVerificationId,
        result_code: result.resultCode,
        reason: result.reason,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
