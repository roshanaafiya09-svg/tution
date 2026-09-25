import { Inject, Injectable } from '@nestjs/common';
import { sql, type ExpressionBuilder, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import { ONE_TIME_PERIOD_LABEL, periodLabelsDuringMonth } from './fee-period';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Which ledger rows a period view shows. Asked for a month ('2026-08'),
 * that's everything billed for that month, the quarter containing it
 * ('2026-Q3'), and one-time fees generated during that month (Asia/Kolkata)
 * — a one-time fee has no billing month of its own, so it appears in the
 * month it was raised rather than in every month or none. Asked for any
 * other label ('2026-Q3', 'one-time'), exactly that label.
 */
function periodFilter(
  eb: ExpressionBuilder<DB, 'fee_ledger'>,
  periodLabel: string,
) {
  if (!MONTH.test(periodLabel)) {
    return eb('fee_ledger.period_label', '=', periodLabel);
  }
  return eb.or([
    eb('fee_ledger.period_label', 'in', periodLabelsDuringMonth(periodLabel)),
    eb.and([
      eb('fee_ledger.period_label', '=', ONE_TIME_PERIOD_LABEL),
      eb(
        sql<string>`to_char(fee_ledger.created_at at time zone 'Asia/Kolkata', 'YYYY-MM')`,
        '=',
        periodLabel,
      ),
    ]),
  ]);
}

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

  /**
   * Creates the row for this student + billing period, or — if it already
   * exists — re-prices it ONLY while it is still untouched ('due'). A row
   * that is 'partial', 'paid' or 'waived' is financial history: a payment
   * or waiver was recorded against its expected_minor, so re-generating
   * (e.g. after the batch fee changed) must never silently rewrite that
   * basis — before this guard a paid ₹1,000 row could become "paid" with
   * expected ₹2,500 and only ₹1,000 recorded. The conditional
   * DO UPDATE ... WHERE is evaluated under the row lock, so a payment
   * racing a regeneration can't slip between a check and the write.
   * Returns the row as it now stands either way.
   */
  async upsert(entry: NewFeeEntry) {
    const written = await this.db
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
          .doUpdateSet({ expected_minor: entry.expectedMinor })
          .where('fee_ledger.status', '=', 'due'),
      )
      .returningAll()
      .executeTakeFirst();
    if (written) return written;

    // Conflict with a protected (non-'due') row: nothing was written.
    return this.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('batch_id', '=', entry.batchId)
      .where('student_id', '=', entry.studentId)
      .where('period_label', '=', entry.periodLabel)
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('fee_ledger')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Atomic claim like SessionsRepository.cancelIfScheduled (H2): only a
   *  'due'/'partial' entry can be paid, so two concurrent requests (or a
   *  payment racing a waive) resolve to exactly one winner via Postgres's
   *  row lock, and recording a payment can never silently resurrect a
   *  'waived' entry or overwrite an already-'paid' one. Returns undefined
   *  if the entry was not in a payable state. */
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
      .where('status', 'in', ['due', 'partial'])
      .returningAll()
      .executeTakeFirst();
  }

  /** Same atomic-claim guard as recordPayment: waiving an already-'paid'
   *  entry (which would erase recorded collected money) or a
   *  double-waive is rejected rather than silently applied. Returns
   *  undefined if the entry was not in a waivable state. */
  waive(id: string, note: string | null) {
    return this.db
      .updateTable('fee_ledger')
      .set({ status: 'waived', note })
      .where('id', '=', id)
      .where('status', 'in', ['due', 'partial'])
      .returningAll()
      .executeTakeFirst();
  }

  /** Fee entries for one period IN ONE teaching context (null =
   *  Individual, an id = that academy's), taken from the entry's batch.
   *  See periodFilter for what a month's view covers. */
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
      .where((eb) => periodFilter(eb, periodLabel));
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
        // Waived entries must never count as outstanding: split expected
        // into a non-waived bucket (what "outstanding" is computed from)
        // and a waived bucket, rather than summing every status together.
        eb.fn
          .sum(
            eb
              .case()
              .when('fee_ledger.status', '!=', 'waived')
              .then(eb.ref('fee_ledger.expected_minor'))
              .else(0)
              .end(),
          )
          .as('expected'),
        eb.fn
          .sum(eb.fn.coalesce('fee_ledger.recorded_paid_minor', eb.lit(0)))
          .as('collected'),
        eb.fn
          .sum(
            eb
              .case()
              .when('fee_ledger.status', '=', 'waived')
              .then(eb.ref('fee_ledger.expected_minor'))
              .else(0)
              .end(),
          )
          .as('waived'),
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
        eb.fn
          .sum(
            eb
              .case()
              .when('fee_ledger.status', '=', 'waived')
              .then(1)
              .else(0)
              .end(),
          )
          .as('waived_count'),
      ])
      .where('fee_ledger.tutor_id', '=', tutorId)
      .where((eb) => periodFilter(eb, periodLabel));
    query =
      academyId === null
        ? query.where('batches.academy_id', 'is', null)
        : query.where('batches.academy_id', '=', academyId);
    const row = await query.executeTakeFirstOrThrow();

    const expectedMinor = Number(row.expected ?? 0);
    const collectedMinor = Number(row.collected ?? 0);
    const waivedMinor = Number(row.waived ?? 0);

    return {
      periodLabel,
      expectedMinor,
      collectedMinor,
      waivedMinor,
      outstandingMinor: expectedMinor - collectedMinor,
      entries: Number(row.entries),
      paidCount: Number(row.paid_count ?? 0),
      // Waived entries are neither paid nor owed — "N of M paid" must be
      // out of entries - waivedCount, never out of every entry (H5).
      waivedCount: Number(row.waived_count ?? 0),
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
