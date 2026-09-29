import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';
import { resolveTrustProxy } from './trusted-proxies';

/** Headers a browser needs to be allowed to read off a cross-origin
 *  response — without `X-Request-Id` here the web client can send an id but
 *  never see the one the server actually logged an error under. */
export const CORS_EXPOSED_HEADERS = ['X-Request-Id', 'Retry-After'];

/** The one place the Fastify adapter is built, so production (`main.ts`)
 *  and the e2e suites get identical request-id behaviour.
 *
 *  `trustProxy` is a bounded list of our own infrastructure (see
 *  trusted-proxies.ts), never `true`: with `true` the client-controlled
 *  left-most X-Forwarded-For entry became `request.ip`, which let anyone
 *  pick their own rate-limit bucket (audit H3). `env` is injectable so the
 *  production behaviour can be tested without touching process.env. */
export function createFastifyAdapter(
  env: NodeJS.ProcessEnv = process.env,
): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: resolveTrustProxy(env),
    maxParamLength: 300,
    // Disabled on purpose: Fastify would otherwise trust the raw header
    // verbatim. `genReqId` validates it (or mints a UUID) instead.
    requestIdHeader: false,
    genReqId: resolveRequestId,
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

/**
 * Global HTTP behaviour shared by production and the e2e suites: every
 * response — success, error, even a router 404 — carries the request id it
 * was logged under, and request bodies are validated identically.
 */
export function configureHttpApp(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header(REQUEST_ID_HEADER, request.id);
      done();
    });
  app.useGlobalPipes(createValidationPipe());
}

/**
 * Overrides Fastify's built-in JSON parser to also stash the exact raw bytes
 * on the request — HMAC webhook signature verification (Razorpay) must run
 * over the untouched body, since JSON.stringify(JSON.parse(x)) is not
 * guaranteed to equal x byte-for-byte. Every other JSON route's req.body is
 * unaffected; this only adds request.rawBody alongside it.
 *
 * The Nest app must be created with `bodyParser: false` (Nest's own default
 * JSON parser would collide with this one).
 */
export function registerJsonBodyParserWithRaw(adapter: FastifyAdapter): void {
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
}
