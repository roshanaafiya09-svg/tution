# Scheduled jobs (audit H7)

Every scheduled job in the backend, in one place. All of them run as
in-process `@nestjs/schedule` `@Cron` timers by default, **and** can be
triggered on demand over HTTP — see [External scheduler](#external-scheduler)
below for why that matters on Render's free tier.

Every job below follows the same shape in code: a thin `@Cron`-decorated
wrapper (`cronXxx`) that checks `DISABLE_INTERNAL_CRON` and then calls the
real, ungated worker method (`xxx`) — the same worker method the external
endpoint calls. Disabling the in-process timer never disables the job itself.

## Reminders (`RemindersModule` / `src/modules/reminders/reminders.service.ts`)

| Job | Endpoint name | Trigger | Frequency | Idempotency | Failure/retry |
|---|---|---|---|---|---|
| Upcoming class reminder | `class-reminders` | `@Cron(EVERY_MINUTE)` | Every minute | DB-backed dedupe key `reminder:<sessionId>:upcoming:<startIso>` (migration 0043's `notifications.dedupe_key` unique index) — a repeat or overlapping run sends nothing twice. | Per-session try/catch; one failing session never blocks the rest of the sweep. The sweep window is **forward-looking** (`[now, now + 10min]`, not a narrow slice around exactly "now + 10") specifically so a gap — the Render instance asleep, a deploy restart, a slow tick — is self-healing: whichever tick next actually runs still finds and sends every reminder still due, just later than ideal, instead of never. |
| Cancelled-class reminder | *(runs inside `class-reminders`)* | same tick | same | Same dedupe mechanism, keyed per session/holiday group (`holidayGroupDedupeKey`). | Same. |
| Government-holiday application | `government-holidays` | `@Cron(EVERY_DAY_AT_MIDNIGHT, Asia/Kolkata)` | Daily | Operates on an **absolute date** ("today" in IST), not a narrow post-midnight window — running late (or twice) the same day is a no-op past the first successful application (`applyHolidayForAcademy`'s own upsert). | Per-academy try/catch inside `HolidayService`; overall sweep wrapped in try/catch too. |

## Assessments (`AssessmentsModule` / `src/modules/assessments/scheduler/assessment-scheduler.service.ts`)

| Job | Endpoint name | Trigger | Frequency | Idempotency | Failure/retry |
|---|---|---|---|---|---|
| Open scorecard windows | `assessment-scorecard-windows` | `@Cron(EVERY_DAY_AT_1AM, academic tz)` | Daily | Status-based (`SCHEDULED -> SCORECARD_PENDING`); re-running only touches rows still `SCHEDULED` for today. | Whole sweep try/catch; safe to re-run. |
| Overdue sweep | `assessment-overdue-sweep` | `@Cron(EVERY_DAY_AT_2AM, academic tz)` | Daily | Status-based (`SCORECARD_PENDING -> OVERDUE`) plus `notifyOnce` (checks the notification's own full history by type+payload before sending). | Whole sweep try/catch. |
| Online-assessment deadline sweep | `assessment-online-deadlines` | `@Cron(EVERY_HOUR)` | Hourly | `checkOnlineCompletion` only completes an assessment once every required student has a result or the deadline has passed — re-running is a no-op once complete. | Whole sweep try/catch. |
| Weekly assessment reminder | `assessment-weekly-reminder` | `@Cron(EVERY_DAY_AT_9AM, academic tz)` | Daily (fires once/week in effect — see below) | `notifyOnce` per (teacher, teaching context, week) — the SAME nudge is never sent twice for one academic week even if the sweep runs on several days before compliance is met. | Whole sweep try/catch. |

All four are based on **current absolute database state** (today's date, "is
it overdue as of now", "is it still open"), not a narrow time slice — so,
unlike the old class-reminder job, they were already catch-up safe: a run
delayed by a sleeping instance simply processes whatever is due as of
whenever it actually runs.

## Payment reconciliation (`BillingModule` / `src/modules/billing/payments/payment-reconciliation.service.ts`)

New in this pass (audit H5/H7/H8/H10) — the repository methods these call
existed already (`PaymentsRepository.expireStaleOpen`,
`PayoutsRepository.listStuckPending`) but had no caller until now.

| Job | Endpoint name | Trigger | Frequency | Idempotency | Failure/retry |
|---|---|---|---|---|---|
| Expire stale open orders | `payments-expire-stale-orders` | `@Cron(EVERY_HOUR)` | Hourly | `UPDATE ... WHERE status IN ('created','authorized') AND created_at < cutoff` — only ever touches rows still open past 24h; re-running changes nothing once they're `failed`. Frees the target's "one open order" slot (migration 0046's partial unique indexes) for a real retry. | Whole sweep try/catch; a DB failure is logged and retried next hour. |
| Resume stuck refunds | `payments-resume-stuck-refunds` | `@Cron(EVERY_10_MINUTES)` | Every 10 min | Finds `payment_refunds` rows `pending` past the dispatch-claim staleness window (`DISPATCH_STALE_SECONDS` + 10 min) and re-drives `PaymentRefundsService.dispatch()`, which **always asks the provider "does a refund with this receipt already exist?" before creating one** — can never double-refund. | Per-refund try/catch; a refund that still can't resolve is left `pending` (never force-failed, which would release its reserved amount while the true provider state is unproven) for the next sweep. |
| Report stuck payouts | `payments-report-stuck-payouts` | `@Cron(EVERY_HOUR)` | Hourly | Read-only — logs (`logger.error`, so it reaches Sentry if configured) any payout `pending` with no provider id for over an hour. **Deliberately never auto-retries**: `PayoutsProvider` has no "does a payout for this reference already exist?" lookup the way refunds do, so blindly retrying could pay someone twice. The payments stay attached to the stuck payout row until a human confirms the real state at the provider. | Whole sweep try/catch. |

## External scheduler

Render's **free** web-service tier sleeps the instance after a period of no
inbound HTTP traffic. An in-process `@Cron` timer does not fire while the
process is suspended, so a job's tick can be silently skipped for however
long the instance was asleep — no error, no log, nothing to notice.

`POST /internal/jobs/:job` (guarded by `CronSecretGuard`,
`src/modules/internal-jobs/`) exists so an **external** scheduler can drive
every job above regardless of whether the in-process timer happened to fire:
the HTTP request itself wakes a sleeping Render instance, and the handler
calls the exact same idempotent worker method the `@Cron` timer calls.

**Setup:**
1. Set `CRON_SECRET` (32+ random characters) in the Render dashboard. The
   endpoint is **entirely unusable** (503 on every call) until this is set —
   it never "falls open" to being unauthenticated.
2. Point an external scheduler at `POST https://<backend>/internal/jobs/<job>`
   for each job name below, with header `X-Cron-Secret: <CRON_SECRET>`, on
   the cadence from the tables above. Any of these work and cost nothing at
   this scale:
   - [cron-job.org](https://cron-job.org) (free, no account limits that
     matter here)
   - A GitHub Actions workflow with a `schedule:` trigger, `curl`-ing the URL
   - Render's own paid **Cron Job** service type, if the project upgrades
3. Job names: `class-reminders` (every minute), `government-holidays`
   (daily, midnight IST), `assessment-scorecard-windows` (daily, 1am IST),
   `assessment-overdue-sweep` (daily, 2am IST), `assessment-online-deadlines`
   (hourly), `assessment-weekly-reminder` (daily, 9am IST),
   `payments-expire-stale-orders` (hourly), `payments-resume-stuck-refunds`
   (every 10 min), `payments-report-stuck-payouts` (hourly).
4. Optional: once the external scheduler is confirmed reliable, set
   `DISABLE_INTERNAL_CRON=true` to stop the in-process timers — this matters
   most if the backend is ever scaled to more than one instance, so the same
   job cannot fire twice a minute apart from two different processes. Every
   job is independently idempotent, so leaving both drivers on is always
   safe too (merely redundant, never harmful) — this is a genuinely optional
   step, not a prerequisite for setting up the external scheduler.

There is deliberately **no "run every job" route** — a caller (human or
scheduler) states exactly which job it wants to run.

## What is NOT a scheduled job (and why)

- **Trial/subscription expiry** — a tutor's or academy's subscription row
  keeps whatever `status`/`current_period_end` it was last set to; whether
  it's currently *usable* is recomputed live on every gated request
  (`SubscriptionCapacityService.isLive`) by comparing to `now()`, never
  cached as a boolean a cron would need to flip. No job needed.
- **Approved-leave class cancellation** — happens transactionally at
  approval time (`TeacherLeaveService`), not on a sweep.
- **Verification/KYC document retention** — flagged in a previous audit
  pass as an intentionally-deferred product decision (no retention *policy*
  exists yet to schedule); out of scope for this remediation pass.
