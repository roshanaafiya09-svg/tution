import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module';
import { KYSELY_CONNECTION } from './database/database.module';
import type { DB } from './database/types';
import { scrubSentryEvent } from './sentry-scrub';

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
  // Render terminates TLS and proxies to this container over a single
  // trusted hop — without trustProxy, request.ip resolves to Render's
  // internal proxy address for every request, not the real client. That
  // silently broke two things: DPDP consent records (parent-links
  // controller stashes request.ip as the legally-relevant IP at the
  // moment consent was granted) and any future IP-based rate limiting.
  const adapter = new FastifyAdapter({ trustProxy: true });

  // Raw binary bodies for the dev-only local upload endpoint that stands
  // in for Supabase Storage's presigned PUT (see LocalStorageProvider).
  // In production uploads go straight to storage and never reach the API.
  adapter
    .getInstance()
    .addContentTypeParser(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );

  // Overrides Fastify's built-in JSON parser to also stash the exact raw
  // bytes on the request — HMAC webhook signature verification (Razorpay)
  // must run over the untouched body, since JSON.stringify(JSON.parse(x))
  // is not guaranteed to equal x byte-for-byte. Every other JSON route's
  // req.body is unaffected; this only adds request.rawBody alongside it.
  adapter
    .getInstance()
    .addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (request, rawBody, done) => {
        const body = String(rawBody);
        (request as unknown as { rawBody: string }).rawBody = body;
        try {
          done(null, body.length ? JSON.parse(body) : {});
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

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
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
