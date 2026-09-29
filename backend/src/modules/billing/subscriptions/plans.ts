/**
 * Tutor subscription pricing (blueprint §5): "₹499/mo flat up to 25
 * students → ₹999/mo up to 100 → per-student add-on beyond. Annual = 2
 * months free." The per-student overage tier is explicitly flagged in
 * the blueprint as "validate in pilot" — not committed pricing — so
 * it's left out here rather than guessed at; the two flat tiers (each
 * with a monthly and annual option) are what's actually specified.
 * Prices/periods live here, in server config, never hardcoded in a
 * client — same principle as AI model config (blueprint §8).
 */
export const SUBSCRIPTION_PLANS = {
  monthly_basic: {
    label: 'Monthly — up to 25 students',
    priceMinor: 49_900,
    periodDays: 30,
  },
  monthly_pro: {
    label: 'Monthly — up to 100 students',
    priceMinor: 99_900,
    periodDays: 30,
  },
  annual_basic: {
    label: 'Annual — up to 25 students (2 months free)',
    priceMinor: 499_000,
    periodDays: 365,
  },
  annual_pro: {
    label: 'Annual — up to 100 students (2 months free)',
    priceMinor: 999_000,
    periodDays: 365,
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;

export function isPlanId(value: string): value is PlanId {
  return value in SUBSCRIPTION_PLANS;
}

/**
 * How many 25-student blocks each catalogue plan includes (audit H1).
 * "up to 25 students" = 1 block; "up to 100 students" = 4 blocks. Prices are
 * unchanged — this only makes the promise in each plan's label enforceable.
 */
const PLAN_BLOCKS: Record<PlanId, number> = {
  monthly_basic: 1,
  monthly_pro: 4,
  annual_basic: 1,
  annual_pro: 4,
};

export function planBlocks(planId: PlanId): number {
  return PLAN_BLOCKS[planId];
}

export function planCadence(planId: PlanId): 'monthly' | 'annual' {
  return planId.startsWith('annual') ? 'annual' : 'monthly';
}
