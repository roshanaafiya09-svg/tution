# Milestone 18 handover — manual setup steps

Everything code-side for Sentry/PostHog observability and Retool admin
access is merged (`bbf5df1`). Four things remain that only a human with
account access can do — none of them are code changes. Written as a
runbook: work top to bottom.

---

## 1. Sentry (error tracking)

You need **three** DSNs — one per platform, so errors triage by surface
instead of landing in one undifferentiated stream.

1. Create/sign in to a Sentry org at [sentry.io](https://sentry.io).
2. Create three projects:
   - **Node.js** platform → name it `tuition-backend`
   - **Next.js** platform → name it `tuition-web`
   - **Flutter** platform → name it `tuition-mobile`
3. Each project's **Settings → Client Keys (DSN)** page has the DSN
   string (`https://<key>@<org>.ingest.sentry.io/<project>`).
4. Set them:
   - Backend: `SENTRY_DSN` in `backend/.env` (see `backend/.env.example`)
   - Web: `NEXT_PUBLIC_SENTRY_DSN` — set in **Vercel**, not `.env` (see
     §3 below)
   - Mobile: passed at build time, not stored in a file:
     ```bash
     flutter build apk --dart-define=SENTRY_DSN=https://...
     ```
     Codemagic (or whatever CI eventually builds release binaries) needs
     this as a secret env var wired into the build command.
5. For web, source-map upload also needs an **auth token** (Sentry →
   Settings → Auth Tokens → new token with `project:releases` scope) —
   this is `SENTRY_AUTH_TOKEN` in Vercel, alongside `SENTRY_ORG` (your
   org slug) and `SENTRY_PROJECT` (`tuition-web`). Without it, Next.js
   still reports errors fine — you just get minified stack traces
   instead of readable ones.
6. Everything is env-gated: unset DSN = Sentry silently disabled, no
   crashes, no build failures. You can ship this DSN-less and add it
   later without touching code.

## 2. PostHog (product analytics + feature flags)

One project, three write locations.

1. Create a project at [posthog.com](https://posthog.com) (US or EU
   cloud — pick based on where your users are; blueprint targets India,
   so US cloud is the closer/default choice unless you have a data-
   residency reason otherwise).
2. **Settings → Project API Key** gives you the key. Host is
   `https://us.i.posthog.com` (or `https://eu.i.posthog.com`).
3. Set:
   - Backend (server-side capture): `POSTHOG_API_KEY` +
     `POSTHOG_HOST` in `backend/.env`
   - Web (client-side): `NEXT_PUBLIC_POSTHOG_KEY` +
     `NEXT_PUBLIC_POSTHOG_HOST` — in Vercel (see §3)
   - Mobile: build-time dart-define, same pattern as Sentry:
     ```bash
     flutter build apk --dart-define=POSTHOG_API_KEY=phc_...
     ```
4. Same as Sentry — unset key means events are dropped with a one-line
   warning, nothing breaks.

## 3. Vercel env vars (web deployment)

The web app deploys via Vercel directly (no CI pipeline in this repo).
In the Vercel project dashboard → **Settings → Environment Variables**,
set:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | your deployed backend URL | e.g. Fly.io app URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same as backend's `GOOGLE_CLIENT_ID` | must match exactly — frontend requests the ID token the backend verifies |
| `NEXT_PUBLIC_SENTRY_DSN` | from §1 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_KEY` | from §2 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_HOST` | from §2 step 2 | omit to disable |
| `SENTRY_AUTH_TOKEN` | from §1 step 5 | build-time only, source-map upload |
| `SENTRY_ORG` | your Sentry org slug | build-time only |
| `SENTRY_PROJECT` | `tuition-web` | build-time only |

Set each for whichever Vercel environments you use (Production /
Preview / Development) — at minimum Production.

## 4. Retool admin workspace + the `ALTER ROLE` password step

Migration `0011_retool_readonly_role.ts` (already applied, both locally
and wherever `npm run migrate:up` has run in each environment) creates
a Postgres role, `retool_readonly`, with `SELECT`-only access to every
table — deliberately no write access, so admin actions still have to go
through the authenticated REST API and land in the append-only
`audit_logs` table. It does **not** set a password (migrations never
commit secrets), so:

1. Generate a strong password (`openssl rand -base64 24` works).
2. Connect to the target Postgres instance as an admin and run:
   ```sql
   ALTER ROLE retool_readonly WITH PASSWORD '<paste-generated-secret>';
   ```
   Do this per environment (local, staging, prod) — each gets its own
   password, none of them committed anywhere.
3. In Retool, create a new **Postgres resource**:
   - Host/port/database: same as your `DATABASE_URL`
   - User: `retool_readonly`
   - Password: what you just set in step 2
   - SSL: on for any non-local environment
4. Build admin views/queries against that resource. **Never** wire a
   Retool button to a raw SQL `UPDATE`/`INSERT`/`DELETE` against this
   connection — it has no write grants and would just fail, but more
   importantly, *any* admin write needs to go through the REST API so
   it's audit-logged. If a workflow needs a write, it needs a backend
   endpoint, not a Retool mutation query.
5. Recommended: put Retool itself behind SSO + MFA (blueprint §2) —
   this doc doesn't cover Retool's own workspace security settings,
   only the DB connection.

---

## Known environment note (not a setup step, just FYI)

The Android debug build was hanging indefinitely on this machine due to
a local network proxy throttling Gradle's dependency downloads to a
trickle. Fixed via `org.gradle.internal.http.*` timeout properties in
`C:\Users\<you>\.gradle\gradle.properties` — **outside this repo**,
machine-local by design (Gradle timeout tuning isn't project config).
If a fresh machine or CI runner hits the same symptom (a Gradle daemon
that never progresses past resolving the Kotlin/AGP buildscript
classpath), the fix is documented inline in that file's comments on
this machine, or see commit `bbf5df1`'s message for the diagnosis.
