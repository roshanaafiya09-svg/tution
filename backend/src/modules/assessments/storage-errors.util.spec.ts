import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '../../common/storage/storage-provider.interface';
import {
  isMissingObjectError,
  readUploadedObject,
} from './storage-errors.util';

const storageThatThrows = (err: unknown) =>
  ({ read: jest.fn().mockRejectedValue(err) }) as unknown as StorageProvider;

describe('isMissingObjectError', () => {
  it('recognises local-disk and S3-style "not there" errors', () => {
    expect(isMissingObjectError({ code: 'ENOENT' })).toBe(true);
    expect(isMissingObjectError({ name: 'NoSuchKey' })).toBe(true);
    expect(isMissingObjectError(new NotFoundException('gone'))).toBe(true);
  });

  it('does not mistake other failures for a missing object', () => {
    expect(isMissingObjectError(new Error('boom'))).toBe(false);
    expect(isMissingObjectError({ code: 'EACCES' })).toBe(false);
    expect(isMissingObjectError(null)).toBe(false);
  });
});

describe('readUploadedObject', () => {
  it('returns the bytes when the object exists', async () => {
    const bytes = Buffer.from('ok');
    const storage = {
      read: jest.fn().mockResolvedValue(bytes),
    } as unknown as StorageProvider;
    await expect(readUploadedObject(storage, 'k', 'scorecard')).resolves.toBe(
      bytes,
    );
  });

  it('turns a missing upload into a 400 the client can act on', async () => {
    await expect(
      readUploadedObject(
        storageThatThrows({ code: 'ENOENT' }),
        'k',
        'scorecard',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets genuine storage faults through so they are still logged as 500s', async () => {
    const boom = new Error('storage down');
    await expect(
      readUploadedObject(storageThatThrows(boom), 'k', 'scorecard'),
    ).rejects.toBe(boom);
  });
});
