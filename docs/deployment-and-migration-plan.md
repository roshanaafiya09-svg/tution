# Deployment & migration plan (audit H6)

Read-only findings plus the repository-side corrections made in this pass.
**Nothing in this document was deployed by the assistant** — every action
below that touches the live Render/Vercel/Neon account is a manual step for
a human with dashboard access, listed explicitly rather than implied.

## 1. Current state (as read, 2026-09-29)

| | Repo (this branch) | Production |
|---|---|---|
| Backend code | `teaching-contexts` branch, HEAD includes the H1–H10 remediation commits in this pass | Render service `tuition-app-backend` (`srv-d9q0rih42hec739ihp5g`) deploys from **`master`**, last built at `84b6f80` (2026-09-19) — **not** this branch |
| Web code | same branch | Vercel project `tution`, production alias `tution-xi-eosin.vercel.app` also last built from `master` @ `84b6f80` |
| Migrations | `0001`…`0046` (sequential, no gaps — verified) | Neon project "Tution" (`sweet-cloud-46654501`) confirmed at `0039` as of the 2026-09-28 audit — **7 migrations behind** (`0040`–`0046`) |

`master` has had no new commits since `84b6f80`; every commit from
`69a4fcf` (teaching contexts) onward, including this pass's H1–H10 work,
exists only on `teaching-contexts`. Production has been running the
pre-teaching-contexts code this whole time.

## 2. Migration safety (verified locally this pass)

- File numbering is sequential with no gaps or duplicates, `0001` through
  `0046` (scripted check).
- `0045_subscription_blocks_and_batch_capacity.ts` and
  `0046_payment_state_machine.ts` (new in this pass) were each run
  **up → down → up** against the local dev database and left it in a
  consistent state both times — both are safely reversible.
- Neither migration deletes or destructively rewrites existing data:
  `0045` adds columns with safe defaults (`purchased_blocks integer not
  null default 0`, etc.) and backfills `purchased_blocks` for existing
  *active* subscriptions from their plan (so nobody who already paid is
  retroactively capped below what they bought); `0046` adds columns/tables
  and, for the "one open order per target" unique indexes, first
  reclassifies any pre-existing duplicate open orders as `failed` with
  reason `'superseded'` (never deletes a row) so the new index can be
  created — the only data-changing statement in either migration, and it
  only touches rows that were already ambiguous (more than one order open
  for the same fee/plan/booking at once).
- The Dockerfile's existing migration gate is unchanged and still correct:
  `CMD` runs `node dist/database/migrate.js up && ... && node dist/main` —
  `&&` short-circuits, so a failed migration means the container never
  starts serving traffic and Render's health check fails the deploy,
  rather than the app running against a schema it doesn't match. (This was
  fixed in an earlier session; re-verified unchanged here.)

## 3. `render.yaml` corrections made in this pass

- **Added `CSRF_SECRET`** — `env.validation.ts` requires it unconditionally
  (no default, not optional); it was missing from the blueprint entirely.
  The live service is running successfully, which is only possible if this
  is already set in the Render dashboard from before `render.yaml` existed
  — but a **fresh** Blueprint deploy (a new environment, a disaster-recovery
  rebuild) would crash at boot without this line. Now documented.
- **Added `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`**
  (audit C1) — confirmed via Render logs that these are currently unset in
  production, which is why it has been running on the mock payments
  provider. After this pass, `NODE_ENV=production` with these unset means
  payments are **disabled** (503, loud), never mock — see §4.
- **Added `PLATFORM_FEE_PERCENT`** (optional, defaults to 0 — documented
  as such, not forced).
- **Added `CRON_SECRET`** (audit H7) — required for the new
  `POST /internal/jobs/:job` external-scheduler endpoint to work at all;
  see `docs/scheduled-jobs.md`.
- **Documented (commented-out) `TRUST_PROXY_CIDRS` / `TRUST_PROXY_HOPS` /
  `DISABLE_INTERNAL_CRON`** — all three intentionally left unset for this
  deployment; the code's own production defaults already match Render's
  real topology (see `common/http/trusted-proxies.ts`), and the internal
  cron timers should stay on unless an external scheduler is confirmed
  reliable. Present as comments so a future operator knows they exist and
  when to use them, without the blueprint forcing a dashboard entry for
  values that are already correct by default.
- Did **not** add the already-correctly-optional provider keys that fall
  back to a mock/console implementation with no security exposure
  (`SENTRY_DSN`, `POSTHOG_API_KEY`, `ANTHROPIC_API_KEY`,
  `GOOGLE_GEMINI_API_KEY`, `VOYAGE_API_KEY`, `FCM_SERVICE_ACCOUNT_JSON_BASE64`,
  `SETU_*`) — those are genuinely fine to leave unset and are already
  documented in `backend/.env.example` and `handover.md`.

## 4. Production readiness — what a human still needs to do

None of the following was performed by the assistant.

1. **Back up the Neon "Tution" database** before the next deploy. The next
   deploy (whenever `master` next includes this branch's commits) will
   auto-run migrations `0040`–`0046` in one shot via the existing Dockerfile
   gate. They're verified safe (§2), but a backup is the correct precaution
   before any 7-migration jump on a live database, not a substitute for
   having verified them.
2. **Merge or repoint the release branch.** Production deploys from
   `master`; this pass's work (and every teaching-contexts commit before
   it) is on `teaching-contexts`. Decide and carry out the actual merge —
   this is a release-process decision for the project owner, not something
   to do silently as part of an audit-fix pass.
3. **Set the new Render environment variables** (dashboard → the
   `tuition-app-backend` service → Environment): `CSRF_SECRET` (confirm
   it's already set — see §3), `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
   `RAZORPAY_WEBHOOK_SECRET` (required before real payments can work at
   all — currently unset, so payments are correctly disabled rather than
   mocked), `CRON_SECRET` (required for the external-scheduler endpoint).
4. **Set up an external scheduler** for the jobs in
   `docs/scheduled-jobs.md` once `CRON_SECRET` is set — addresses the
   Render free-tier sleep problem (audit H7).
5. **Review the duplicate/suspended Render services** found during the
   audit: `tuition-app-backend-bsna`, `-h6bv`, `-nl4a`, `-23s0`, `-lau9`
   (all `suspended`, all appear to be artifacts of re-running the Blueprint
   wizard rather than reusing the existing service). These are Render
   **account** state, not repository configuration — `render.yaml` only
   ever describes the one intended service, so it cannot itself confirm or
   remove these, and the assistant does not delete infrastructure
   autonomously. Recommend reviewing and deleting the unneeded ones
   directly in the Render dashboard. The unrelated `almanac-backend`
   service (a different, Python-based project on the same account) is out
   of scope and was left untouched.
6. **Vercel**: no `render.yaml`-equivalent action needed — `NEXT_PUBLIC_API_URL`
   and the other web env vars are already confirmed set (per the earlier
   audit); the web deploy will pick up this branch's commits whenever the
   same `master` merge in step 2 happens, same as the backend.

## 5. What this pass deliberately did NOT do

- Did not run `git push`, merge to `master`, or trigger any Render/Vercel
  deploy.
- Did not modify or delete anything in the Render/Vercel/Neon dashboards.
- Did not apply migrations `0045`/`0046` to any database other than the
  local dev Postgres used to verify them.
