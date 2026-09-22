import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

/** Headers a browser needs to be allowed to read off a cross-origin
 *  response — without `X-Request-Id` here the web client can send an id but
 *  never see the one the server actually logged an error under. */
export const CORS_EXPOSED_HEADERS = ['X-Request-Id', 'Retry-After'];

/** The one place the Fastify adapter is built, so production (`main.ts`)
 *  and the e2e suites get identical request-id behaviour. */
export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: true,
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
  app.getHttpAdapter().getInstance().addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });
  app.useGlobalPipes(createValidationPipe());
}
