import { BadRequestException } from '@nestjs/common';
import type { StorageProvider } from '../../common/storage/storage-provider.interface';

/** True when a storage `read` failed only because the object isn't there:
 *  local disk raises ENOENT, S3/Supabase raises NoSuchKey/NotFound. */
export function isMissingObjectError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, name } = err as { code?: unknown; name?: unknown };
  return (
    code === 'ENOENT' ||
    name === 'NoSuchKey' ||
    name === 'NotFound' ||
    name === 'NotFoundException'
  );
}

/** Reads an object a client was supposed to have uploaded first. A client
 *  that skipped or failed that upload (or a key that expired) is a bad
 *  request, not a server fault — without this the raw ENOENT/NoSuchKey
 *  surfaced as an opaque 500. */
export async function readUploadedObject(
  storage: StorageProvider,
  objectKey: string,
  what: string,
): Promise<Buffer> {
  try {
    return await storage.read(objectKey);
  } catch (err) {
    if (isMissingObjectError(err)) {
      throw new BadRequestException(
        `The uploaded ${what} could not be found — upload it again`,
      );
    }
    throw err;
  }
}
