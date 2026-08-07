# Handover — full-blueprint status

This is the top-level status/handover doc for whoever picks up this repo next. It covers what's shipped against [`BLUEPRINT 2.md`](BLUEPRINT%202.md), what's verified, what still needs a human with account access, and known gaps. Technical reference (module map, every API endpoint, every DB migration) lives in [`docs/architecture.md`](docs/architecture.md), [`docs/api-reference.md`](docs/api-reference.md), and [`docs/database-schema.md`](docs/database-schema.md) — those are stale on the web-routes side (still describe the pre-marketplace-build web app) and need a refresh; this file is current. They're unaffected by the visual redesign in §3 below, since that pass touched no endpoints or schema.

## 1. What's shipped — backend

All four blueprint phases (§10 roadmap) are implemented in code:

| Phase | Scope | Status |
|---|---|---|
| **1 — Tutor OS core** | Identity/auth, catalog, scheduling (batches/sessions/attendance/invites), materials, assignments, fee tracking | Shipped |
| **2 — Money + parents** | Razorpay subscriptions + trial enforcement, fee *collection* + payouts (Razorpay Route), parent accounts + consent, AI weekly digest, AI quiz generator, monitored messaging | Shipped |
| **3 — Student depth** | AI doubt solver (RAG + Socratic gate), student quiz-taking, progress/trends dashboards, parent premium tier | Shipped |
| **4 — Marketplace** | PostGIS tutor locations, Proof-of-Teaching score, 1:1 bookings + take rate, reschedule/cancellation policy, waitlist→booking conversion, verified-session-only reviews, discovery search/ranking + density gate | Shipped |

Full-stack observability (Sentry + PostHog) and a Retool admin read path are also code-complete (Milestone 18) — the account-side setup in §6 below has not been done.

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

Every route listed above has since been through a full visual redesign — see §3.

## 3. Design system redesign — web + mobile ("Scholar v2")

A follow-up pass took every screen on both platforms through a full visual/UX redesign, screen by screen, one commit per screen — see `git log` from `be36d55` through `2f50086`. **Zero business logic, API calls, or routes changed** — this was presentation-only, on top of the features shipped in §1/§2.

