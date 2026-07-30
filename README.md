# Tuition App

A tutor-first teaching business OS for the Chennai / Tamil Nadu tuition market — batches, scheduling, attendance, materials, homework, and fee tracking, with students/parents on a companion mobile app. See [`BLUEPRINT 2.md`](BLUEPRINT%202.md) for the full product spec (source of truth for scope).

**Status:** Phase 1 (Tutor OS core) — in active build.

## Monorepo structure

```
tuition-app/
├── backend/     NestJS modular monolith (Fastify) — API for web + mobile
├── web/         Next.js 14 (App Router) — tutor dashboard + public SEO pages + web checkout
├── mobile/      Flutter — student/parent app, tutor on-the-go companion
├── shared/
│   └── design-tokens/   Single source of truth for color/type/spacing (see docs/design-system.md)
├── docs/        Architecture notes, design system, ADRs
├── docker-compose.yml   Local Postgres 16 + Redis
└── BLUEPRINT 2.md       Product spec (do not deviate without an explicit decision)
```

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker Desktop (for local Postgres + Redis)
- Flutter SDK ≥ 3.x, Dart ≥ 3.x (mobile app)

## Running locally

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Backend (NestJS API) — http://localhost:3001
cd backend
cp .env.example .env
npm install
npm run start:dev

# 3. Web (Next.js tutor dashboard) — http://localhost:3000
cd web
cp .env.example .env.local
npm install
npm run dev

# 4. Mobile (Flutter)
cd mobile
flutter pub get
flutter run
```

## Scope discipline

This repo builds **Phase 1 only** (Tutor OS core — see blueprint §4). Payments processing, subscriptions/trial enforcement, parent accounts, AI features, and the marketplace are explicitly deferred (blueprint §4 "OUT", §10 roadmap). Anything moved from OUT to IN needs an explicit decision — this file and the blueprint are the contract.

## Design system

See [`docs/design-system.md`](docs/design-system.md). Tokens live in [`shared/design-tokens/tokens.json`](shared/design-tokens/tokens.json) and are mirrored into Tailwind (web) and Flutter `ThemeData` (mobile).
