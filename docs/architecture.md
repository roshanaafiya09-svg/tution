# Architecture

Reference doc for how the Tuition App is built. Product scope lives in [`BLUEPRINT 2.md`](../BLUEPRINT%202.md); this file is the technical map. See also [`api-reference.md`](api-reference.md) (every REST endpoint) and [`database-schema.md`](database-schema.md) (every table/migration).

## Monorepo layout

```
tuition-app/
├── backend/     NestJS modular monolith (Fastify) — API for web + mobile
├── web/         Next.js 14 (App Router) — tutor dashboard + public landing + web checkout
├── mobile/      Flutter — student/parent app, tutor on-the-go companion
├── shared/
│   └── design-tokens/   Single source of truth for color/type/spacing
├── docs/        This directory
├── docker-compose.yml   Local Postgres 16 (PostGIS + pgvector) + Redis
└── BLUEPRINT 2.md       Product spec
```

## Backend — NestJS modular monolith

Fastify adapter, no global route prefix (routes are `/auth`, not `/api/auth`), port 3001 by default. Bounded-context modules under `backend/src/modules/`, each with its own controller(s)/service(s)/repository(ies) and no cross-module DB access:

| Module | Responsibility |
|---|---|
| `identity` | Auth (phone OTP via WhatsApp/Email/Telegram + Google Sign-In), JWT/refresh tokens, tutor/student profiles, users |
| `catalog` | Curricula/subjects/grade levels (reference data), tutor subject offerings, tutor availability |
| `scheduling` | Batches, enrollments, class sessions (RRULE recurrence), attendance, invite links |
| `delivery` | Materials (Supabase Storage-backed uploads), announcements |
| `assessment` | Assignments + submissions + grading, student quiz-taking (auto-graded) |
| `billing` | Fee ledger, Razorpay payments/payouts, tutor subscriptions, parent-premium subscriptions, trial-end recap |
| `ai` | Claude-backed weekly parent digests, RAG doubt-solver (Socratic gate), tutor-facing AI quiz drafting, embeddings provider |
| `trust` | Tutor verification queue, DPDP consent records, immutable audit log |
| `parents` | Parent↔student linking (invite + consent) |
| `messaging` | Monitored, thread-based adult↔minor messaging |
| `notifications` | In-app notifications, push device tokens, FCM delivery |
| `progress` | Attendance/assignment/quiz trend aggregation for student + parent views |
| `marketplace` | Phase 4: tutor locations (PostGIS), 1:1 bookings + take rate, reschedule/cancellation policy, waitlists, reviews, Proof-of-Teaching score, discovery search/ranking |
| `analytics` | PostHog event-capture wrapper (internal, no endpoints) |
| `account` | Self-service data export + account deletion (DPDP) |
| `health` | DB + Redis liveness check |

Async/scheduled work (OTP delivery, digest generation, reminders) runs through the module's own service layer today; BullMQ/Redis-backed queues are provisioned (Redis is already a docker-compose service) but a generic job-queue module has not been extracted yet — check each module's service for how it currently triggers async work before assuming a shared queue exists.

Auth: access JWT (short-lived) + rotating refresh token, `jti`-based revocation, OTP challenges and refresh tokens stored in Redis (migrations 0007/0008 show this moved off Postgres). AuthZ via `@Roles()` guards at the controller layer.

Every module's provider-backed integrations (payments, payouts, push, OTP delivery, storage, AI, embeddings, analytics) follow the same pattern: an interface + a real provider (Razorpay, FCM, WhatsApp Cloud API/SMTP/Telegram Bot API, Supabase Storage, Claude, Voyage, PostHog) + a mock/console/local provider for dev — swap via env config, never a code change. OTP specifically has three real providers ranked WhatsApp → Email → Telegram, first configured wins (`IdentityModule`'s selection factory) — see handover.md §6.7–6.9.

## Web — Next.js 14 (App Router)

