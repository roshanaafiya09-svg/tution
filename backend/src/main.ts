import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module';
import { KYSELY_CONNECTION } from './database/database.module';
import type { DB } from './database/types';
import { scrubSentryEvent } from './sentry-scrub';
import {
  CORS_EXPOSED_HEADERS,
  configureHttpApp,
  createFastifyAdapter,
  registerJsonBodyParserWithRaw,
} from './common/http/app-setup';

// Must run before anything else, including NestFactory.create — Sentry's
// own docs require init() to happen before the app/DI container exists.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // SEC-10: explicit, reviewable PII policy (see sentry-scrub.ts)
    // rather than relying implicitly on the SDK's own default
    // redaction. sendDefaultPii is off by default already, but set
    // explicitly here so that's a deliberate choice, not an assumption.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}

async function bootstrap() {
  // Render terminates TLS (behind Cloudflare) and proxies to this container.
  // request.ip must be the REAL client: DPDP consent records stash it as the
  // legally-relevant IP, and the global rate limiter keys on it. Only our own
  // infrastructure ranges may vouch for X-Forwarded-For (trusted-proxies.ts,
  // overridable with TRUST_PROXY_CIDRS / TRUST_PROXY_HOPS) — trusting every
  // hop let clients pick their own rate-limit bucket (audit H3).
  // find-my-way's default maxParamLength (100) is too tight for the
  // dev-only local-upload/local-download :objectKey param once an object
  // key has two UUID segments (e.g. assessment-question-papers/{tutorId}/
  // {assessmentId}/{random}.ext, URL-encoded) — Supabase Storage in
  // production never routes through this param at all, so this only
  // affects local dev.
  // (trustProxy, maxParamLength and request-id handling live in
  // createFastifyAdapter so the e2e suites boot the identical adapter.)
  const adapter = createFastifyAdapter();

  // Raw binary bodies for the dev-only local upload endpoint that stands
  // in for Supabase Storage's presigned PUT (see LocalStorageProvider).
  // In production uploads go straight to storage and never reach the API,
  // and the route (LocalStorageController) is not registered — so neither
  // is the parser (audit H4).
  if (process.env.NODE_ENV !== 'production') {
    adapter.getInstance().addContentTypeParser(
      [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        // Offline assessment question papers (DOC/DOCX) and scorecards
        // (XLSX) — same dev-only local-upload path as the mimes above.
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
  }

  // JSON parser that also stashes the exact raw bytes (HMAC webhook
  // signature verification must run over the untouched body) — shared with
  // the e2e harness so both boot the identical adapter.
  registerJsonBodyParserWithRaw(adapter);

  // bodyParser: false — Nest's Fastify adapter otherwise registers its
  // own default 'application/json' parser during app.init(), which
  // collides with the raw-body-preserving one registered above
  // (FastifyError: Content type parser 'application/json' already
  // present). Every content type this API accepts is now parsed by the
  // two parsers registered above.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bodyParser: false },
  );

  const config = app.get(ConfigService);

  await app.register(helmet);
  // No `secret` — the refresh token stored in this cookie is already a
  // signed JWT (see TokensService), so a second signing layer here would
  // be redundant. Plain (unsigned) fastify cookie parsing is enough.
  await app.register(cookie);
  await app.register(cors, {
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
    // @fastify/cors defaults to GET,HEAD,POST only — every PUT/DELETE
    // route (profile edits, account deletion, batch/material removal,
    // etc.) was silently unreachable from a real browser despite curl-
    // based smoke tests passing, since curl never enforces CORS at all.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Lets the browser read X-Request-Id off error responses so a failure
    // shown to a user can be matched to the server log line.
    exposedHeaders: CORS_EXPOSED_HEADERS,
  });

  // Request-id response header + the global ValidationPipe.
  configureHttpApp(app);

  const db = app.get<Kysely<DB>>(KYSELY_CONNECTION);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void db.destroy().finally(() => process.exit(0));
    });
  }

  const port = config.get<number>('app.port') ?? 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`Tuition App API listening on http://localhost:${port}`);
}
void bootstrap();