**What changed:**
- Brand kept, execution rebuilt. The existing "Scholar" identity (deep indigo + marigold amber, Fraunces/Inter, warm neutrals — documented in [`docs/design-system.md`](docs/design-system.md)) was judged sound and kept; what didn't exist was a complete *component system* on top of it.
- New component libraries on both platforms (neither existed before):
  - Web — `web/src/components/ui/`: Button, Card family, Field/Input/Textarea/Select, StatusBadge/Badge, EmptyState, Skeleton/Spinner/PageLoading, ErrorState/InlineError, Table primitives, and Radix-backed Dialog/Toast/Tooltip/DropdownMenu/Popover for real accessibility (focus trap, `aria-live`, keyboard nav). New deps: `lucide-react`, `class-variance-authority` + `clsx` + `tailwind-merge`, `@radix-ui/react-{dialog,dropdown-menu,toast,tooltip,popover}`, `tailwindcss-animate`.
  - Mobile — `mobile/lib/widgets/`: `AppCard`, `SectionLabel`, `LoadingView`/`ErrorView`/`EmptyStateView`, `StatusChip`, `AppSnackbar`, `FormErrorBanner` — replacing widgets that were previously hand-duplicated privately in every screen. No new mobile dependencies (stays inside the blueprint's <40MB app-size budget).
- Full dark-mode coverage added on web (the app had `darkMode` configured but almost no `dark:` classes anywhere before this). Mobile already had light/dark `ThemeData`; `design_tokens.dart` gained the full typography scale, shadow tokens, and spacing scale it was missing relative to the web token set, plus accessible dark-mode text tints.
- `shared/design-tokens/tokens.json` gained a `.dark` key per semantic color (success/warning/error/info) for accessible contrast on dark surfaces — additive only, consumed by both platforms.
- Destructive confirmations (account deletion) moved from inline expanding panels to real modals — a `Dialog` on web, a native `AlertDialog` on mobile — on the reasoning that an irreversible action shouldn't be dismissible by scrolling past it.

**Real bugs found and fixed during this pass:**
- A Next.js Server/Client component boundary bug: `buttonVariants` (a plain CVA function) lived inside a `'use client'` file and was called directly from a Server Component (the landing page). Next.js wraps every export of a client module as an opaque reference when a Server Component imports it, so calling it threw `"buttonVariants is not a function"` at runtime — invisible to `tsc --noEmit`, only caught by actually loading the page. Fixed by moving the `cva()` call into a new non-client `button-variants.ts`.
- `/bookings` showed an error message *and* a perpetual loading spinner at the same time on a failed fetch (the `catch` handler never resolved `bookings` out of its `null` state). Fixed.
- The redesigned dashboard/parent-shell mobile nav row initially dropped the "Business" submenu links entirely below the `md` breakpoint — caught and fixed in the same pass, before it shipped.

**Verification:**
- Web: every one of the 29 routes passed `tsc --noEmit` and a full production `next build` (checked clean after every single commit), plus live browser testing against the real local API — a full new-tutor and new-parent signup flow end to end, batch tab navigation, a real quiz draft review/publish, the account-deletion confirmation dialog (opened and cancelled, confirmed not deleted), and an actual message send/receive round-trip.
- Mobile: `flutter analyze` is clean across the whole app after every commit (checked after each of the 7 screens). **Visual rendering was not confirmed.** Flutter's web build renders through a closed-shadow-DOM CanvasKit surface with no accessible text or canvas content from outside, and screenshot compositing was unavailable in the environment this pass was done in — neither of the two methods that worked for verifying the web app applied to Flutter. `flutter build apk`/`flutter build web` were also not run in this pass (only `analyze`). **A manual pass on a real device/emulator is strongly recommended before shipping the mobile redesign to users.**

**Recurring environment note (not a code bug):** the Next.js dev server repeatedly hit a `.next` webpack-cache corruption issue while this pass was in progress — symptoms were things like `Cannot find module './85.js'`, `.../vendor-chunks/@opentelemetry.js`, or core chunks (`main-app.js`, `app-pages-internals.js`) 404ing after a hot-reload. Unrelated to the redesign's own code; most likely a Sentry/OpenTelemetry-instrumentation-plus-Windows-dev-server interaction. Always resolved by stopping the server, `rm -rf .next`, and restarting — never seen in a production `next build`. If a future session hits the same symptom, that's the fix.

## 4. What's verified

- Backend: `nest build` clean, `npm test` — 7/7 passing.
- Web: full production `next build` clean across all 29 routes (re-confirmed after the §3 redesign).
- Every frontend phase from §2 was browser-tested end-to-end against the real local API when it was first built — including a genuine 3-way messaging conversation, a real AI-generated quiz taken by a real student account with the tutor's attempts view showing the actual score, and a full Razorpay checkout round-trip (mock-provider path) for each of the three purchase flows (tutor subscription, parent premium, marketplace booking). See §3 for the redesign pass's own (separate) verification.
- Known pre-existing lint debt (not introduced by either pass) remains in payments/payouts/messaging/notifications/parents modules — left alone, out of scope.

Not verified: mobile visual rendering after the §3 redesign (see §3 for why), or the Razorpay/WhatsApp/Email-OTP/Telegram-OTP/Sentry/PostHog integrations against real credentials (all are env-gated and mock/console-backed in dev). Email/Telegram OTP's *code paths* — signup, login, invalid OTP, contact persistence, provider fallback — were exercised end-to-end against the live local stack via `ConsoleOtpProvider` (see §6.8/§6.9); only the actual SMTP/Telegram Bot API calls are unverified, same gap class as WhatsApp.

## 5. Known gaps

- **Backend is deployed and live** (Render + Neon + Upstash), `NEXT_PUBLIC_API_URL` is set in Vercel, and a full production QA pass (tutor, parent, and public marketplace/booking flows, plus OTP login for all three roles) has been run against the real stack. See §6.6 for exact status. `web/src/lib/api.ts` throws a clear error on a missing `NEXT_PUBLIC_API_URL` rather than silently falling back to `http://localhost:3001`, which used to produce an opaque `net::ERR_CONNECTION_REFUSED` with no indication of the actual cause — kept as a guard even though the var is now set.
- **Mobile redesign (§3) hasn't been visually confirmed on a device/emulator.** `flutter analyze` is clean, but that's not the same as seeing it render — see §3 for the tooling limitation that caused this.
- **`mobile/login_screen.png` is a committed screenshot** (tracked in git, not gitignored) — a debug artifact, not an asset the app loads. Harmless but still there; a cleanup task was flagged for this but hasn't landed.
- **No shared job-queue module.** Redis is provisioned (OTP/refresh-token storage), but scheduled/async work (digest generation, reminder cadences) lives inline in each module's service rather than a BullMQ-backed queue, despite blueprint §6 calling for BullMQ. Fine at current scale.
- **Real payment/OTP providers are still unconfigured** — Razorpay, Telegram Bot API, Sentry, PostHog all have real-provider code but no live credentials; everything currently runs on mock/console providers. See §6.
- **Auth rearchitected to phone-or-email login, Telegram-only delivery** *(new, supersedes the WhatsApp/Email OTP work below)* — `TelegramOtpProvider` is now the sole real delivery channel (`ConsoleOtpProvider` stays as the zero-credential dev fallback); `WhatsAppCloudApiOtpProvider` and `EmailOtpProvider` (Nodemailer/SMTP) were both deleted, along with their env vars. Sign-in now accepts either a phone number or an email as the login `identifier` (generalized from the old phone-only `phoneE164` key throughout `OtpRepository`/`OtpService` — same hashing/TTL/rate-limit constants, just keyed by a different string). Because a Telegram bot can't message anyone who hasn't messaged it first, every account must *connect* Telegram once — a new linking subsystem (`TelegramLinkRepository`/`TelegramLinkService`/`TelegramUpdatesPoller`) issues a `t.me/<bot>?start=<token>` deep link, long-polls `getUpdates` to learn the resulting chat id, and only then does `POST /auth/otp/request` succeed (403 `telegramLinkRequired` otherwise). **Security-relevant design point:** `POST /auth/telegram/link/start` refuses to link an identifier that already has an account (409) — self-linking is only safe for a brand-new signup, otherwise anyone could attach their own Telegram to someone else's phone/email and start receiving that account's login codes. This means **all ~20 pre-existing accounts (0 with an email, 0 with a `telegram_chat_id`) are locked out of login until connected out-of-band** — there is deliberately no admin/self-serve path for that yet. Migration `0026` adds a unique index on `users.email` (partial, live rows only) so email is unambiguous as a login key; `phone_e164` stays `NOT NULL` on purpose. `POST /auth/contact` now only sets `email` — it can no longer accept a client-supplied `telegramChatId`, since a chat id must come from Telegram itself. Full walkthrough, troubleshooting, and what's verified vs. not: §6.7.
- **Object storage (Supabase Storage) is provisioned and live** — verified end-to-end in production (presigned upload → download → delete, confirmed the object is actually gone from the bucket afterward, not just the DB row). No longer a gap.
- **No UI anywhere lets a student generate a parent-invite code** *(fixed)* — `POST /parent-links/invite` (student-only) had zero caller in web or mobile; the entire parent portal was unreachable by a real user. Added to mobile Settings (student-only, since students are mobile-only). Found and fixed in a pre-launch audit.
- **"Sign out" never revoked the refresh token server-side** *(fixed)* — only cleared local storage; a copied/leaked refresh token stayed valid for its full 30-day life. Added `POST /auth/logout` and wired both web and mobile to call it. Verified live: a never-refreshed token is rejected immediately after logout.
- **Sending a message never notified anyone** *(fixed)* — `MessagesService.send()` wrote the row and nothing else, unlike every other user-facing action. Now notifies every other thread participant. Verified live.
- **`request.ip` resolved to Render's internal proxy address, not the real client** *(fixed)* — silently wrong for DPDP consent-record IPs and any IP-based rate limiting. `trustProxy: true` added to the Fastify adapter.
- **No rate limiting existed beyond the OTP-specific limiter** *(fixed)* — added a global 300 req/min-per-IP throttle (`@nestjs/throttler`), with `/health` explicitly exempted so it can't cause a false-unhealthy restart loop on Render.
- **Missing indexes on the marketplace discovery search's filter columns** *(fixed)* — `tutor_subjects.subject_id`/`curriculum_id`, `profiles_tutor.verification_status`, `reviews.student_id`. Migration `0024`. Applied to production.
- **Migrations `0024`–`0028` had never been run against production** *(fixed)* — production Neon was still on `0023`, meaning `0025`/`0026` (the `telegram_chat_id` column and `users.email` unique index the Telegram-only auth rearchitecture above depends on) were silently missing from the live schema the whole time the new auth code was deployed and running against it — the likely cause of live signup/login breakage before this was caught. All migrations through `0028` are now applied and verified against production (confirmed via `kysely_migration`, plus a live signup/login smoke test against the deployed API).
- **Permanent Super Admin account + dev-only auto-login** *(new)* — `superadmin` already existed as a role value (migration `0002`'s `user_roles` CHECK constraint) and was already used by `VerificationsController`/`AuditLogController`, but nothing else treated it specially. Migration `0028` idempotently grants it to one named account (matches by email/phone, backfills whichever identifier is missing, never duplicates); `RolesGuard` (`backend/src/modules/identity/auth/guards/roles.guard.ts`) now treats `superadmin` as bypassing every `@Roles(...)` check app-wide rather than needing to be listed on each route. A dev-only `POST /dev/auto-login` (`backend/src/dev/`) issues that account real JWTs with no credentials, for local-only convenience — kept out of production two independent ways: `Dockerfile` deletes `dist/dev` after `npm run build`, and `app.module.ts` only loads the module via a `NODE_ENV`-guarded runtime `require()` (nest build/nest start share one `tsconfig.build.json`, so excluding `src/dev` there would also break local dev, hence the Docker-stage approach instead of a tsconfig exclude). Both layers verified independently — confirmed `dist/dev` absent after the build-stage strip, and confirmed the route 404s (module never registers) when `NODE_ENV=production` is forced locally. Web (`web/src/app/login/login-form.tsx`) auto-calls this endpoint in dev only, `next build`'s dead-code elimination strips the branch the same way. **Outstanding**: this account already existed in production from earlier manual testing, so — like the ~20 pre-existing accounts noted above — it can't self-serve connect Telegram (`startLink` refuses to link an *existing* account, by design). It needs the same out-of-band `telegram_chat_id` fix: get the numeric chat id (e.g. via `@userinfobot` on Telegram) and set it directly via a production DB update before sign-in will work for this account in production.
- **Several backend-complete features have no reachable UI anywhere**, found in the same audit and deliberately *not* built yet (too large/risky to rush pre-launch): the student-facing AI Doubt Solver (`/doubt-solver/*` — a named Phase 3 feature, fully built server-side, zero caller in web or mobile), online fee payment (`POST /payments/fee/:feeLedgerId/order` — tutors can only mark fees paid manually), and fee waiving. The tutor verification review queue and payout generation endpoints are believed intentional (Retool-driven admin actions per §6.5's "any admin write needs to go through the REST API" rule), not gaps — but worth confirming an actual Retool workflow exists for them before launch.
- **Two tiny orphaned test objects remain in the Supabase bucket** from before the storage `delete()` fix existed (a few hundred bytes total) — harmless, but there's no DB row left to delete them through the app anymore; remove manually via the Supabase dashboard if you want a clean bucket.
- **Pre-existing transitive dependency vulnerabilities** (`npm audit`: brace-expansion, fast-uri, find-my-way, uuid — all several layers deep in jest/fastify/firebase-admin's own dependency trees, none introduced this session) — fixing the high-severity ones requires `npm audit fix --force`, which bumps `@nestjs/platform-fastify` and `firebase-admin` across breaking major versions. Deliberately not attempted pre-launch; worth a dedicated upgrade pass afterward.

## 6. Manual setup steps (need a human with account access)

### 6.1 Android release signing — done, but the keystore needs backing up

A release keystore was generated on the dev machine at `E:\tuition-app-secrets\upload-keystore.jks` (credentials alongside it in `keystore-credentials.txt`) and wired into `mobile/android` via a gitignored `key.properties` — never committed, by design. A release-signed AAB and APK were built and verified (checked with `apksigner`, confirmed the release cert, not the debug one).

**This keystore is currently a single point of failure** — it exists only on that one machine. If it's lost, Google can never reissue it and this app can never be updated under the same Play Store listing again. Whoever has account access needs to:
1. Back up `E:\tuition-app-secrets\` (both files) somewhere durable — a password manager or encrypted backup, not just a copy on the same disk.
2. Share it with the rest of the team through a secure channel if more than one person will cut releases.
3. **Never regenerate a new keystore** to "fix" a missing one — a fresh keystore is a different signing identity and can't update an app already published under the old one.

### 6.2 Sentry (error tracking)

You need **three** DSNs — one per platform, so errors triage by surface instead of landing in one undifferentiated stream.

1. Create/sign in to a Sentry org at [sentry.io](https://sentry.io).
2. Create three projects:
   - **Node.js** platform → name it `tuition-backend`
   - **Next.js** platform → name it `tuition-web`
   - **Flutter** platform → name it `tuition-mobile`
3. Each project's **Settings → Client Keys (DSN)** page has the DSN string (`https://<key>@<org>.ingest.sentry.io/<project>`).
4. Set them:
   - Backend: `SENTRY_DSN` in `backend/.env` (see `backend/.env.example`)
   - Web: `NEXT_PUBLIC_SENTRY_DSN` — set in **Vercel**, not `.env` (see §6.4 below)
   - Mobile: passed at build time, not stored in a file:
     ```bash
     flutter build apk --dart-define=SENTRY_DSN=https://...
     ```
     Codemagic (or whatever CI eventually builds release binaries) needs this as a secret env var wired into the build command.
5. For web, source-map upload also needs an **auth token** (Sentry → Settings → Auth Tokens → new token with `project:releases` scope) — this is `SENTRY_AUTH_TOKEN` in Vercel, alongside `SENTRY_ORG` (your org slug) and `SENTRY_PROJECT` (`tuition-web`). Without it, Next.js still reports errors fine — you just get minified stack traces instead of readable ones.
6. Everything is env-gated: unset DSN = Sentry silently disabled, no crashes, no build failures. You can ship this DSN-less and add it later without touching code.

### 6.3 PostHog (product analytics + feature flags)

One project, three write locations.

1. Create a project at [posthog.com](https://posthog.com) (US or EU cloud — pick based on where your users are; blueprint targets India, so US cloud is the closer/default choice unless you have a data-residency reason otherwise).
2. **Settings → Project API Key** gives you the key. Host is `https://us.i.posthog.com` (or `https://eu.i.posthog.com`).
3. Set:
   - Backend (server-side capture): `POSTHOG_API_KEY` + `POSTHOG_HOST` in `backend/.env`
   - Web (client-side): `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` — in Vercel (see §6.4)
   - Mobile: build-time dart-define, same pattern as Sentry:
     ```bash
     flutter build apk --dart-define=POSTHOG_API_KEY=phc_...
     ```
4. Same as Sentry — unset key means events are dropped with a one-line warning, nothing breaks.

### 6.4 Vercel env vars (web deployment) — deployment is live, backend URL still unset

The web app deploys via Vercel directly from git (no CI pipeline in this repo) and **is live** at `tution-xi-eosin.vercel.app`, confirmed serving the landing page (and now the full §3 redesign) correctly. (One gotcha hit and fixed during initial setup: the Vercel project's **Root Directory** field had `WEB` in uppercase instead of lowercase `web` — Vercel's Linux build servers are case-sensitive even though Windows isn't, so it silently failed to find the app despite the build showing "Ready". If you ever recreate this project, set Root Directory to exactly `web`, lowercase.)

`NEXT_PUBLIC_API_URL` still needs to point at a real deployed backend once one exists (§5 — backend isn't deployed anywhere yet) — until then, login/dashboard/booking flows on the live site won't work (confirmed live — see §5), only the static marketing pages will. In the Vercel project dashboard → **Settings → Environment Variables**, set:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | your deployed backend URL | e.g. Fly.io app URL — not set yet, see §5 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same as backend's `GOOGLE_CLIENT_ID` | must match exactly — frontend requests the ID token the backend verifies |
| `NEXT_PUBLIC_SENTRY_DSN` | from §6.2 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_KEY` | from §6.3 step 3 | omit to disable |
| `NEXT_PUBLIC_POSTHOG_HOST` | from §6.3 step 2 | omit to disable |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | your Razorpay public key | omit to keep using the mock-provider checkout path |
| `SENTRY_AUTH_TOKEN` | from §6.2 step 5 | build-time only, source-map upload |
| `SENTRY_ORG` | your Sentry org slug | build-time only |
| `SENTRY_PROJECT` | `tuition-web` | build-time only |

Set each for whichever Vercel environments you use (Production / Preview / Development) — at minimum Production.

### 6.5 Retool admin workspace + the `ALTER ROLE` password step

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

### 6.6 Backend deployment target — live (Render, not Fly.io)

Blueprint §6 targets Fly.io + managed Postgres (Neon at MVP). Fly.io was tried first but requires a credit card on file before creating *any* app, even free-tier — since that's a payment detail no automated session can enter, the target was switched to **Render** (Docker web service, free tier, no card required) instead. Neon Postgres and Upstash Redis are used as originally planned.

Status: fully deployed and verified end-to-end in production.
- [`backend/Dockerfile`](backend/Dockerfile) + [`render.yaml`](render.yaml) deployed; `/health` returns `{"status":"ok","database":"up","redis":"up"}` on the live Render service.
- Neon Postgres provisioned; all migrations applied, including the `postgis` and `vector` extensions Neon supports natively.
- Upstash Redis provisioned and connectivity-verified.
- `NEXT_PUBLIC_API_URL` is set in Vercel, pointing at the live Render URL — the deployed frontend can reach the backend.
- OTP login verified against the live stack (real code → `/auth/otp/verify` → real JWTs) for all three signup roles (tutor/student/parent), plus full production walkthroughs of the tutor dashboard, parent portal, and public marketplace/booking flow.
- **Object storage: provisioned and live.** The provider was switched from Cloudflare R2 to **Supabase Storage** (`backend/src/modules/delivery/materials/storage/supabase-storage.provider.ts`) — both R2 and Firebase Storage now require a linked billing account/credit card just to create a bucket, even on their free tiers; Supabase's free tier does not. It's S3-compatible, so the swap was a same-shape provider, not a rewrite. `SUPABASE_PROJECT_REF`/`SUPABASE_STORAGE_BUCKET`/`SUPABASE_STORAGE_REGION`/`SUPABASE_STORAGE_ACCESS_KEY_ID`/`SUPABASE_STORAGE_SECRET_ACCESS_KEY` are all set on Render, and the full lifecycle — presigned upload, presigned download, and delete (both the DB row *and* the actual bucket object) — is verified end-to-end against the live bucket, not just locally.

### 6.7 Telegram OTP (Bot API) — the only OTP delivery channel

Sign-in accepts a **phone number or an email address** as the identifier, but the code itself is always delivered over **Telegram**. WhatsApp, SMS, and email/SMTP delivery were all removed — `TelegramOtpProvider` is the only real provider, with `ConsoleOtpProvider` (logs the code server-side) as the zero-credential dev fallback. `IdentityModule`'s factory switches automatically the moment both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set, with no code changes either way.

**The constraint that shapes everything here:** a Telegram bot cannot message anyone who hasn't messaged it first. There's no way to derive a chat id from a phone number or email, so every account has to *connect* Telegram once before it can receive codes.

**1. Create the bot**
Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow the prompts. You get a token immediately (`TELEGRAM_BOT_TOKEN`) and choose a username (`TELEGRAM_BOT_USERNAME`, without the `@`). Both are required — the token sends messages, the username builds the `t.me/<username>?start=<token>` deep link users tap to connect.

**2. How connecting works**
1. User enters a phone/email and asks for a code.
2. If that account has no chat id on file, the API returns **403 with `telegramLinkRequired: true`**.
3. The client calls `POST /auth/telegram/link/start`, gets `{token, deepLink}`, and shows a "Connect Telegram" button.
4. User taps it, Telegram opens the bot, they press **Start** — which sends `/start <token>` to the bot.
5. `TelegramUpdatesPoller` (long-polling `getUpdates`) sees it, records the chat id against that pending link, and replies in-chat to confirm.
6. The client is polling `GET /auth/telegram/link/:token/status`; once it flips to `linked: true` it re-requests the code, which now delivers.

**3. Security rule worth understanding before changing it**
`link/start` **refuses** an identifier that already has an account (409). This is deliberate: if any caller could attach their own Telegram to an existing phone/email, they'd start receiving that account's login codes — and since the OTP *is* the credential, that's a full account takeover. Self-serve connecting is therefore only allowed when no account exists yet, where the person connecting is by definition the one creating the account.

**Consequence:** accounts created before Telegram sign-in existed (there are ~20 in the current DB, none with a chat id) **cannot sign in** until their `telegram_chat_id` is set out-of-band — a direct DB update, or a future authenticated flow. There is deliberately no admin endpoint for this.

**4. Long-polling, not a webhook**
`TelegramUpdatesPoller` calls `getUpdates` in a background loop (`OnModuleInit`/`OnModuleDestroy`), chosen over a webhook because it needs no public URL — it works identically in local dev and on Render, and the whole flow is testable without a tunnel. **It must run in exactly one process**: Telegram deletes an update once it's confirmed via `offset`, so a second instance would steal updates from the first. Fine on Render's single-instance free tier; scaling out means switching to a webhook. The loop no-ops entirely when no bot token is set, and transient Telegram/network failures log and back off rather than crashing boot.

**5. Deployment**
Set both vars on Render (`render.yaml` reserves the slots — Environment tab, paste values). Render restarts on an env change and the factory re-evaluates on that fresh boot, so there's no extra step.

| Variable | Example | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF...` | from @BotFather; never logged |
| `TELEGRAM_BOT_USERNAME` | `scholar_otp_bot` | no `@`; builds the connect deep link |

**6. Troubleshooting**
`TelegramOtpProvider` and `TelegramUpdatesPoller` log only Telegram's own error description (never the bot token) under `OTP (Telegram)` / `Telegram (updates)`:
- **403 `telegramLinkRequired` on every sign-in attempt** — expected for an account with no chat id yet; the client should route to the connect flow. For a *pre-existing* account it's terminal until linked out-of-band (see §3).
- **409 on `link/start`** — either already connected, or an existing account that can't self-link by design.
- **503 "Telegram sign-in is not configured"** — `TELEGRAM_BOT_USERNAME` is missing, so no deep link can be built.
- **400 "chat not found"** on send — the recorded chat id is stale or the user blocked the bot.
- **401/403** on send — bad/revoked bot token, or the user blocked the bot.
- **429** — Telegram's own per-bot rate limit; `OtpService`'s per-identifier limiter (5 per 15 min) runs first and independently.
- **Nothing happens after pressing Start** — check the boot log for `IdentityModule`'s line (`"Telegram bot configured"` vs `"TELEGRAM_BOT_TOKEN/TELEGRAM_BOT_USERNAME not set"`), which confirms whether both vars reached the container and therefore whether the poller is even running.
- **`Update poll failed: fetch failed`** — Node's `fetch` collapses every network-level failure into that one generic message; the log line now also surfaces `cause`'s code (e.g. `ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT`) so a real outage is diagnosable instead of opaque. A single occurrence right at container boot (before "Your service is live") is a cold-start DNS blip, not a real problem — the poller retries every 5s regardless; only worth investigating if it repeats continuously.

**7. What's verified and what isn't**
The full flow — connect → code → verify → JWT — has been exercised end-to-end against the live local stack for **both** phone and email identifiers, including the 409 takeover guard, expired/invalid codes, rate limiting, and the `phoneForSignup` requirement for email signups. Refresh, logout, RBAC, and `/auth/me` were regression-checked and are unchanged. **Not verified: an actual message arriving in Telegram** — that needs a real `TELEGRAM_BOT_TOKEN`, which this environment doesn't have; the send path is unit-tested against mocked `fetch` instead. Same credential gap as Razorpay/Sentry/PostHog.

**Mobile is not updated.** The Flutter app still sends the deprecated `phoneE164` field (kept working on purpose), but it has no "Connect Telegram" UI — so any mobile user without a chat id gets the 403 and cannot proceed. Mobile needs a follow-up pass to reach parity; its rendering can't be visually verified in this environment (see §3).


## Known environment note (not a setup step, just FYI)

The Android debug build was hanging indefinitely on one dev machine due to a local network proxy throttling Gradle's dependency downloads to a trickle. Fixed via `org.gradle.internal.http.*` timeout properties in `C:\Users\<you>\.gradle\gradle.properties` — **outside this repo**, machine-local by design (Gradle timeout tuning isn't project config). If a fresh machine or CI runner hits the same symptom (a Gradle daemon that never progresses past resolving the Kotlin/AGP buildscript classpath), the fix is documented inline in that file's comments on the original machine, or see commit `bbf5df1`'s message for the diagnosis.