Tailwind, no component library — everything hand-rolled in `web/src/components/ui.tsx`. Client components throughout except `/t/[slug]` (server-rendered, for SEO). 29 routes across three surfaces, all listed in [`api-reference.md`](api-reference.md#web-routes):

- **Public**: landing (`/`), login (`/login`, tutor/student/parent signup), invite-join (`/join/[token]`), tutor discovery (`/discover`, `/t/[slug]`), booking (`/book/[slug]`, `/bookings`)
- **Tutor dashboard** (`/dashboard/**`, gated by `dashboard-shell.tsx`): batches/sessions/assignments/fees/profile (Phase 1), plus availability/subjects/verification/billing/marketplace/messages/quizzes
- **Parent portal** (`/parent/**`, gated by `parent-shell.tsx`, new): child linking + DPDP consent, per-child progress/digests/fees, messages, premium checkout

By design, **students have no web routes** — the mobile app is their surface (`login-form.tsx` routes a student signup to `/` on web, `/dashboard` for tutor, `/parent` for parent). Quiz-taking and doubt-solver asking are student actions and so stay mobile-only; the web quiz UI is tutor-authoring only (generate → edit → approve → publish → attempts).

Shared infra worth knowing about: `lib/razorpay.ts` (Checkout.js wrapper; falls back to the dev-only `simulate-capture` endpoint when the backend is running its mock payments provider), `components/message-thread.tsx` and `components/notifications-bell.tsx` (shared between the tutor and parent shells).

## Mobile — Flutter

Riverpod + go_router. Features under `mobile/lib/features/`: `auth`, `today` (student home), `batches` (shared data provider, no screen of its own), `assignments`, `materials` (offline cache), `progress`, `notifications` (background FCM registration), `settings`, `invites` (deep-link join flow `tuitionapp://join/TOKEN`). English + Tamil localization (`l10n/`). Design tokens mirrored from `shared/design-tokens/`.

The mobile app does not sell subscriptions (web-only checkout, keeps it outside app-store IAP requirements per blueprint §2).

## Data layer

| Component | Choice |
|---|---|
| Primary DB | PostgreSQL 16, custom image (`docker/postgres.Dockerfile`) layering **PostGIS** (marketplace geo-search) + **pgvector** (RAG doubt-solver embeddings) on `postgis/postgis:16-3.4` |
| Cache | Redis 7 (also OTP/refresh-token store) |
| Object storage | Supabase Storage (S3-compatible API) in production; local-disk provider for dev (`materials/local-upload/local-download` routes) |
| Search | Postgres FTS / PostGIS `geography` queries for marketplace discovery; no separate search service yet |

Money = integer minor units + currency code. Timestamps = UTC + IANA zone. IDs = app-generated UUIDv7 (migration `0001_extensions_and_helpers.ts`).

## Deployment / infra

- **Local dev:** `docker-compose.yml` runs Postgres (PostGIS+pgvector image) and Redis. Backend and web run via `npm run start:dev` / `npm run dev`; mobile via `flutter run`.
- **Web:** deploys via Vercel directly from git (no in-repo CI pipeline) — see [`handover.md`](../handover.md) §3 for required env vars.
- **Backend:** Docker web service on Render (Fly.io was blueprint §6's original target but requires a credit card to create any app, even free-tier; Render doesn't) + Neon Postgres + Upstash Redis. Deploy config: [`backend/Dockerfile`](../backend/Dockerfile), [`render.yaml`](../render.yaml). Live and verified end-to-end in production — see [`handover.md`](../handover.md) §6.6.
- **Mobile:** release keystore generated and backed up (see [`handover.md`](../handover.md) §6.1); Android release builds are release-signed, not debug.
- **Observability:** Sentry (3 projects: backend/web/mobile) + PostHog, both env-gated (absent key = silently disabled, never a hard failure).
- **Admin:** Retool, connected via the read-only `retool_readonly` Postgres role (migration `0011`), password set manually per environment — never committed.

## Full endpoint / schema reference

- [`api-reference.md`](api-reference.md) — every REST endpoint, by module
- [`database-schema.md`](database-schema.md) — every migration, in order, Phase 1 through Phase 4
