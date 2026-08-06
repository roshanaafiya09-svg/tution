/**
 * Parent premium pricing (blueprint §5): "₹99–149/mo for AI doubt
 * solver + rich digests." The blueprint gives a range rather than a
 * settled price — same "validate in pilot" ambiguity as the tutor
 * plans' per-student overage tier — so this ships at the upper bound
 * (₹149) as the one concrete monthly plan, plus an annual option at
 * the same 2-months-free discount used for tutor plans. Prices live
 * here, in server config, never hardcoded in a client.
 *
 * Label deliberately doesn't mention the AI doubt solver: it has zero
 * student-facing UI anywhere (web or mobile) as of this launch, so
 * advertising it at the point of a real purchase would be selling a
 * feature buyers can't actually reach. DigestsService's premium tier
 * (richer weekly digest) is the only premium benefit that's actually
 * live — restore the doubt-solver mention once it ships a real UI.
 */
export const PARENT_PREMIUM_PLANS = {
  monthly: {
    label: 'Parent Premium — monthly (richer weekly digests)',
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
