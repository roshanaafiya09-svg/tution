import { Injectable } from '@nestjs/common';
import { SubscriptionsRepository } from './subscriptions.repository';

const TRIAL_DAYS = 90;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly repository: SubscriptionsRepository) {}

  /** Called once, at tutor-profile creation (blueprint §5: 90-day trial). */
  startTrial(tutorId: string) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    return this.repository.createTrial(tutorId, trialEndsAt);
  }

  /** Self-healing: a tutor with no row yet (profile created before this
   *  guard existed) gets a fresh trial started here rather than being
   *  locked out — the row should have existed since signup either way. */
  private async getOrStartTrial(tutorId: string) {
    const existing = await this.repository.findByTutorId(tutorId);
    return existing ?? (await this.startTrial(tutorId));
  }

  /** Checked lazily against current_period_end rather than requiring a
   *  background job to flip status on expiry — an 'active' subscription
   *  whose period has lapsed is correctly treated as inactive the next
   *  time anyone asks, with no cron needed. */
  async isActive(tutorId: string): Promise<boolean> {
    const subscription = await this.getOrStartTrial(tutorId);
    if (subscription.status === 'active') {
      return (
        subscription.current_period_end != null &&
        new Date(subscription.current_period_end) > new Date()
      );
    }
    if (subscription.status === 'trialing') {
      return new Date(subscription.trial_ends_at) > new Date();
    }
    return false; // past_due, cancelled
  }

  /** Feeds the trial-end value-recap paywall (blueprint §5). */
  async getStatus(tutorId: string) {
    const subscription = await this.getOrStartTrial(tutorId);
    return {
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
    };
  }

  /** For the payments flow — the subscription row a tutor is paying
   *  into, self-healing the same way isActive does. */
  getOwnSubscription(tutorId: string) {
    return this.getOrStartTrial(tutorId);
  }

  findSubscriptionById(id: string) {
    return this.repository.findById(id);
  }

  /** Called on payment capture (blueprint §5, §10 Phase 2) — this is
   *  the "Razorpay subscriptions" piece: the tutor's own recurring
   *  charge that ends the trial, distinct from fee *collection*
   *  (a parent paying the tutor for tuition). */
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
