import { Injectable } from '@nestjs/common';
import { ParentPremiumRepository } from './parent-premium.repository';
import { ParentLinksRepository } from '../../parents/parent-links.repository';

@Injectable()
export class ParentPremiumService {
  constructor(
    private readonly repository: ParentPremiumRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
  ) {}

  /** Self-healing, same shape as SubscriptionsService.getOrStartTrial —
   *  a parent with no row yet gets an inactive one created here rather
   *  than every caller having to null-check. Grants no access: status
   *  stays 'inactive' until a payment actually captures. */
  private async getOrCreate(parentId: string) {
    const existing = await this.repository.findByParentId(parentId);
    return existing ?? (await this.repository.createInactive(parentId));
  }

  /** Checked lazily against current_period_end, same as tutor
   *  subscriptions — an 'active' row whose period has lapsed is
   *  correctly treated as inactive with no renewal job needed. A plain
   *  read (no self-healing insert): this runs on every doubt-solver
   *  request via ParentPremiumForStudentGuard and on the weekly digest
   *  job, so a parent who's never subscribed must not trigger a write on
   *  every check — getOwnSubscription is the only path that creates the
   *  row, at actual purchase time. */
  async isActive(parentId: string): Promise<boolean> {
    const subscription = await this.repository.findByParentId(parentId);
    if (!subscription || subscription.status !== 'active') return false;
    return (
      subscription.current_period_end != null &&
      new Date(subscription.current_period_end) > new Date()
    );
  }

  /** Gates the student-facing doubt solver: true if ANY actively-linked
   *  parent of this student currently holds premium. A student with no
   *  parent link, or whose linked parent(s) haven't subscribed, has no
   *  path to true here — there's no student-side purchase for this
   *  tier (blueprint §5: parent premium is "sold on web" to the parent). */
  async isActiveForStudent(studentId: string): Promise<boolean> {
    const links = await this.parentLinksRepository.listForStudent(studentId);
    const activeParentIds = links
      .filter((link) => link.status === 'active')
      .map((link) => link.parent_id);
    if (activeParentIds.length === 0) return false;

    const results = await Promise.all(
      activeParentIds.map((parentId) => this.isActive(parentId)),
    );
    return results.some(Boolean);
  }

  /** Plain read, same rationale as isActive — a parent who has never
   *  opened the Premium page or subscribed should not cause a row to be
   *  written just by checking their own status. */
  async getStatus(parentId: string) {
    const subscription = await this.repository.findByParentId(parentId);
    return {
      status: subscription?.status ?? ('inactive' as const),
      currentPeriodEnd: subscription?.current_period_end ?? null,
    };
  }

  /** For the payments flow — the subscription row a parent is paying
   *  into, self-healing the same way isActive does. */
  getOwnSubscription(parentId: string) {
    return this.getOrCreate(parentId);
  }

  findSubscriptionById(id: string) {
    return this.repository.findById(id);
  }

  activatePlan(
    subscriptionId: string,
    planId: string,
    currentPeriodEnd: Date,
    provider: string,
    providerRef: string,
  ) {
    return this.repository.activate(
      subscriptionId,
      planId,
      currentPeriodEnd,
      provider,
      providerRef,
    );
  }
}
