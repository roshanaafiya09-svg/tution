import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaterialsRepository } from './materials.repository';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';
import type { StorageProvider } from './storage/storage-provider.interface';
import { BatchesService } from '../../scheduling/batches/batches.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import {
  CreateMaterialDto,
  MAX_MATERIAL_BYTES,
} from './dto/create-material.dto';

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class MaterialsService {
  constructor(
    private readonly repository: MaterialsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
  ) {}

  /**
   * Step 1 of upload: record the material and hand back a presigned URL.
   * The client PUTs the bytes straight to storage, so the file never
   * passes through the API (blueprint §6).
   */
  async createUploadUrl(tutorId: string, dto: CreateMaterialDto) {
    await this.batchesService.getOwnedBatch(tutorId, dto.batchId);

    if (dto.sizeBytes > MAX_MATERIAL_BYTES) {
      throw new BadRequestException(
        `File is too large (max ${Math.floor(MAX_MATERIAL_BYTES / 1024 / 1024)}MB)`,
      );
    }

    const objectKey = `batches/${dto.batchId}/${randomBytes(8).toString('hex')}${
      MIME_EXTENSIONS[dto.mime] ?? ''
    }`;

    const material = await this.repository.create({
      batchId: dto.batchId,
      tutorId,
      title: dto.title,
      objectKey,
      mime: dto.mime,
      sizeBytes: dto.sizeBytes,
    });

    const upload = await this.storage.createPresignedUpload(
      objectKey,
      dto.mime,
    );
    return { material, upload };
  }

  async listForBatch(userId: string, batchId: string, isTutor: boolean) {
    await this.assertCanAccessBatch(userId, batchId, isTutor);
    return this.repository.listForBatch(batchId);
  }

  async getDownloadUrl(userId: string, materialId: string, isTutor: boolean) {
    const material = await this.repository.findById(materialId);
    if (!material) throw new NotFoundException('Material not found');

    await this.assertCanAccessBatch(userId, material.batch_id, isTutor);

    return {
      url: await this.storage.createDownloadUrl(material.object_key),
      title: material.title,
      mime: material.mime,
    };
  }

  async delete(tutorId: string, materialId: string): Promise<void> {
    const material = await this.repository.findById(materialId);
    if (!material) throw new NotFoundException('Material not found');
    await this.batchesService.getOwnedBatch(tutorId, material.batch_id);
    // Storage first: a failed delete here leaves the DB row (and the
    // file) intact so the caller can retry, rather than leaving a DB
    // row that points at a file that's already gone.
    await this.storage.delete(material.object_key);
    await this.repository.delete(materialId);
  }

  /** Per-batch visibility (blueprint §4): the owning tutor, or an actively enrolled student. */
  private async assertCanAccessBatch(
    userId: string,
    batchId: string,
    isTutor: boolean,
  ): Promise<void> {
    if (isTutor) {
      await this.batchesService.getOwnedBatch(userId, batchId);
      return;
    }

    const enrollment = await this.batchesRepository.findEnrollment(
      batchId,
      userId,
    );
    if (!enrollment || enrollment.status !== 'active') {
      throw new NotFoundException('Material not found');
    }
  }

  /** Local-dev only — see LocalStorageProvider. */
  sanitizeLocalKey(objectKey: string): string {
    const normalized = path.normalize(objectKey);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new BadRequestException('Invalid object key');
    }
    return normalized;
  }
}
