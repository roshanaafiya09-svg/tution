import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityRepository } from './availability.repository';
import type { CreateAvailabilityDto } from './dto/create-availability.dto';
import type { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly repository: AvailabilityRepository) {}

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  create(tutorId: string, dto: CreateAvailabilityDto) {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }
    return this.repository.create(tutorId, dto);
  }

  async delete(tutorId: string, id: string): Promise<void> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Availability slot not found');
    if (row.tutor_id !== tutorId)
      throw new ForbiddenException('Not your availability slot');
    await this.repository.delete(id);
  }

  listExceptionsForTutor(tutorId: string) {
    return this.repository.listExceptionsForTutor(tutorId);
  }

  createException(tutorId: string, dto: CreateAvailabilityExceptionDto) {
    if (dto.isAvailable && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException(
        'startTime and endTime are required when isAvailable is true',
      );
    }
    return this.repository.createException(tutorId, dto);
  }

  async deleteException(tutorId: string, id: string): Promise<void> {
    const row = await this.repository.findExceptionById(id);
    if (!row) throw new NotFoundException('Availability exception not found');
    if (row.tutor_id !== tutorId)
      throw new ForbiddenException('Not your availability exception');
    await this.repository.deleteException(id);
  }
}
