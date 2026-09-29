import { SUBSCRIPTION_PLANS, planBlocks, planCadence } from './plans';
import type { PlanId } from './plans';

/**
 * Student-block billing rules (audit H1). Pure functions only — everything
 * that touches the database lives in SubscriptionCapacityService, so these
 * rules can be tested exhaustively without one.
 *
 *  - One block = at most 25 ACTIVE students.
 *  - 1–25 students need 1 block, 26–50 need 2, 51–75 need 3, …
 *  - A paid period carries a fixed number of purchased blocks. A student who
 *    leaves frees capacity that can be reused inside the same period, but
 *    nothing is refunded; the NEXT purchase is sized from real usage.
 */
export const BLOCK_SIZE = 25;

export function blocksRequired(activeStudents: number): number {
  if (!Number.isFinite(activeStudents) || activeStudents <= 0) return 0;
  return Math.ceil(activeStudents / BLOCK_SIZE);
}

export function studentCapacity(blocks: number): number {
  return Math.max(0, blocks) * BLOCK_SIZE;
}

/** True when one more (not-yet-counted) student still fits in `blocks`. */
export function canAddStudent(activeStudents: number, blocks: number): boolean {
  return activeStudents + 1 <= studentCapacity(blocks);
}

// ---------------------------------------------------------------------------
// Individual teacher pricing — the two flat tiers documented in the
// blueprint (§5), expressed in blocks: basic = 1 block, pro = 4 blocks
// (prices unchanged), plus a per-block add-on beyond a bundle at the
// per-block price of the same cadence (the "per-student add-on beyond" line,
// expressed per block).
// ---------------------------------------------------------------------------
export type Cadence = 'monthly' | 'annual';

/** Price of ONE extra block for a cadence. Monthly = the basic tier's price
 *  (₹499 buys one block); annual = the basic annual price (2 months free). */
export const EXTRA_BLOCK_PRICE_MINOR: Record<Cadence, number> = {
  monthly: SUBSCRIPTION_PLANS.monthly_basic.priceMinor,
  annual: SUBSCRIPTION_PLANS.annual_basic.priceMinor,
};

export interface IndividualOrderShape {
  planId: PlanId;
  extraBlocks: number;
  totalBlocks: number;
  amountMinor: number;
}

export function individualOrderShape(
  planId: PlanId,
  extraBlocks: number,
): IndividualOrderShape {
  const cadence = planCadence(planId);
  return {
    planId,
    extraBlocks,
    totalBlocks: planBlocks(planId) + extraBlocks,
    amountMinor:
      SUBSCRIPTION_PLANS[planId].priceMinor +
      extraBlocks * EXTRA_BLOCK_PRICE_MINOR[cadence],
  };
}

/** The cheapest catalogue combination that covers `required` blocks. */
export function cheapestIndividualOrder(
  required: number,
  cadence: Cadence,
): IndividualOrderShape {
  const need = Math.max(1, required);
  const basic: PlanId = cadence === 'annual' ? 'annual_basic' : 'monthly_basic';
  const pro: PlanId = cadence === 'annual' ? 'annual_pro' : 'monthly_pro';
  const candidates = [
    individualOrderShape(basic, Math.max(0, need - planBlocks(basic))),
    individualOrderShape(pro, Math.max(0, need - planBlocks(pro))),
  ];
  return candidates.reduce((best, c) =>
    c.amountMinor < best.amountMinor ? c : best,
  );
}

// ---------------------------------------------------------------------------
// Academy pricing (stated business rule): ₹499 per 25-student block, plus
// ₹50 per teacher-related feature. The repository defines no other notion of
// a "teacher feature" than an academy's ACTIVE teachers, so that is what the
// per-teacher fee is counted on — a single constant, billed per period,
// deliberately not enforced as a cap. If the intended definition differs,
// change ACADEMY_TEACHER_FEATURE_PRICE_MINOR / countTeacherFeatures only.
// ---------------------------------------------------------------------------
export const ACADEMY_PLAN_ID = 'academy_monthly';
export const ACADEMY_PERIOD_DAYS = 30;
export const ACADEMY_BLOCK_PRICE_MINOR = 49_900;
export const ACADEMY_TEACHER_FEATURE_PRICE_MINOR = 5_000;

export interface AcademyOrderShape {
  blocks: number;
  teacherFeatures: number;
  amountMinor: number;
}

export function academyOrderShape(
  blocks: number,
  teacherFeatures: number,
): AcademyOrderShape {
  return {
    blocks,
    teacherFeatures,
    amountMinor:
      blocks * ACADEMY_BLOCK_PRICE_MINOR +
      teacherFeatures * ACADEMY_TEACHER_FEATURE_PRICE_MINOR,
  };
}

/** Marker plan id for a mid-period "add blocks" order (no period change). */
export const ADDON_BLOCKS_PLAN_ID = 'addon_blocks';
