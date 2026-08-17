import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignedUpload, StorageProvider } from './storage-provider.interface';

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 15 * 60;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60 * 60;

/**
 * Supabase Storage via its S3-compatible API (enabled per-project under
 * Storage settings → S3 Connection, which is where the access key/secret
 * pair and region string below come from — they're not the project's
 * regular API keys). Chosen over Cloudflare R2 and Firebase Storage
 * because both of those now require a linked billing account/credit
 * card just to create a bucket, even on their free tiers; Supabase's
 * free-tier storage does not. Selected automatically when Supabase
 * credentials are configured (see StorageModule).
 *
 * Supabase's S3 endpoint requires path-style addressing
 * (bucket-in-path, not virtual-hosted-style subdomain) — forcePathStyle
 * is required here, not optional, or every request 404s.
 *
 * Not exercised end-to-end here — there's no Supabase project in this
 * environment — so verify bucket CORS allows the PUT from the
 * web/mobile origin before relying on direct browser uploads (Storage →
 * bucket → Policies, or the CORS config under project settings).
 */
@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const projectRef = this.config.getOrThrow<string>('storage.projectRef');
    this.bucket = this.config.getOrThrow<string>('storage.bucket');

    this.client = new S3Client({
      region: this.config.getOrThrow<string>('storage.region'),
      endpoint: `https://${projectRef}.supabase.co/storage/v1/s3`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('storage.accessKeyId'),
        secretAccessKey: this.config.getOrThrow<string>(
          'storage.secretAccessKey',
        ),
      },
    });
  }

  async createPresignedUpload(
    objectKey: string,
    mime: string,
    sizeBytes?: number,
  ): Promise<PresignedUpload> {
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: mime,
        ...(sizeBytes !== undefined ? { ContentLength: sizeBytes } : {}),
      }),
      { expiresIn: DEFAULT_UPLOAD_EXPIRY_SECONDS },
    );

    const headers: Record<string, string> = { 'Content-Type': mime };
    if (sizeBytes !== undefined) {
      headers['Content-Length'] = String(sizeBytes);
    }
    return { uploadUrl, objectKey, headers };
  }

  createDownloadUrl(
    objectKey: string,
    expiresInSeconds = DEFAULT_DOWNLOAD_EXPIRY_SECONDS,
  ) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  async read(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body) throw new NotFoundException('Object not found');
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(objectKey: string): Promise<void> {
    // S3's DeleteObject is already idempotent — a missing key returns
    // 204, not an error — so no existence check is needed here.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
}
