# Handover — full-blueprint status

This is the top-level status/handover doc for whoever picks up this repo next. It covers what's shipped against [`BLUEPRINT 2.md`](BLUEPRINT%202.md), what's verified, what still needs a human with account access, and known gaps. Technical reference (module map, every API endpoint, every DB migration) lives in [`docs/architecture.md`](docs/architecture.md), [`docs/api-reference.md`](docs/api-reference.md), and [`docs/database-schema.md`](docs/database-schema.md) — those are now stale on the web-routes side after the frontend build in §2 below and need a refresh; this file is current.

## 1. What's shipped — backend

All four blueprint phases (§10 roadmap) are implemented in code:

| Phase | Scope | Status |
|---|---|---|
| **1 — Tutor OS core** | Identity/auth, catalog, scheduling (batches/sessions/attendance/invites), materials, assignments, fee tracking | Shipped |
| **2 — Money + parents** | Razorpay subscriptions + trial enforcement, fee *collection* + payouts (Razorpay Route), parent accounts + consent, AI weekly digest, AI quiz generator, monitored messaging | Shipped |
| **3 — Student depth** | AI doubt solver (RAG + Socratic gate), student quiz-taking, progress/trends dashboards, parent premium tier | Shipped |
| **4 — Marketplace** | PostGIS tutor locations, Proof-of-Teaching score, 1:1 bookings + take rate, reschedule/cancellation policy, waitlist→booking conversion, verified-session-only reviews, discovery search/ranking + density gate | Shipped |

Full-stack observability (Sentry + PostHog) and a Retool admin read path are also code-complete (Milestone 18) — the account-side setup in §4 below has not been done.

## 2. What's shipped — web frontend

The web app originally only had UI for a slice of Phase 1 (Today/Batches/Fees/Profile — 10 routes). It's since been built out to cover every phase, **29 routes total**, in this priority order:

| Phase | What it covers |
|---|---|
| **Tutor dashboard** | Availability, Subjects & rates, Verification (upload + status), Billing & payouts (trial recap, plan checkout, payouts list) |
| **Marketplace** | Public `/discover` search + SEO `/t/[slug]` tutor profile pages (server-rendered), login-gated `/book/[slug]` booking + checkout flow, `/bookings` (reschedule/cancel/review), tutor-side `/dashboard/marketplace` (location, Proof-of-Teaching score, bookings management, waitlist notify) |
| **Parent portal** | New `/parent/**` area — link-a-child DPDP consent flow, per-child progress/digests/fee history, premium plan checkout |
| **Messaging** | Shared thread component, tutor (`/dashboard/messages`) and parent (`/parent/messages`) inboxes, monitored 3-way (tutor/student/parent) threads |
| **Notifications** | Header bell with unread badge, mark-read/mark-all, on both the tutor and parent shells |
| **Quizzes** | Tutor-authoring only: generate from a PDF material → edit questions → approve/reject → publish to a batch → view attempts |
| **AI tools** | "Index for AI" button wiring a material into the doubt-solver's embeddings |

