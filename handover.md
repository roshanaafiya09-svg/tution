# Handover — full-blueprint status

This is the top-level status/handover doc for whoever picks up this repo next. It covers what's shipped against [`BLUEPRINT 2.md`](BLUEPRINT%202.md), what's verified, what still needs a human with account access, and known gaps. Technical reference (module map, every API endpoint, every DB migration) lives in [`docs/architecture.md`](docs/architecture.md), [`docs/api-reference.md`](docs/api-reference.md), and [`docs/database-schema.md`](docs/database-schema.md) — this file is status and setup, not a spec.

## 1. What's shipped

All four blueprint phases (§10 roadmap) are implemented in code, in order, one commit-set per feature:

| Phase | Scope | Status |
|---|---|---|
| **1 — Tutor OS core** | Identity/auth, catalog, scheduling (batches/sessions/attendance/invites), materials, assignments, fee tracking, web dashboard, mobile shell | Shipped (Milestones 1–17) |
| **2 — Money + parents** | Razorpay subscriptions + trial enforcement, fee *collection* + payouts (Razorpay Route), parent accounts + consent, AI weekly digest, AI quiz generator, monitored messaging | Shipped |
| **3 — Student depth** | AI doubt solver (RAG + Socratic gate), student quiz-taking, progress/trends dashboards, parent premium tier | Shipped |
| **4 — Marketplace** | PostGIS tutor locations, Proof-of-Teaching score, 1:1 bookings + take rate, reschedule/cancellation policy, waitlist→booking conversion, verified-session-only reviews, discovery search/ranking + density gate | Shipped |

Full-stack observability (Sentry + PostHog) and a Retool admin read path are also in (Milestone 18) — code-complete, but the account-side setup in §3 below has not been done.

## 2. What's verified (this pass)

