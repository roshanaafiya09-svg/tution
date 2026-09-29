import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB } from '../../../database/types';
import { ErrorCode } from '../../../common/http/error-codes';
import {
  SubscriptionCapacityRepository,
  type OwnerSubscription,
  type SubscriptionOwner,
} from './subscription-capacity.repository';
import {
  ACADEMY_BLOCK_PRICE_MINOR,
  ACADEMY_TEACHER_FEATURE_PRICE_MINOR,
  BLOCK_SIZE,
  academyOrderShape,
  blocksRequired,
  canAddStudent,
  cheapestIndividualOrder,
  studentCapacity,
} from './blocks';
import { isPlanId, planBlocks } from './plans';

export interface CapacityUsage {
  ownerKind: 'tutor' | 'academy';
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  /** Is the owner currently allowed to use subscription-gated actions? */
  active: boolean;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  blockSize: number;
  activeStudents: number;
  /** Blocks paid for the current period (0 while trialing). */
  purchasedBlocks: number;
  /** Students the paid period allows; null while trialing (unrestricted). */
  capacityStudents: number | null;
  /** Free slots left in the paid capacity; null while trialing. */
  freeSlots: number | null;
  /** Blocks the CURRENT active students need (ceil(n / 25)). */
  blocksRequired: number;
  /** Extra blocks needed right now to cover current usage (0 if covered). */
  blocksShort: number;
  /** What the NEXT period would cost, sized from real usage today. */
  renewalQuote:
    | {
        kind: 'individual';
        monthly: ReturnType<typeof cheapestIndividualOrder>;
        annual: ReturnType<typeof cheapestIndividualOrder>;
      }
    | {
        kind: 'academy';
        blocks: number;
        teacherFeatures: number;
        amountMinor: number;
        blockPriceMinor: number;
        teacherFeaturePriceMinor: number;
      };
}

export interface LockedOwner {
  owner: SubscriptionOwner;
  sub: OwnerSubscription;
}

/**
 * Subscription gating + the 25-student block rules (audit H1). All decisions
 * are made on the server from the database's own counts; nothing here trusts
 * a client-supplied count, owner, or academy id.
 */
@Injectable()
export class SubscriptionCapacityService {
  constructor(private readonly repository: SubscriptionCapacityRepository) {}

  /** Ownership comes from the batch row itself (academy_id is immutable
   *  after creation, migration 0040), never from a request header. */
  ownerOfBatch(batch: {
    tutor_id: string;
    academy_id: string | null;
  }): SubscriptionOwner {
    return batch.academy_id
      ? { kind: 'academy', academyId: batch.academy_id }
      : { kind: 'tutor', tutorId: batch.tutor_id };
  }

  /** Same semantics the guard has always had: a trial is live until it ends,
   *  a paid subscription until its current period ends. */
  isLive(sub: OwnerSubscription, now = new Date()): boolean {
    if (sub.status === 'active') {
      return (
        sub.current_period_end != null && new Date(sub.current_period_end) > now
      );
    }
    if (sub.status === 'trialing') {
      return new Date(sub.trial_ends_at) > now;
    }
    return false;
  }

  /** Blocks a paid period carries. A row created before migration 0045 with
   *  no recorded blocks is read from its plan so nobody is capped below
   *  what they bought. */
  effectiveBlocks(sub: OwnerSubscription): number {
    if (sub.status === 'trialing') return 0;
    if (sub.purchased_blocks > 0) return sub.purchased_blocks;
    return isPlanId(sub.plan_id) ? planBlocks(sub.plan_id) : 1;
  }

