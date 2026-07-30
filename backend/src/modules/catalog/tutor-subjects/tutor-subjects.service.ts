import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorSubjectsRepository } from './tutor-subjects.repository';
import type { CreateTutorSubjectDto } from './dto/create-tutor-subject.dto';

@Injectable()
export class TutorSubjectsService {
  constructor(private readonly repository: TutorSubjectsRepository) {}

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  create(tutorId: string, dto: CreateTutorSubjectDto) {
    if (dto.gradeMax < dto.gradeMin) {
      throw new BadRequestException(
        'gradeMax must be greater than or equal to gradeMin',
      );
    }
    return this.repository.create(tutorId, dto);
  }

  async delete(tutorId: string, id: string): Promise<void> {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new NotFoundException('Tutor subject not found');
    }
    if (row.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your subject offering');
    }
    await this.repository.delete(id);
  }
}
