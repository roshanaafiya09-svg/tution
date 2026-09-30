/**
 * What a subscription row means RIGHT NOW (audit H2). Expiry is evaluated
 * lazily — nothing flips `status` when a period or trial ends, so a row
 * can say `active` long after its period lapsed. Anything a client
 * displays or branches on must use this, never the raw `status`.
 */
export type EffectiveSubscriptionStatus =
  'trialing' | 'trial_ended' | 'active' | 'expired' | 'past_due' | 'cancelled';

export function effectiveSubscriptionStatus(
  sub: {
    status: string;
    trial_ends_at: Date | string;
    current_period_end: Date | string | null;
  },
  now = new Date(),
): EffectiveSubscriptionStatus {
  if (sub.status === 'active') {
    return sub.current_period_end != null &&
      new Date(sub.current_period_end) > now
      ? 'active'
      : 'expired';
  }
  if (sub.status === 'trialing') {
    return new Date(sub.trial_ends_at) > now ? 'trialing' : 'trial_ended';
  }
  return sub.status === 'past_due' ? 'past_due' : 'cancelled';
}

/** Parent Premium twin: there is no trial, and "never bought" is
 *  `inactive`. */
export type EffectivePremiumStatus =
  'inactive' | 'active' | 'expired' | 'past_due' | 'cancelled';

export function effectivePremiumStatus(
  sub: { status: string; current_period_end: Date | string | null } | undefined,
  now = new Date(),
): EffectivePremiumStatus {
  if (!sub) return 'inactive';
  if (sub.status === 'active') {
    return sub.current_period_end != null &&
      new Date(sub.current_period_end) > now
      ? 'active'
      : 'expired';
  }
  if (sub.status === 'past_due' || sub.status === 'cancelled') {
    return sub.status;
  }
  return 'inactive';
}
