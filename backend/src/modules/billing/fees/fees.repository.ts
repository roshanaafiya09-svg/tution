import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewFeeEntry {
  tutorId: string;
  studentId: string;
  batchId: string;
  periodLabel: string;
  expectedMinor: number;
}

@Injectable()
export class FeesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  upsert(entry: NewFeeEntry) {
    return this.db
      .insertInto('fee_ledger')
      .values({
        id: newId(),
        tutor_id: entry.tutorId,
        student_id: entry.studentId,
        batch_id: entry.batchId,
        period_label: entry.periodLabel,
        expected_minor: entry.expectedMinor,
      })
      .onConflict((oc) =>
        oc
          .columns(['batch_id', 'student_id', 'period_label'])
          .doUpdateSet({ expected_minor: entry.expectedMinor }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  recordPayment(
    id: string,
    paidMinor: number,
    status: 'partial' | 'paid',
    note: string | null,
  ) {
    return this.db
      .updateTable('fee_ledger')
      .set({
        recorded_paid_minor: paidMinor,
        status,
        paid_at: status === 'paid' ? new Date() : null,
        note,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  waive(id: string, note: string | null) {
    return this.db
      .updateTable('fee_ledger')
      .set({ status: 'waived', note })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Fee entries for one period IN ONE teaching context (null =
   *  Individual, an id = that academy's), taken from the entry's batch. */
  listForPeriod(
    tutorId: string,
    academyId: string | null,
    periodLabel: string,
  ) {
    let query = this.db
      .selectFrom('fee_ledger')
      .innerJoin('batches', 'batches.id', 'fee_ledger.batch_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'fee_ledger.student_id',
      )
      .innerJoin('users', 'users.id', 'fee_ledger.student_id')
      .select([
        'fee_ledger.id',
        'fee_ledger.student_id',
        'fee_ledger.batch_id',
        'fee_ledger.period_label',
        'fee_ledger.expected_minor',
        'fee_ledger.recorded_paid_minor',
        'fee_ledger.currency',
        'fee_ledger.status',
        'fee_ledger.paid_at',
        'fee_ledger.note',
        'batches.title as batch_title',
        'profiles_student.display_name',
        'users.phone_e164',
      ])
      .where('fee_ledger.tutor_id', '=', tutorId)
      .where('fee_ledger.period_label', '=', periodLabel);
    query =
      academyId === null
        ? query.where('batches.academy_id', 'is', null)
        : query.where('batches.academy_id', '=', academyId);
    return query
      .orderBy('fee_ledger.status')
      .orderBy('profiles_student.display_name')
      .execute();
  }

  /** Every fee entry a tutor has recorded, across all periods — feeds data export. */
  listAllForTutor(tutorId: string) {
    return this.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('period_label', 'desc')
      .execute();
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('fee_ledger')
      .innerJoin('batches', 'batches.id', 'fee_ledger.batch_id')
      .select([
        'fee_ledger.id',
        'fee_ledger.period_label',
        'fee_ledger.expected_minor',
        'fee_ledger.recorded_paid_minor',
        'fee_ledger.currency',
        'fee_ledger.status',
        'fee_ledger.paid_at',
        'batches.title as batch_title',
      ])
      .where('fee_ledger.student_id', '=', studentId)
      .orderBy('fee_ledger.period_label', 'desc')
      .execute();
  }

  /** Money totals for a period in ONE teaching context — the "who
   *  hasn't paid" view's header. Individual and Academy money are never
   *  added together. */
  async periodTotals(
    tutorId: string,
    academyId: string | null,
    periodLabel: string,
  ) {
    let query = this.db
      .selectFrom('fee_ledger')
      .innerJoin('batches', 'batches.id', 'fee_ledger.batch_id')
      .select((eb) => [
        eb.fn.sum('fee_ledger.expected_minor').as('expected'),
        eb.fn
          .sum(eb.fn.coalesce('fee_ledger.recorded_paid_minor', eb.lit(0)))
          .as('collected'),
        eb.fn.countAll().as('entries'),
        eb.fn
          .sum(
            eb
              .case()
              .when('fee_ledger.status', '=', 'paid')
              .then(1)
              .else(0)
              .end(),
          )
          .as('paid_count'),
      ])
      .where('fee_ledger.tutor_id', '=', tutorId)
      .where('fee_ledger.period_label', '=', periodLabel);
    query =
      academyId === null
        ? query.where('batches.academy_id', 'is', null)
        : query.where('batches.academy_id', '=', academyId);
    const row = await query.executeTakeFirstOrThrow();

    const expectedMinor = Number(row.expected ?? 0);
    const collectedMinor = Number(row.collected ?? 0);

    return {
      periodLabel,
      expectedMinor,
      collectedMinor,
      outstandingMinor: expectedMinor - collectedMinor,
      entries: Number(row.entries),
      paidCount: Number(row.paid_count ?? 0),
      currency: 'INR',
    };
  }

  /** All-time total across every period — feeds the trial-end
   *  value-recap paywall (blueprint §5), which is about the teacher's own
   *  Individual plan, so only Individual-context fees count. */
  async sumExpectedForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('fee_ledger')
      .innerJoin('batches', 'batches.id', 'fee_ledger.batch_id')
      .select((eb) => eb.fn.sum('fee_ledger.expected_minor').as('total'))
      .where('fee_ledger.tutor_id', '=', tutorId)
      .where('batches.academy_id', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.total ?? 0);
  }

  /** Active students in a batch, for generating a period's ledger rows. */
  listActiveStudentIds(batchId: string) {
    return this.db
      .selectFrom('enrollments')
      .select('student_id')
      .where('batch_id', '=', batchId)
      .where('status', '=', 'active')
      .execute()
      .then((rows) => rows.map((r) => r.student_id));
  }
}
