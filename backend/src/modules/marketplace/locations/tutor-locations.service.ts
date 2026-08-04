import { Injectable } from '@nestjs/common';
import { TutorLocationsRepository } from './tutor-locations.repository';
import type { UpsertTutorLocationDto } from './dto/upsert-tutor-location.dto';

@Injectable()
export class TutorLocationsService {
  constructor(private readonly repository: TutorLocationsRepository) {}

  getOwn(tutorId: string) {
    return this.repository.findByTutorId(tutorId);
  }

  upsert(tutorId: string, dto: UpsertTutorLocationDto) {
    return this.repository.upsert(
      tutorId,
      dto.city,
      dto.areaLabel ?? null,
      dto.lat,
      dto.lng,
    );
  }
}
