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

  async isActive(tutorId: string): Promise<boolean> {
    const subscription = await this.getOrStartTrial(tutorId);
    if (subscription.status === 'active') return true;
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
}