**Deliberate scope decision**: students stay mobile-only (matches the app's pre-existing design intent). Quiz-*taking* and doubt-solver *asking* are student actions and have no web UI — only the tutor-authoring and parent-consumption sides were built.

**Real bugs found and fixed while building this** (worth knowing about, not just cosmetic):
- `web/src/lib/api.ts`'s shared request helper crashed with `Unexpected end of JSON input` on any endpoint returning an empty 200 body for a not-yet-created resource (e.g. `GET /marketplace/locations/me` before a tutor sets one). Fixed to treat an empty body as `null`. This likely also affected the pre-existing Profile page for a brand-new tutor before this fix.
- `MessagesService.listThreadsForParent` (backend) never tagged which child each flattened thread belonged to — a parent with more than one linked child had no way to open a specific conversation. One-line fix.
- `api.patch` didn't exist on the shared client at all (only get/post/put/delete) — added for the quiz question-editing flow.

**Two small, explicitly-flagged backend additions** (not silently smuggled in): `GET /fees/student/:studentId` (blueprint §3 requires parent-visible fee history; no endpoint existed) and `GET /assignments/submissions/:id/download-urls` (tutors had no way to view a student's submitted files at all).

## 3. What's verified

- Backend: `nest build` clean, `npm test` — 7/7 passing.
- Web: full production `next build` clean across all 29 routes.
- Every new frontend phase was browser-tested end-to-end against the real local API (not just "it renders") — including a genuine 3-way messaging conversation, a real AI-generated quiz taken by a real student account with the tutor's attempts view showing the actual score, and a full Razorpay checkout round-trip (mock-provider path) for each of the three purchase flows (tutor subscription, parent premium, marketplace booking).
- Known pre-existing lint debt (not introduced by this pass) remains in payments/payouts/messaging/notifications/parents modules — left alone, out of scope.

Not verified: mobile build (Flutter), or the Razorpay/WhatsApp/Sentry/PostHog integrations against real credentials (all are env-gated and mock-backed in dev).

## 4. Known gaps

- **Backend isn't deployed anywhere.** No Fly.io (or equivalent) app exists, no Dockerfile/`fly.toml` in the repo. This was explicitly stopped mid-setup in an earlier pass — see §5.6 below for what's still needed.
- **`mobile/login_screen.png` is a committed screenshot** (tracked in git, not gitignored) — a debug artifact, not an asset the app loads. Harmless but still there; a cleanup task was flagged for this but hasn't landed.
- **No shared job-queue module.** Redis is provisioned (OTP/refresh-token storage), but scheduled/async work (digest generation, reminder cadences) lives inline in each module's service rather than a BullMQ-backed queue, despite blueprint §6 calling for BullMQ. Fine at current scale.
- **`docs/architecture.md` and `docs/api-reference.md` are stale on the web side** — they still describe the old 10-route web app. Needs a refresh to reflect the 29 routes in §2 above; the backend/schema portions of those docs are still accurate.
- **Real payment/messaging/OTP providers are still unconfigured** — Razorpay, WhatsApp Cloud API, Sentry, PostHog all have real-provider code but no live credentials; everything currently runs on mock/console providers. See §5.

## 5. Manual setup steps (need a human with account access)

### 5.1 Android release signing — done, but the keystore needs backing up

A release keystore was generated on the dev machine at `E:\tuition-app-secrets\upload-keystore.jks` (credentials alongside it in `keystore-credentials.txt`) and wired into `mobile/android` via a gitignored `key.properties` — never committed, by design. A release-signed AAB and APK were built and verified (checked with `apksigner`, confirmed the release cert, not the debug one).

**This keystore is currently a single point of failure** — it exists only on that one machine. If it's lost, Google can never reissue it and this app can never be updated under the same Play Store listing again. Whoever has account access needs to:
1. Back up `E:\tuition-app-secrets\` (both files) somewhere durable — a password manager or encrypted backup, not just a copy on the same disk.
2. Share it with the rest of the team through a secure channel if more than one person will cut releases.
3. **Never regenerate a new keystore** to "fix" a missing one — a fresh keystore is a different signing identity and can't update an app already published under the old one.

### 5.2 Sentry (error tracking)

You need **three** DSNs — one per platform, so errors triage by surface instead of landing in one undifferentiated stream.

1. Create/sign in to a Sentry org at [sentry.io](https://sentry.io).
2. Create three projects:
   - **Node.js** platform → name it `tuition-backend`
   - **Next.js** platform → name it `tuition-web`
   - **Flutter** platform → name it `tuition-mobile`
3. Each project's **Settings → Client Keys (DSN)** page has the DSN string (`https://<key>@<org>.ingest.sentry.io/<project>`).
4. Set them:
   - Backend: `SENTRY_DSN` in `backend/.env` (see `backend/.env.example`)
   - Web: `NEXT_PUBLIC_SENTRY_DSN` — set in **Vercel**, not `.env` (see §5.4 below)
   - Mobile: passed at build time, not stored in a file:
     ```bash
     flutter build apk --dart-define=SENTRY_DSN=https://...
     ```
     Codemagic (or whatever CI eventually builds release binaries) needs this as a secret env var wired into the build command.
5. For web, source-map upload also needs an **auth token** (Sentry → Settings → Auth Tokens → new token with `project:releases` scope) — this is `SENTRY_AUTH_TOKEN` in Vercel, alongside `SENTRY_ORG` (your org slug) and `SENTRY_PROJECT` (`tuition-web`). Without it, Next.js still reports errors fine — you just get minified stack traces instead of readable ones.
6. Everything is env-gated: unset DSN = Sentry silently disabled, no crashes, no build failures. You can ship this DSN-less and add it later without touching code.

### 5.3 PostHog (product analytics + feature flags)

One project, three write locations.

1. Create a project at [posthog.com](https://posthog.com) (US or EU cloud — pick based on where your users are; blueprint targets India, so US cloud is the closer/default choice unless you have a data-residency reason otherwise).
2. **Settings → Project API Key** gives you the key. Host is `https://us.i.posthog.com` (or `https://eu.i.posthog.com`).
3. Set:
   - Backend (server-side capture): `POSTHOG_API_KEY` + `POSTHOG_HOST` in `backend/.env`
   - Web (client-side): `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` — in Vercel (see §5.4)
   - Mobile: build-time dart-define, same pattern as Sentry:
     ```bash
     flutter build apk --dart-define=POSTHOG_API_KEY=phc_...
     ```
4. Same as Sentry — unset key means events are dropped with a one-line warning, nothing breaks.

### 5.4 Vercel env vars (web deployment) — deployment is live, env vars still need checking

The web app deploys via Vercel directly from git (no CI pipeline in this repo) and **is live** at `tution-xi-eosin.vercel.app`, confirmed serving the landing page correctly. (One gotcha hit and fixed during setup: the Vercel project's **Root Directory** field had `WEB` in uppercase instead of lowercase `web` — Vercel's Linux build servers are case-sensitive even though Windows isn't, so it silently failed to find the app despite the build showing "Ready". If you ever recreate this project, set Root Directory to exactly `web`, lowercase.)

`NEXT_PUBLIC_API_URL` still needs to point at a real deployed backend once one exists (§4 — backend isn't deployed anywhere yet) — until then, login/dashboard/booking flows on the live site won't work, only the static marketing pages will. In the Vercel project dashboard → **Settings → Environment Variables**, set:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | your deployed backend URL | e.g. Fly.io app URL — not set yet, see §4 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same as backend's `GOOGLE_CLIENT_ID` | must match exactly — frontend requests the ID token the backend verifies |
| `NEXT_PUBLIC_SENTRY_DSN` | from §5.2 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_KEY` | from §5.3 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_HOST` | from §5.3 step 2 | omit to disable |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | your Razorpay public key | omit to keep using the mock-provider checkout path |
| `SENTRY_AUTH_TOKEN` | from §5.2 step 5 | build-time only, source-map upload |
| `SENTRY_ORG` | your Sentry org slug | build-time only |
| `SENTRY_PROJECT` | `tuition-web` | build-time only |

Set each for whichever Vercel environments you use (Production / Preview / Development) — at minimum Production.

### 5.5 Retool admin workspace + the `ALTER ROLE` password step

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

### 5.6 Backend deployment target — still not started

Blueprint §6 targets Fly.io + managed Postgres (Neon at MVP). No deploy pipeline is wired up in this repo — provisioning a Fly.io app (or equivalent), setting `backend/.env.example`'s variables as secrets there, and pointing `DATABASE_URL`/`REDIS_URL` at managed instances (with PostGIS + pgvector enabled — see [`docs/database-schema.md`](docs/database-schema.md#extensions-in-use)) is still a from-scratch setup step. This is the single biggest remaining gap — until it's done, the live Vercel deployment can't actually do anything beyond serve static pages.

## Known environment note (not a setup step, just FYI)

The Android debug build was hanging indefinitely on one dev machine due to a local network proxy throttling Gradle's dependency downloads to a trickle. Fixed via `org.gradle.internal.http.*` timeout properties in `C:\Users\<you>\.gradle\gradle.properties` — **outside this repo**, machine-local by design (Gradle timeout tuning isn't project config). If a fresh machine or CI runner hits the same symptom (a Gradle daemon that never progresses past resolving the Kotlin/AGP buildscript classpath), the fix is documented inline in that file's comments on the original machine, or see commit `bbf5df1`'s message for the diagnosis.
