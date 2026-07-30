import { Controller, Get, Param } from '@nestjs/common';
import { ReferenceRepository } from './reference.repository';

@Controller('catalog')
export class ReferenceController {
  constructor(private readonly referenceRepository: ReferenceRepository) {}

  @Get('curricula')
  listCurricula() {
    return this.referenceRepository.listCurricula();
  }

  @Get('curricula/:id/grade-levels')
  listGradeLevels(@Param('id') curriculumId: string) {
    return this.referenceRepository.listGradeLevels(curriculumId);
  }

  @Get('subjects')
  listSubjects() {
    return this.referenceRepository.listSubjects();
  }
}
