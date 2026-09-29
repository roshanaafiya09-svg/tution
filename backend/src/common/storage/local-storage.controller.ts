import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as path from 'node:path';
import { LocalStorageProvider } from './local-storage.provider';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import type { StorageProvider } from './storage-provider.interface';

/** Normalises a client-supplied object key and rejects anything that could
 *  leave the uploads directory. LocalStorageProvider re-checks the resolved
 *  path as a second, independent layer. */
export function sanitizeObjectKey(objectKey: string): string {
  const normalized = path.normalize(objectKey);
  if (
    normalized.startsWith('..') ||
    path.isAbsolute(normalized) ||
    normalized.includes('\0')
  ) {
    throw new BadRequestException('Invalid object key');
  }
  return normalized;
}

/** True only when the process is explicitly a production process. Read from
 *  the real environment at module-definition time (before ConfigModule has
 *  loaded any .env file) — a production host always sets NODE_ENV itself. */
export function isProductionProcess(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * DEVELOPMENT-ONLY stand-in for Supabase Storage's presigned PUT/GET
 * (audit H4). It used to live on MaterialsController, unauthenticated and
 * registered in production, so anyone could write files to the API host's
 * disk. Now:
 *   1. StorageModule does not register this controller at all in production
 *      (the routes do not exist -> 404 from the router);
 *   2. even if it were somehow registered, every handler refuses unless the
 *      process is non-production AND the ACTIVE storage provider really is
 *      the local-disk one — with Supabase configured these routes are inert.
 * The unguessable, server-issued object key remains the capability, exactly
 * like a real presigned URL.
 */
@Controller('dev-storage')
export class LocalStorageController {
  constructor(
    private readonly localStorage: LocalStorageProvider,
    @Inject(STORAGE_PROVIDER) private readonly activeProvider: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  private assertLocalMode(): void {
    if (
      this.config.get<string>('app.nodeEnv') === 'production' ||
      isProductionProcess() ||
      this.activeProvider !== this.localStorage
    ) {
      throw new NotFoundException();
    }
  }

  @Put('upload/:objectKey')
  async upload(
    @Param('objectKey') objectKey: string,
    @Req() request: FastifyRequest,
  ) {
    this.assertLocalMode();
    const key = sanitizeObjectKey(decodeURIComponent(objectKey));
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Expected a binary body');
    }
    await this.localStorage.write(key, request.body);
    return { stored: true };
  }

  @Get('download/:objectKey')
  async download(
    @Param('objectKey') objectKey: string,
    @Res() reply: FastifyReply,
  ) {
    this.assertLocalMode();
    const key = sanitizeObjectKey(decodeURIComponent(objectKey));
    let body: Buffer;
    try {
      body = await this.localStorage.read(key);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
    // Helmet's default Cross-Origin-Resource-Policy: same-origin blocks the
    // browser from embedding this cross-origin (API :3001, web :3000) as an
    // <img>; real deployments serve from Supabase's own domain instead.
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return reply.send(body);
  }
}
