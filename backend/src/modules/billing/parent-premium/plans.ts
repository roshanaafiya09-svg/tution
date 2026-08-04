/**
 * Parent premium pricing (blueprint §5): "₹99–149/mo for AI doubt
 * solver + rich digests." The blueprint gives a range rather than a
 * settled price — same "validate in pilot" ambiguity as the tutor
 * plans' per-student overage tier — so this ships at the upper bound
 * (₹149) as the one concrete monthly plan, plus an annual option at
 * the same 2-months-free discount used for tutor plans. Prices live
 * here, in server config, never hardcoded in a client.
 */
export const PARENT_PREMIUM_PLANS = {
  monthly: {
    label: 'Parent Premium — monthly (AI doubt solver + rich digests)',
    priceMinor: 14_900,
    periodDays: 30,
  },
  annual: {
    label: 'Parent Premium — annual (2 months free)',
    priceMinor: 149_000,
    periodDays: 365,
  },
} as const;

export type ParentPremiumPlanId = keyof typeof PARENT_PREMIUM_PLANS;

export function isParentPremiumPlanId(
  value: string,
): value is ParentPremiumPlanId {
  return value in PARENT_PREMIUM_PLANS;
}
