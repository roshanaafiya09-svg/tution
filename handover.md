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

Not verified: mobile visual rendering after the §3 redesign (see §3 for why), or the Razorpay/Sentry/PostHog integrations against real credentials (env-gated and mock/console-backed in dev). Email OTP (via Brevo) **is** verified against real credentials in production — see §6.7 for the live send/receive confirmation.

## 5. Known gaps

- **Backend is deployed and live** (Render + Neon + Upstash), `NEXT_PUBLIC_API_URL` is set in Vercel, and a full production QA pass (tutor, parent, and public marketplace/booking flows, plus OTP login for all three roles) has been run against the real stack. See §6.6 for exact status. `web/src/lib/api.ts` throws a clear error on a missing `NEXT_PUBLIC_API_URL` rather than silently falling back to `http://localhost:3001`, which used to produce an opaque `net::ERR_CONNECTION_REFUSED` with no indication of the actual cause — kept as a guard even though the var is now set.
- **Mobile redesign (§3) hasn't been visually confirmed on a device/emulator.** `flutter analyze` is clean, but that's not the same as seeing it render — see §3 for the tooling limitation that caused this.
- **`mobile/login_screen.png` is a committed screenshot** (tracked in git, not gitignored) — a debug artifact, not an asset the app loads. Harmless but still there; a cleanup task was flagged for this but hasn't landed.
- **No shared job-queue module.** Redis is provisioned (OTP/refresh-token storage), but scheduled/async work (digest generation, reminder cadences) lives inline in each module's service rather than a BullMQ-backed queue, despite blueprint §6 calling for BullMQ. Fine at current scale.
- **Real payment/OTP providers are still unconfigured** — Razorpay, Telegram Bot API, Sentry, PostHog all have real-provider code but no live credentials; everything currently runs on mock/console providers. See §6.
- **Auth rearchitected again: Telegram OTP → email OTP via Brevo** *(new, supersedes the phone-or-email/Telegram-only entry this replaces — see `email-otp-migration-plan.md` for the source spec)* — `EmailOtpProvider` is now the sole real delivery channel (`ConsoleOtpProvider` stays as the zero-credential dev fallback); `TelegramOtpProvider` was unregistered from `IdentityModule`'s DI (not deleted — same "unregister, don't delete yet" treatment WhatsApp/old-Email got before). **Delivery mechanism note:** this was originally built on Gmail SMTP/Nodemailer, then switched to Brevo's HTTPS API days later when Render's free-tier outbound SMTP-port block (25/465/587) made SMTP delivery undeliverable in production — see §6.7 for the full story; the `EmailOtpProvider` class/interface never changed shape, only its internals. **The Telegram connect-gate is gone entirely** — `POST /auth/otp/request` never returns `telegramLinkRequired` anymore (grepped clean, confirmed live). Email is now the required signup identifier (a fresh phone number with no account 400s, asking for an email instead); an *existing* account can still request its code via phone, which resolves to that account's email on file. `phone_e164` stays `NOT NULL` and is still collected at signup, just no longer the thing you sign in with. This closes the lockout the Telegram design created: **all ~20 pre-existing accounts, and the Super Admin account, can now log in immediately if they have an email on file** — no out-of-band linking step needed, since email OTP has no "prove you're allowed to self-link" gate the way Telegram's takeover-prevention rule required. Full walkthrough, what's verified: §6.7 (rewritten for email; the old Telegram write-up is gone from that section, the linking subsystem's own files are still on disk if anyone needs the history).
- **Object storage (Supabase Storage) is provisioned and live** — verified end-to-end in production (presigned upload → download → delete, confirmed the object is actually gone from the bucket afterward, not just the DB row). No longer a gap.
- **No UI anywhere lets a student generate a parent-invite code** *(fixed)* — `POST /parent-links/invite` (student-only) had zero caller in web or mobile; the entire parent portal was unreachable by a real user. Added to mobile Settings (student-only, since students are mobile-only). Found and fixed in a pre-launch audit.
- **"Sign out" never revoked the refresh token server-side** *(fixed)* — only cleared local storage; a copied/leaked refresh token stayed valid for its full 30-day life. Added `POST /auth/logout` and wired both web and mobile to call it. Verified live: a never-refreshed token is rejected immediately after logout.
- **Sending a message never notified anyone** *(fixed)* — `MessagesService.send()` wrote the row and nothing else, unlike every other user-facing action. Now notifies every other thread participant. Verified live.
- **`request.ip` resolved to Render's internal proxy address, not the real client** *(fixed)* — silently wrong for DPDP consent-record IPs and any IP-based rate limiting. `trustProxy: true` added to the Fastify adapter.
- **No rate limiting existed beyond the OTP-specific limiter** *(fixed)* — added a global 300 req/min-per-IP throttle (`@nestjs/throttler`), with `/health` explicitly exempted so it can't cause a false-unhealthy restart loop on Render.
- **Missing indexes on the marketplace discovery search's filter columns** *(fixed)* — `tutor_subjects.subject_id`/`curriculum_id`, `profiles_tutor.verification_status`, `reviews.student_id`. Migration `0024`. Applied to production.
- **Migrations `0024`–`0028` had never been run against production** *(fixed)* — production Neon was still on `0023`, meaning `0025`/`0026` (the `telegram_chat_id` column and `users.email` unique index the Telegram-only auth rearchitecture above depends on) were silently missing from the live schema the whole time the new auth code was deployed and running against it — the likely cause of live signup/login breakage before this was caught. All migrations through `0028` are now applied and verified against production (confirmed via `kysely_migration`, plus a live signup/login smoke test against the deployed API).
- **Permanent Super Admin account + dev-only auto-login** *(new)* — `superadmin` already existed as a role value (migration `0002`'s `user_roles` CHECK constraint) and was already used by `VerificationsController`/`AuditLogController`, but nothing else treated it specially. Migration `0028` idempotently grants it to one named account (matches by email/phone, backfills whichever identifier is missing, never duplicates); `RolesGuard` (`backend/src/modules/identity/auth/guards/roles.guard.ts`) now treats `superadmin` as bypassing every `@Roles(...)` check app-wide rather than needing to be listed on each route. A dev-only `POST /dev/auto-login` (`backend/src/dev/`) issues that account real JWTs with no credentials, for local-only convenience — kept out of production two independent ways: `Dockerfile` deletes `dist/dev` after `npm run build`, and `app.module.ts` only loads the module via a `NODE_ENV`-guarded runtime `require()` (nest build/nest start share one `tsconfig.build.json`, so excluding `src/dev` there would also break local dev, hence the Docker-stage approach instead of a tsconfig exclude). Both layers verified independently — confirmed `dist/dev` absent after the build-stage strip, and confirmed the route 404s (module never registers) when `NODE_ENV=production` is forced locally. Web (`web/src/app/login/login-form.tsx`) auto-calls this endpoint in dev only, `next build`'s dead-code elimination strips the branch the same way. The Telegram-linking workaround this account needed (getting its numeric chat id via `@userinfobot`, setting it with a direct production DB update) is now moot — the Telegram gate is gone (see the auth-rearchitecture bullet above) and the account already has an email on file, so it logs in via ordinary email OTP like everyone else.
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

### 6.7 Email OTP (Brevo HTTPS API) — the only OTP delivery channel

Sign-in is keyed on **email** for all three roles (tutor/student/parent) and the Super Admin account. The code is delivered over **Brevo's transactional email HTTPS API** — `EmailOtpProvider` is the only real provider, with `ConsoleOtpProvider` (logs the code server-side) as the zero-credential dev fallback. `IdentityModule`'s factory switches automatically the moment `BREVO_API_KEY` and `SMTP_USER` are both set, with no code changes either way. There is no connect/link step of any kind — unlike the Telegram design this replaced, email OTP needs no separate "prove you can receive at this address before signing in" gate, since receiving the code itself *is* that proof.

**Why HTTPS, not SMTP** — this was originally built on Gmail SMTP/Nodemailer, but Render's free tier blocks all outbound traffic to SMTP ports (25/465/587), confirmed via [Render's own changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports) — every send timed out after ~2 minutes in production despite working fine locally. Brevo sends over HTTPS (443), which isn't blocked, at the cost of needing a Brevo account instead of just a Gmail one.

