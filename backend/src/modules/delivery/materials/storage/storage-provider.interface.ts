export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  /** Extra headers the client must send with the PUT, if any. */
  headers?: Record<string, string>;
}

/**
 * Blueprint §6 originally called for Cloudflare R2; swapped to Supabase
 * Storage (also S3-compatible) since both R2 and Firebase Storage now
 * require a linked billing account just to create a bucket, even on
 * their free tiers. Either way, the API only ever hands out a presigned
 * URL and records the resulting object key, so large files bypass it
 * entirely — that contract doesn't change with the provider.
 */
export interface StorageProvider {
  createPresignedUpload(
    objectKey: string,
    mime: string,
  ): Promise<PresignedUpload>;
  createDownloadUrl(
    objectKey: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  /** A deliberate, narrow exception to "media never touches the API" —
   *  the AI quiz generator (blueprint §8) needs the actual PDF bytes
   *  server-side to extract text; humans still only ever get a
   *  presigned URL via createDownloadUrl above. */
  read(objectKey: string): Promise<Buffer>;
}
