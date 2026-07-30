import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignedUpload, StorageProvider } from './storage-provider.interface';

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 15 * 60;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60 * 60;

/**
 * Cloudflare R2 via its S3-compatible API. Selected automatically when
 * R2 credentials are configured (see DeliveryModule).
 *
 * Not exercised end-to-end here — there's no R2 account in this
 * environment — so verify bucket CORS allows the PUT from the web/mobile
 * origin before relying on direct browser uploads.
 */
@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.getOrThrow<string>('storage.accountId');
    this.bucket = this.config.getOrThrow<string>('storage.bucket');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
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
  ): Promise<PresignedUpload> {
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: mime,
      }),
      { expiresIn: DEFAULT_UPLOAD_EXPIRY_SECONDS },
    );

    return { uploadUrl, objectKey, headers: { 'Content-Type': mime } };
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
}