**1. Get Brevo credentials**
Sign up at [brevo.com](https://www.brevo.com) (free tier: ~300 emails/day). Verify a **sender email** (their dashboard emails a 6-digit code to that address — no custom domain or DNS records needed, unlike most competitors). Then generate a transactional API key under Settings → SMTP & API → API Keys.

**2. Environment variables**

| Variable | Example | Notes |
|---|---|---|
| `BREVO_API_KEY` | *(from Brevo dashboard)* | never logged, never committed |
| `SMTP_USER` | `scholar.otp@gmail.com` | repurposed as the Brevo sender identity — must exactly match the address verified in Brevo |

Both required together — a partial set falls back to `ConsoleOtpProvider`. Set `BREVO_API_KEY` directly in Render's dashboard (Environment tab) — never paste it into a chat session, a commit, or `.env` files that get pushed.

**`SMTP_HOST`/`SMTP_PORT`/`SMTP_PASS`/`SMTP_FROM` are legacy** — still declared in `env.validation.ts` (so they won't fail validation if present) but no longer read by any code. Deliberately left in place rather than removed; that's a cleanup decision for later, not made here.

**3. Login/signup shape**
- **Existing account, any identifier**: email works directly; phone resolves to that account's email and sends there too (`AuthService.requestOtp`).
- **Brand-new signup**: email only — a fresh phone number with no account gets a plain 400 asking for an email instead. `phone_e164` stays `NOT NULL` and is still collected (`phoneForSignup`) at the point of account creation, same as before; it's just never the login key.
- **`POST /auth/otp/request` never returns `telegramLinkRequired`** — that field/flow doesn't exist anymore. A missing-email case is an ordinary 400.

**4. What's still on disk but unregistered**
`TelegramOtpProvider`, `TelegramLinkRepository`, `TelegramLinkService`, `TelegramUpdatesPoller`, and the `/auth/telegram/link/*` routes are gone from `IdentityModule`'s DI graph and `AuthController` respectively, but the provider/subsystem files themselves weren't deleted (per `email-otp-migration-plan.md`'s explicit instruction — deletion deferred to a later pass). `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME` can be left set or removed from Render without effect either way; nothing reads them anymore.

**5. Troubleshooting**
`EmailOtpProvider` logs only the failure reason (never the API key) under `OTP (Email)`:
- **`Email send failed (HTTP ...): ...`** — the text after "HTTP" is Brevo's own status/description (e.g. 401 "Key not found" means a bad/revoked `BREVO_API_KEY`; a sender-mismatch error means `SMTP_USER`'s value doesn't match what's verified in Brevo).
- **`Email send failed: could not reach Brevo (...)`** — a genuine network failure reaching `api.brevo.com`, distinct from the above; unlikely on HTTPS but the fetch-throw path is still handled.
- **429** — `OtpService`'s per-identifier limiter (5 per 15 min), unrelated to Brevo's own daily send cap.
- **A returning user is asked for their phone number** — shouldn't happen; the two-step verify (bare code first, role+phone only on the backend's "no account yet" 400) is what prevents this. If it does, check the client isn't sending `signupRole`/`phoneForSignup` on every request.

**6. What's verified and what isn't**
The full flow — request → code → verify → JWT — was exercised end-to-end against the live local stack (`ConsoleOtpProvider`) for **all three roles**, both via direct API calls and a real browser click-through (web), landing on the correct post-login destination for each (`/dashboard`, `/get-the-app`, `/parent`). Phone-identifier lookup for an existing account, a fresh phone number's 400, the Super Admin's email login, and the absence of `telegramLinkRequired` on every path were all confirmed live. Backend: `nest build` clean, full `npx jest` suite passing (52/52) including a rewritten `email-otp.provider.spec.ts` (mocks `fetch`, not `nodemailer`). Web: `tsc --noEmit` and full `next build` clean. Mobile: `flutter analyze` clean (0 issues) after switching its login screen to email + adding the same two-step signup-phone-collection pattern used on web. **A real production email was sent and confirmed received** — `POST /auth/otp/request` against the live Render deployment returned in ~2.4s (vs. ~2min timeouts on the prior Gmail SMTP attempt), and the code arrived in the recipient's real inbox. Mobile's visual rendering isn't verified, for the same tooling-limitation reason as the rest of this repo's Flutter work (see §3).


## Known environment note (not a setup step, just FYI)

The Android debug build was hanging indefinitely on one dev machine due to a local network proxy throttling Gradle's dependency downloads to a trickle. Fixed via `org.gradle.internal.http.*` timeout properties in `C:\Users\<you>\.gradle\gradle.properties` — **outside this repo**, machine-local by design (Gradle timeout tuning isn't project config). If a fresh machine or CI runner hits the same symptom (a Gradle daemon that never progresses past resolving the Kotlin/AGP buildscript classpath), the fix is documented inline in that file's comments on the original machine, or see commit `bbf5df1`'s message for the diagnosis.
