import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresignedUpload, StorageProvider } from './storage-provider.interface';

/**
 * Dev-only stand-in for Supabase Storage that stores files on local disk
 * and serves them through the API itself (see MaterialsController's
 * local-upload/local-download routes). Real deployments use Supabase
 * Storage so media never touches the API — this exists purely so the
 * upload flow is runnable without cloud credentials.
 *
 * The upload/download URLs below are intentionally routed through
 * MaterialsController regardless of which feature is using this shared
 * provider (course materials, tutor avatars, ...) — objectKey alone
 * scopes each file (`batches/...`, `avatars/...`), and Materials'
 * local-upload/local-download handlers are already generic passthroughs
 * keyed only by objectKey, so every caller of StorageModule reuses those
 * same two dev-only routes instead of each feature adding its own.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger('Storage (local)');
  private readonly root: string;
  private readonly apiBaseUrl: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(process.cwd(), 'uploads');
    const port = config.get<number>('app.port') ?? 3001;
    this.apiBaseUrl =
      config.get<string>('storage.localBaseUrl') ?? `http://localhost:${port}`;
  }

  createPresignedUpload(
    objectKey: string,
    mime: string,
  ): Promise<PresignedUpload> {
    this.logger.warn(
      `Storing "${objectKey}" on local disk — configure Supabase Storage for real deployments`,
    );
    return Promise.resolve({
      uploadUrl: `${this.apiBaseUrl}/materials/local-upload/${encodeURIComponent(objectKey)}`,
      objectKey,
      headers: { 'Content-Type': mime },
    });
  }

  createDownloadUrl(objectKey: string): Promise<string> {
    return Promise.resolve(
      `${this.apiBaseUrl}/materials/local-download/${encodeURIComponent(objectKey)}`,
    );
  }

  async write(objectKey: string, body: Buffer): Promise<void> {
    const target = this.resolveKey(objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  read(objectKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(objectKey));
  }

  async delete(objectKey: string): Promise<void> {
    // Matches S3 DeleteObject's idempotent semantics — a missing file
    // is a no-op, not an error.
    try {
      await fs.unlink(this.resolveKey(objectKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  /** Guards against `..` traversal escaping the uploads directory. */
  private resolveKey(objectKey: string): string {
    const target = path.resolve(this.root, objectKey);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error('Invalid object key');
    }
    return target;
  }
}
