/**
 * Shared on/off switch for the in-process `@Cron` timers (audit H7).
 *
 * Read directly from `process.env` (not `ConfigService`) so it can be
 * checked from a plain function at the top of any `@Cron`-decorated method
 * without adding a constructor dependency to every scheduler service. This
 * mirrors the existing pattern in `app.module.ts` for the dev-only module
 * gate (`process.env.NODE_ENV`), which is read the same direct way for the
 * same reason.
 *
 * Set `DISABLE_INTERNAL_CRON=true` once an external scheduler (hitting
 * `POST /internal/jobs/:job`, see CronJobsController) is the only intended
 * driver — e.g. if this ever runs as more than one instance, so the same
 * job cannot fire twice a minute apart from two different processes. Every
 * job this gates is independently idempotent (dedupe keys / status-based
 * upserts / atomic claims), so leaving it unset (both the timer AND an
 * external scheduler hitting the same job) is always safe too — merely
 * redundant, never harmful.
 */
export function isInternalCronDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.DISABLE_INTERNAL_CRON === 'true';
}
