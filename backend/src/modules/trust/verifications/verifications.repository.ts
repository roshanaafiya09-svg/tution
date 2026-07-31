import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { VerificationDocumentType } from './dto/create-verification-upload.dto';
import type { VerificationReviewStatus } from './dto/review-verification.dto';

export interface NewVerification {
  tutorId: string;
  type: VerificationDocumentType;
  documentKey: string;
}

@Injectable()
export class VerificationsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewVerification) {
    return this.db
      .insertInto('tutor_verifications')
      .values({
        id: newId(),
        tutor_id: input.tutorId,
        type: input.type,
        document_key: input.documentKey,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('tutor_verifications')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** The review queue, oldest first — SLA is measured from submission (blueprint §4: <24h). */
  listPending() {
    return this.db
      .selectFrom('tutor_verifications')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('created_at', 'asc')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('tutor_verifications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  review(id: string, status: VerificationReviewStatus, reviewerId: string) {
    return this.db
      .updateTable('tutor_verifications')
      .set({ status, reviewed_by: reviewerId, reviewed_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** True once the tutor has an approved submission of every required document type. */
  async hasApprovedAllTypes(
    tutorId: string,
    requiredTypes: readonly string[],
  ): Promise<boolean> {
    const rows = await this.db
      .selectFrom('tutor_verifications')
      .select('type')
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'approved')
      .execute();
    const approvedTypes = new Set<string>(rows.map((row) => row.type));
    return requiredTypes.every((type) => approvedTypes.has(type));
  }
}