  private inactive(
    owner: SubscriptionOwner,
    sub: OwnerSubscription,
  ): HttpException {
    const who = owner.kind === 'academy' ? "Your academy's" : 'Your';
    const message =
      sub.status === 'active'
        ? `${who} subscription period has ended. Renew to keep going.`
        : `${who} trial has ended. Subscribe to keep going.`;
    return new HttpException(
      {
        error: 'TrialExpired',
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async isActive(owner: SubscriptionOwner): Promise<boolean> {
    return this.isLive(await this.repository.getOrStart(owner));
  }

  /** Gate for subscription-gated CREATION actions. Reads stay open so an
   *  expired owner can still see their data and pay. */
  async assertActive(owner: SubscriptionOwner): Promise<void> {
    const sub = await this.repository.getOrStart(owner);
    if (!this.isLive(sub)) throw this.inactive(owner, sub);
  }

  assertActiveForBatch(batch: {
    tutor_id: string;
    academy_id: string | null;
  }): Promise<void> {
    return this.assertActive(this.ownerOfBatch(batch));
  }

  /**
   * Step 1 of enrollment, INSIDE the enrollment transaction: lock the
   * owner's subscription row. Concurrent enrollments for the same owner
   * (across all of their batches) queue here, so every count taken after
   * this point is exact. Lock order everywhere: subscription row -> batch row.
   */
  async lockForEnrollment(
    trx: Transaction<DB>,
    batch: { tutor_id: string; academy_id: string | null },
  ): Promise<LockedOwner> {
    const owner = this.ownerOfBatch(batch);
    const sub = await this.repository.lockOwnerSubscription(trx, owner);
    return { owner, sub };
  }

  /**
   * Step 2, once the student is known to need a NEW seat:
   *  - subscription not live                -> 402 (gated action)
   *  - trialing                             -> allowed (trial capacity is
   *                                            unrestricted, as before)
   *  - student already counted for owner    -> allowed, no extra capacity
   *  - otherwise the new student must fit in the blocks paid for this period
   */
  async assertStudentFits(
    trx: Transaction<DB>,
    { owner, sub }: LockedOwner,
    studentId: string,
  ): Promise<void> {
    if (!this.isLive(sub)) throw this.inactive(owner, sub);
    if (sub.status === 'trialing') return;
    if (await this.repository.isAlreadyCounted(owner, studentId, trx)) return;

    const active = await this.repository.countActiveStudents(owner, trx);
    const blocks = this.effectiveBlocks(sub);
    if (!canAddStudent(active, blocks)) {
      throw new HttpException(
        {
          error: 'BlockCapacityExceeded',
          code: ErrorCode.BLOCK_CAPACITY_EXCEEDED,
          message:
            `This plan covers ${studentCapacity(blocks)} students ` +
            `(${blocks} block${blocks === 1 ? '' : 's'} of ${BLOCK_SIZE}) and ` +
            `${active} are already active. Add another ${BLOCK_SIZE}-student block ` +
            `to enrol student ${active + 1}.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async getUsage(owner: SubscriptionOwner): Promise<CapacityUsage> {
    const sub = await this.repository.getOrStart(owner);
    const activeStudents = await this.repository.countActiveStudents(owner);
    const trialing = sub.status === 'trialing';
    const purchasedBlocks = this.effectiveBlocks(sub);
    const required = blocksRequired(activeStudents);
    const capacityStudents = trialing ? null : studentCapacity(purchasedBlocks);

    let renewalQuote: CapacityUsage['renewalQuote'];
    if (owner.kind === 'tutor') {
      renewalQuote = {
        kind: 'individual',
        monthly: cheapestIndividualOrder(required, 'monthly'),
        annual: cheapestIndividualOrder(required, 'annual'),
      };
    } else {
      const teachers = await this.repository.countActiveTeachers(
        owner.academyId,
      );
      const shape = academyOrderShape(Math.max(1, required), teachers);
      renewalQuote = {
        kind: 'academy',
        ...shape,
        blockPriceMinor: ACADEMY_BLOCK_PRICE_MINOR,
        teacherFeaturePriceMinor: ACADEMY_TEACHER_FEATURE_PRICE_MINOR,
      };
    }

    return {
      ownerKind: owner.kind,
      status: sub.status,
      active: this.isLive(sub),
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      blockSize: BLOCK_SIZE,
      activeStudents,
      purchasedBlocks,
      capacityStudents,
      freeSlots:
        capacityStudents === null
          ? null
          : Math.max(0, capacityStudents - activeStudents),
      blocksRequired: required,
      blocksShort: trialing ? 0 : Math.max(0, required - purchasedBlocks),
      renewalQuote,
    };
  }

  /** A period purchase must cover the students already active — you cannot
   *  renew into a capacity smaller than your current usage. */
  async assertOrderCoversUsage(
    owner: SubscriptionOwner,
    totalBlocks: number,
  ): Promise<void> {
    const active = await this.repository.countActiveStudents(owner);
    const need = blocksRequired(active);
    if (totalBlocks < need) {
      throw new HttpException(
        {
          error: 'BlocksInsufficient',
          code: ErrorCode.BLOCKS_INSUFFICIENT,
          message:
            `You have ${active} active students, which needs at least ${need} ` +
            `block${need === 1 ? '' : 's'} of ${BLOCK_SIZE}; this order only buys ${totalBlocks}.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
