export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  /** Extra headers the client must send with the PUT, if any. */
  headers?: Record<string, string>;
}

/**
 * Blueprint §6: "Cloudflare R2 + CDN — signed direct-to-R2 upload, media
 * never touches the API". The API only ever hands out a presigned URL
 * and records the resulting object key, so large files bypass it
 * entirely.
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
