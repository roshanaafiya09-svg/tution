import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AcademySubscriptionsRepository } from './academy-subscriptions.repository';

const TRIAL_DAYS = 90;

/**
 * The ACADEMY's plan. The Academy pays for Academy-context activity; the
 * teacher pays (SubscriptionsService) for Individual-context activity.
 * Neither ever satisfies the other: a teacher's Individual plan is not
 * consulted for academy batches, and the academy's plan is never consulted
 * for a teacher's Individual batches. Which plan gates a request is decided
 * by the teaching context of the thing being created.
 */
@Injectable()
export class AcademySubscriptionsService {
  constructor(private readonly repository: AcademySubscriptionsRepository) {}

  /** Self-healing like SubscriptionsService: an academy with no row yet
   *  gets a fresh 90-day trial the first time its plan is checked. */
  private async getOrStartTrial(academyId: string) {
    const existing = await this.repository.findByAcademyId(academyId);
    if (existing) return existing;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    return this.repository.createTrial(academyId, trialEndsAt);
  }

  async isActive(academyId: string): Promise<boolean> {
    const subscription = await this.getOrStartTrial(academyId);
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

  async getStatus(academyId: string) {
    const subscription = await this.getOrStartTrial(academyId);
    return {
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEnd: subscription.current_period_end,
      active: await this.isActive(academyId),
    };
  }

  /** 402 when the academy's plan doesn't cover creating new academy
   *  activity — same shape ActiveSubscriptionGuard uses for teachers. */
  async assertActive(academyId: string): Promise<void> {
    if (await this.isActive(academyId)) return;
    const { status } = await this.getStatus(academyId);
    const message =
      status === 'active'
        ? "Your academy's subscription period has ended. Renew to keep going."
        : "Your academy's trial has ended. Subscribe to keep going.";
    throw new HttpException(
      { error: 'TrialExpired', message },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
