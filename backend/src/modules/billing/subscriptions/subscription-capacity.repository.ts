import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type {
  AcademySubscriptionsTable,
  DB,
  SubscriptionsTable,
} from '../../../database/types';
import { newId } from '../../../database/id';

/** Who a subscription (and its student capacity) belongs to. Derived from
 *  the BATCH's own ownership columns on the server, never from the request. */
export type SubscriptionOwner =
  { kind: 'tutor'; tutorId: string } | { kind: 'academy'; academyId: string };

export type OwnerSubscription =
  Selectable<SubscriptionsTable> | Selectable<AcademySubscriptionsTable>;

type Db = Kysely<DB> | Transaction<DB>;

export const TRIAL_DAYS = 90;

@Injectable()
export class SubscriptionCapacityRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  transaction<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(fn);
  }

  private trialEnd(): Date {
    const d = new Date();
    d.setDate(d.getDate() + TRIAL_DAYS);
    return d;
  }

  /** The owner's subscription row, created (as a trial) if it does not exist
   *  yet — WITHOUT a lock. */
  async getOrStart(
    owner: SubscriptionOwner,
    db: Db = this.db,
  ): Promise<OwnerSubscription> {
    if (owner.kind === 'tutor') {
      await db
        .insertInto('subscriptions')
        .values({
          id: newId(),
          tutor_id: owner.tutorId,
          trial_ends_at: this.trialEnd(),
        })
        .onConflict((oc) => oc.column('tutor_id').doNothing())
        .execute();
      return db
        .selectFrom('subscriptions')
        .selectAll()
        .where('tutor_id', '=', owner.tutorId)
        .executeTakeFirstOrThrow();
    }
    await db
      .insertInto('academy_subscriptions')
      .values({
        id: newId(),
        academy_id: owner.academyId,
        trial_ends_at: this.trialEnd(),
      })
      .onConflict((oc) => oc.column('academy_id').doNothing())
      .execute();
    return db
      .selectFrom('academy_subscriptions')
      .selectAll()
      .where('academy_id', '=', owner.academyId)
      .executeTakeFirstOrThrow();
  }

  /** Same, but takes the row lock. Everything that changes an owner's
   *  student count or capacity (enroll, purchase settlement) queues here, so
   *  the count read afterwards is exact — this is what stops a 26th student
   *  slipping into a 25-student block. Lock order everywhere is
   *  subscription row -> batch row. */
  async lockOwnerSubscription(
    trx: Transaction<DB>,
    owner: SubscriptionOwner,
  ): Promise<OwnerSubscription> {
    await this.getOrStart(owner, trx);
    if (owner.kind === 'tutor') {
      return trx
        .selectFrom('subscriptions')
        .selectAll()
        .where('tutor_id', '=', owner.tutorId)
        .forUpdate()
        .executeTakeFirstOrThrow();
    }
    return trx
      .selectFrom('academy_subscriptions')
      .selectAll()
      .where('academy_id', '=', owner.academyId)
      .forUpdate()
      .executeTakeFirstOrThrow();
  }

  /** Distinct ACTIVE students under an owner: an active enrollment, in an
   *  active batch, by a student whose account still exists. A student in two
   *  of the owner's batches counts once. Individual and Academy scopes never
   *  mix — an academy's students are not the teacher's individual students. */
  async countActiveStudents(
    owner: SubscriptionOwner,
    db: Db = this.db,
  ): Promise<number> {
    let q = db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .innerJoin('users', 'users.id', 'enrollments.student_id')
      .select(sql<string>`count(distinct enrollments.student_id)`.as('n'))
      .where('enrollments.status', '=', 'active')
      .where('batches.status', '=', 'active')
      .where('users.deleted_at', 'is', null);
    q =
      owner.kind === 'tutor'
        ? q
            .where('batches.tutor_id', '=', owner.tutorId)
            .where('batches.academy_id', 'is', null)
        : q.where('batches.academy_id', '=', owner.academyId);
    const row = await q.executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /** Is this student ALREADY one of the owner's active students (in some
   *  batch)? Then enrolling them in another batch needs no extra capacity. */
  async isAlreadyCounted(
    owner: SubscriptionOwner,
    studentId: string,
    db: Db,
  ): Promise<boolean> {
    let q = db
      .selectFrom('enrollments')
      .innerJoin('batches', 'batches.id', 'enrollments.batch_id')
      .select('enrollments.id')
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .where('batches.status', '=', 'active');
    q =
      owner.kind === 'tutor'
        ? q
            .where('batches.tutor_id', '=', owner.tutorId)
            .where('batches.academy_id', 'is', null)
        : q.where('batches.academy_id', '=', owner.academyId);
    return (await q.limit(1).executeTakeFirst()) !== undefined;
  }

  /** ACTIVE teachers of an academy — the unit of the per-teacher fee. */
  async countActiveTeachers(
    academyId: string,
    db: Db = this.db,
  ): Promise<number> {
    const row = await db
      .selectFrom('academy_memberships')
      .select(sql<string>`count(*)`.as('n'))
      .where('academy_id', '=', academyId)
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /**
   * Applies a PERIOD purchase (new or renewal). Capacity is fixed for the
   * period; an early renewal never lowers capacity that is already paid for
   * (greatest()), and a lapsed/trial subscription starts from exactly what
   * was bought.
   */
  async applyPeriodPurchase(
    trx: Transaction<DB>,
    owner: SubscriptionOwner,
    input: {
      planId: string;
      blocks: number;
      teacherFeatures?: number;
      periodEnd: Date;
      provider: string;
      providerRef: string;
    },
  ): Promise<OwnerSubscription> {
    const live = sql<boolean>`(status = 'active' and current_period_end > now())`;
    if (owner.kind === 'tutor') {
      return trx
        .updateTable('subscriptions')
        .set({
          status: 'active',
          plan_id: input.planId,
          current_period_end: input.periodEnd,
          period_start: sql`case when ${live} then period_start else now() end`,
          purchased_blocks: sql`case when ${live} then greatest(purchased_blocks, ${input.blocks}::int) else ${input.blocks}::int end`,
          provider: input.provider,
          provider_ref: input.providerRef,
        })
        .where('tutor_id', '=', owner.tutorId)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return trx
      .updateTable('academy_subscriptions')
      .set({
        status: 'active',
        plan_id: input.planId,
        current_period_end: input.periodEnd,
        period_start: sql`case when ${live} then period_start else now() end`,
        purchased_blocks: sql`case when ${live} then greatest(purchased_blocks, ${input.blocks}::int) else ${input.blocks}::int end`,
        purchased_teacher_features: sql`case when ${live} then greatest(purchased_teacher_features, ${input.teacherFeatures ?? 0}::int) else ${input.teacherFeatures ?? 0}::int end`,
        provider: input.provider,
        provider_ref: input.providerRef,
      })
      .where('academy_id', '=', owner.academyId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Mid-period add-on: more capacity NOW, same period end. Returns
   *  undefined when there is no live paid period to add to. */
  async addBlocks(
    trx: Transaction<DB>,
    owner: SubscriptionOwner,
    blocks: number,
  ): Promise<OwnerSubscription | undefined> {
    if (owner.kind === 'tutor') {
      return trx
        .updateTable('subscriptions')
        .set({ purchased_blocks: sql`purchased_blocks + ${blocks}::int` })
        .where('tutor_id', '=', owner.tutorId)
        .where('status', '=', 'active')
        .where('current_period_end', '>', sql<Date>`now()`)
        .returningAll()
        .executeTakeFirst();
    }
    return trx
      .updateTable('academy_subscriptions')
      .set({ purchased_blocks: sql`purchased_blocks + ${blocks}::int` })
      .where('academy_id', '=', owner.academyId)
      .where('status', '=', 'active')
      .where('current_period_end', '>', sql<Date>`now()`)
      .returningAll()
      .executeTakeFirst();
  }
}