- 10 local commits pushed to `origin/master` cleanly (fast-forward, no conflicts).
- Backend: `nest build` clean, `npm test` — 7/7 passing.
- Web: `next build` clean — 10 routes compiled (see [`docs/api-reference.md`](docs/api-reference.md#web-routes)).
- Known pre-existing lint debt (not introduced by Phase 4) remains in payments/payouts/messaging/notifications/parents modules — left alone, out of scope for this pass.

Not verified in this pass: mobile build (Flutter), end-to-end runtime behavior against a live Postgres/Redis, or the Razorpay/WhatsApp/Sentry/PostHog integrations against real credentials (all are env-gated and mock-backed in dev — see [`docs/architecture.md`](docs/architecture.md#backend--nestjs-modular-monolith)).

## 3. Known gaps

- **No web page for public tutor discovery/SEO.** The backend's `GET /marketplace/discovery/tutors/:slug` and `GET /profiles/tutor/:slug` are live and public, but no Next.js route consumes them (checked `web/src/app` — only `/`, `/login`, `/join/[token]`, `/dashboard/**` exist). Blueprint §2 calls for SSR SEO tutor profile pages at `/tutor/priya-physics-anna-nagar`-style slugs; that page hasn't been built. This is the natural next step for anyone picking up marketplace-facing frontend work.
- **No Android release keystore.** `mobile/android` has no signing config beyond debug; a `flutter build apk --release` today would either fail or silently fall back to debug signing depending on Gradle config. Needs a keystore generated and wired into `key.properties` (not committed) before a real release build.
- **Vercel project linkage unconfirmed.** `handover.md` (this file, previously) documented the env vars a Vercel project needs, but there's no `vercel` CLI installed locally and no way from this environment to confirm a Vercel project is already linked to this GitHub repo. Check the Vercel dashboard directly.
- **`mobile/login_screen.png` is a committed screenshot** (tracked in git, not gitignored) — looks like a debug artifact rather than an asset the app loads. Harmless but worth removing in a cleanup pass.
- **No shared job-queue module.** Redis is provisioned and used for OTP/refresh-token storage, but scheduled/async work (digest generation, reminder cadences) currently lives inline in each module's service rather than a BullMQ-backed queue, despite blueprint §6 calling for BullMQ. Fine at current scale; revisit if job volume grows.

## 4. Manual setup steps (need a human with account access)

None of these are code changes — they're account/dashboard configuration. Work top to bottom.

### 4.1 Sentry (error tracking)

You need **three** DSNs — one per platform, so errors triage by surface instead of landing in one undifferentiated stream.

1. Create/sign in to a Sentry org at [sentry.io](https://sentry.io).
2. Create three projects:
   - **Node.js** platform → name it `tuition-backend`
   - **Next.js** platform → name it `tuition-web`
   - **Flutter** platform → name it `tuition-mobile`
3. Each project's **Settings → Client Keys (DSN)** page has the DSN string (`https://<key>@<org>.ingest.sentry.io/<project>`).
4. Set them:
   - Backend: `SENTRY_DSN` in `backend/.env` (see `backend/.env.example`)
   - Web: `NEXT_PUBLIC_SENTRY_DSN` — set in **Vercel**, not `.env` (see §4.3 below)
   - Mobile: passed at build time, not stored in a file:
     ```bash
     flutter build apk --dart-define=SENTRY_DSN=https://...
     ```
     Codemagic (or whatever CI eventually builds release binaries) needs this as a secret env var wired into the build command.
5. For web, source-map upload also needs an **auth token** (Sentry → Settings → Auth Tokens → new token with `project:releases` scope) — this is `SENTRY_AUTH_TOKEN` in Vercel, alongside `SENTRY_ORG` (your org slug) and `SENTRY_PROJECT` (`tuition-web`). Without it, Next.js still reports errors fine — you just get minified stack traces instead of readable ones.
6. Everything is env-gated: unset DSN = Sentry silently disabled, no crashes, no build failures. You can ship this DSN-less and add it later without touching code.

### 4.2 PostHog (product analytics + feature flags)

One project, three write locations.

1. Create a project at [posthog.com](https://posthog.com) (US or EU cloud — pick based on where your users are; blueprint targets India, so US cloud is the closer/default choice unless you have a data-residency reason otherwise).
2. **Settings → Project API Key** gives you the key. Host is `https://us.i.posthog.com` (or `https://eu.i.posthog.com`).
3. Set:
   - Backend (server-side capture): `POSTHOG_API_KEY` + `POSTHOG_HOST` in `backend/.env`
   - Web (client-side): `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` — in Vercel (see §4.3)
   - Mobile: build-time dart-define, same pattern as Sentry:
     ```bash
     flutter build apk --dart-define=POSTHOG_API_KEY=phc_...
     ```
4. Same as Sentry — unset key means events are dropped with a one-line warning, nothing breaks.

### 4.3 Vercel env vars (web deployment)

The web app is designed to deploy via Vercel directly from git (no CI pipeline in this repo). **Confirm a Vercel project is actually linked to this GitHub repo first** — that wasn't verifiable from this environment (no `vercel` CLI installed). If it's not linked yet, see §5 below.

In the Vercel project dashboard → **Settings → Environment Variables**, set:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | your deployed backend URL | e.g. Fly.io app URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same as backend's `GOOGLE_CLIENT_ID` | must match exactly — frontend requests the ID token the backend verifies |
| `NEXT_PUBLIC_SENTRY_DSN` | from §4.1 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_KEY` | from §4.2 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_HOST` | from §4.2 step 2 | omit to disable |
| `SENTRY_AUTH_TOKEN` | from §4.1 step 5 | build-time only, source-map upload |
| `SENTRY_ORG` | your Sentry org slug | build-time only |
| `SENTRY_PROJECT` | `tuition-web` | build-time only |

Set each for whichever Vercel environments you use (Production / Preview / Development) — at minimum Production.

### 4.4 Retool admin workspace + the `ALTER ROLE` password step

Migration `0011_retool_readonly_role.ts` (already applied, both locally and wherever `npm run migrate:up` has run in each environment) creates a Postgres role, `retool_readonly`, with `SELECT`-only access to every table — deliberately no write access, so admin actions still have to go through the authenticated REST API and land in the append-only `audit_logs` table. It does **not** set a password (migrations never commit secrets), so:

1. Generate a strong password (`openssl rand -base64 24` works).
2. Connect to the target Postgres instance as an admin and run:
   ```sql
   ALTER ROLE retool_readonly WITH PASSWORD '<paste-generated-secret>';
   ```
   Do this per environment (local, staging, prod) — each gets its own password, none of them committed anywhere.
3. In Retool, create a new **Postgres resource**:
   - Host/port/database: same as your `DATABASE_URL`
   - User: `retool_readonly`
   - Password: what you just set in step 2
   - SSL: on for any non-local environment
4. Build admin views/queries against that resource. **Never** wire a Retool button to a raw SQL `UPDATE`/`INSERT`/`DELETE` against this connection — it has no write grants and would just fail, but more importantly, *any* admin write needs to go through the REST API so it's audit-logged. If a workflow needs a write, it needs a backend endpoint, not a Retool mutation query.
5. Recommended: put Retool itself behind SSO + MFA (blueprint §2) — this doc doesn't cover Retool's own workspace security settings, only the DB connection.

### 4.5 Android release signing

No keystore exists on this machine or in the repo (by design — never commit one). Before a release build:

1. Generate a keystore: `keytool -genkey -v -keystore <path>/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `mobile/android/key.properties` (gitignored) pointing at it — Flutter's docs cover the exact `key.properties` + `build.gradle` wiring.
3. Store the keystore itself and its passwords in a password manager / CI secret store, never in the repo.
4. Then `flutter build appbundle --release` (Play Store wants an AAB, not an APK, for new submissions).

### 4.6 Backend deployment target

Blueprint §6 targets Fly.io + managed Postgres (Neon at MVP). No deploy pipeline is wired up in this repo — provisioning a Fly.io app (or equivalent), setting `backend/.env.example`'s variables as secrets there, and pointing `DATABASE_URL`/`REDIS_URL` at managed instances (with PostGIS + pgvector enabled — see [`docs/database-schema.md`](docs/database-schema.md#extensions-in-use)) is still a from-scratch setup step.

## 5. Web deployment (Vercel) — if not already linked

If §4.3 confirms no Vercel project exists yet for this repo:

1. Sign in to [vercel.com](https://vercel.com), **Add New Project**, import this GitHub repo.
2. Set **Root Directory** to `web/` (this is a monorepo — Vercel needs to know the Next.js app isn't at the repo root).
3. Framework preset should auto-detect Next.js. Build command `next build` (default), install command `npm install` (default).
4. Add the environment variables from §4.3 before the first deploy, or the build will succeed but the app will call a nonexistent API.
5. Trigger a deploy (push to `master`, or Vercel's dashboard "Deploy" button).

This step requires a Vercel account login and cannot be done from this environment — hand-off to whoever has (or will create) that account.

## Known environment note (not a setup step, just FYI)

The Android debug build was hanging indefinitely on one dev machine due to a local network proxy throttling Gradle's dependency downloads to a trickle. Fixed via `org.gradle.internal.http.*` timeout properties in `C:\Users\<you>\.gradle\gradle.properties` — **outside this repo**, machine-local by design (Gradle timeout tuning isn't project config). If a fresh machine or CI runner hits the same symptom (a Gradle daemon that never progresses past resolving the Kotlin/AGP buildscript classpath), the fix is documented inline in that file's comments on the original machine, or see commit `bbf5df1`'s message for the diagnosis.
